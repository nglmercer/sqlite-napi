import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import os from "os";

// ── macOS SDK setup ─────────────────────────────────────────────────────────
const SDK_VERSION = "13.3";
const SDK_NAME = `MacOSX${SDK_VERSION}.sdk`;
const SDK_URL = `https://github.com/roblabla/MacOSX-SDKs/releases/download/${SDK_VERSION}/${SDK_NAME}.tar.xz`;
const SDK_CACHE_DIR = join(os.homedir(), ".cache", "macos-sdk");
const SDK_PATH = join(SDK_CACHE_DIR, SDK_NAME);

// ── LLVM toolchain setup ────────────────────────────────────────────────────
const LLVM_VERSION = "16.0.4";
const LLVM_TAR = `clang+llvm-${LLVM_VERSION}-x86_64-linux-gnu-ubuntu-22.04.tar.xz`;
const LLVM_URL = `https://github.com/llvm/llvm-project/releases/download/llvmorg-${LLVM_VERSION}/${LLVM_TAR}`;
const LLVM_CACHE_DIR = join(os.homedir(), ".cache", "llvm-toolchain");
const LLVM_PATH = join(LLVM_CACHE_DIR, `clang+llvm-${LLVM_VERSION}-x86_64-linux-gnu-ubuntu-22.04`);

async function ensureLLVM(): Promise<string> {
    if (existsSync(join(LLVM_PATH, "bin", "clang"))) {
        console.log(`  ✓ LLVM toolchain found at ${LLVM_PATH}`);
        return LLVM_PATH;
    }

    console.log(`  ⬇  Downloading portable LLVM ${LLVM_VERSION} (~400 MB)...`);
    await $`mkdir -p ${LLVM_CACHE_DIR}`;
    await $`curl -fsSL ${LLVM_URL} | tar -xJ -C ${LLVM_CACHE_DIR}`;
    console.log(`  ✓ LLVM extracted to ${LLVM_PATH}`);
    return LLVM_PATH;
}

async function ensureMacOSSdk(): Promise<string> {
    if (existsSync(SDK_PATH)) {
        console.log(`  ✓ macOS SDK found at ${SDK_PATH}`);
        return SDK_PATH;
    }

    console.log(`  ⬇  Downloading macOS ${SDK_VERSION} SDK (~60 MB)...`);
    await $`mkdir -p ${SDK_CACHE_DIR}`;
    await $`curl -fsSL ${SDK_URL} | tar -xJ -C ${SDK_CACHE_DIR}`;
    console.log(`  ✓ macOS SDK extracted to ${SDK_PATH}`);
    return SDK_PATH;
}

// ── Build targets ───────────────────────────────────────────────────────────
const targets = [
    { target: "x86_64-pc-windows-msvc", xwin: true },
    { target: "aarch64-pc-windows-msvc", xwin: true },
    { target: "x86_64-apple-darwin", apple: true },
    { target: "aarch64-apple-darwin", apple: true },
    { target: "aarch64-unknown-linux-gnu", napiCross: true },
    { target: "x86_64-unknown-linux-gnu", native: true },
] as const;

// ── Tool checks ──────────────────────────────────────────────────────────────
async function checkRequiredTools() {
    const hasClang = (await $`which clang`.quiet().nothrow()).exitCode === 0;
    const hasLld = (await $`which lld`.quiet().nothrow()).exitCode === 0;

    if (!hasClang || !hasLld) {
        console.warn("\n⚠️  Warning: 'clang' or 'lld' not found in PATH.");
        console.warn("   Downloading portable LLVM toolchain for Windows cross-compilation...");
        const llvmPath = await ensureLLVM();
        process.env.PATH = `${join(llvmPath, "bin")}:${process.env.PATH}`;
    }
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log("🚀 Starting Multiplatform Build Process...\n");

await checkRequiredTools();

// 1. Install Rust targets
console.log("📦 Ensuring Rust targets are installed...");
for (const { target } of targets) {
    try {
        await $`rustup target add ${target}`.quiet();
    } catch {
        // already installed or unavailable
    }
}

// 2. Pre-download macOS SDK
let sdkRoot: string | undefined;
if (targets.some(t => "apple" in t)) {
    console.log("\n🍎 Preparing macOS SDK for cross-compilation...");
    try {
        sdkRoot = await ensureMacOSSdk();
    } catch (e) {
        console.error("  ⚠️  Failed to obtain macOS SDK:", (e as Error).message);
        sdkRoot = process.env.SDKROOT;
    }
}

// 3. Sequential builds
const results: { target: string; success: boolean }[] = [];

for (const cfg of targets) {
    const { target } = cfg;
    console.log(`\n🛠️  Building for ${target}...`);

    try {
        if ("native" in cfg && cfg.native) {
            await $`npx napi build --release --platform`;

        } else if ("napiCross" in cfg && cfg.napiCross) {
            await $`npx napi build --release --target ${target} --use-napi-cross --platform`;

        } else if ("xwin" in cfg && cfg.xwin) {
            // Windows MSVC cross-compilation
            const isArm = target.startsWith("aarch64");
            const env = { 
                ...process.env, 
                XWIN_ARCH: isArm ? "aarch64" : "x86_64" 
            };
            // Use --cross-compile which invokes cargo-xwin
            await $`npx napi build --release --target ${target} --cross-compile --platform`.env(env);

        } else if ("apple" in cfg && cfg.apple) {
            if (sdkRoot) {
                const env = { ...process.env, SDKROOT: sdkRoot };
                await $`npx napi build --release --target ${target} --cross-compile --platform`.env(env);
            } else {
                console.warn(`  ⚠️  Skipping ${target}: no macOS SDK`);
                results.push({ target, success: false });
                continue;
            }
        }

        console.log(`✅ Success: ${target}`);
        results.push({ target, success: true });
    } catch (error) {
        console.error(`❌ Failed: ${target}`);
        results.push({ target, success: false });
    }
}

// 4. Summary
console.log("\n📊 Build Summary:");
results.forEach((r) => {
    console.log(`${r.success ? "✅" : "❌"} ${r.target}`);
});

if (results.some((r) => !r.success)) {
    console.log("\n⚠️ Some builds failed. Check the logs above.");
    process.exit(1);
} else {
    console.log("\n✨ All multiplatform builds complete!");
}