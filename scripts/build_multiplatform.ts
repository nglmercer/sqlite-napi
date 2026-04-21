import { $ } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import os from "os";

// ── macOS SDK setup ─────────────────────────────────────────────────────────
// cargo-zigbuild needs a real macOS SDK to resolve frameworks like CoreFoundation.
// We cache it at ~/.cache/macos-sdk so it's only downloaded once.
const SDK_VERSION = "13.3";
const SDK_NAME = `MacOSX${SDK_VERSION}.sdk`;
const SDK_URL = `https://github.com/roblabla/MacOSX-SDKs/releases/download/${SDK_VERSION}/${SDK_NAME}.tar.xz`;
const SDK_CACHE_DIR = join(os.homedir(), ".cache", "macos-sdk");
const SDK_PATH = join(SDK_CACHE_DIR, SDK_NAME);

async function ensureMacOSSdk(): Promise<string> {
    if (existsSync(SDK_PATH)) {
        console.log(`  ✓ macOS SDK found at ${SDK_PATH}`);
        return SDK_PATH;
    }

    console.log(`  ⬇  Downloading macOS ${SDK_VERSION} SDK (~60 MB)...`);
    await $`mkdir -p ${SDK_CACHE_DIR}`;
    // Download and extract in one pass
    await $`curl -fsSL ${SDK_URL} | tar -xJ -C ${SDK_CACHE_DIR}`;
    console.log(`  ✓ macOS SDK extracted to ${SDK_PATH}`);
    return SDK_PATH;
}

// ── Build targets ───────────────────────────────────────────────────────────
const targets = [
    { target: "x86_64-pc-windows-msvc", cross: true, apple: false },
    // aarch64-pc-windows-msvc: napi-cross doesn't support this triple from x64 host.
    // We must invoke cargo-xwin directly (which auto-downloads the aarch64 SDK) then
    // call napi build with the xwin env vars set manually.
    { target: "aarch64-pc-windows-msvc", xwinDirect: true, apple: false },
    { target: "x86_64-apple-darwin", cross: true, apple: true },
    { target: "aarch64-apple-darwin", cross: true, apple: true },
    { target: "aarch64-unknown-linux-gnu", cross: true, apple: false },
    { target: "x86_64-unknown-linux-gnu", native: true, apple: false },
] as const;

// ── Main ────────────────────────────────────────────────────────────────────
console.log("🚀 Starting Multiplatform Build Process...\n");

// 1. Install Rust targets
console.log("📦 Ensuring Rust targets are installed...");
for (const { target } of targets) {
    try {
        await $`rustup target add ${target}`.quiet();
    } catch {
        // already installed or unavailable, safe to ignore
    }
}

// 2. Pre-download macOS SDK (shared across both Darwin targets)
let sdkRoot: string | undefined;
const needsApple = targets.some((t) => t.apple);
if (needsApple) {
    console.log("\n🍎 Preparing macOS SDK for cross-compilation...");
    try {
        sdkRoot = await ensureMacOSSdk();
    } catch (e) {
        console.error("  ⚠️  Failed to obtain macOS SDK:", (e as Error).message);
        console.error("     macOS builds will likely fail. Set SDKROOT manually to fix.");
        // Honour a manually set SDKROOT if available
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
            // Host build — no cross-compilation flags needed
            await $`npx napi build --release --platform`;

        } else if ("napiCross" in cfg && cfg.napiCross) {
            // Linux cross (napi-cross docker image / qemu)
            await $`npx napi build --release --target ${target} --use-napi-cross --platform`;

        } else if ("xwinDirect" in cfg && cfg.xwinDirect) {
            // aarch64-pc-windows-msvc: napi-cross toolchain doesn't support this triple
            // from an x64 Linux host. Use cargo-xwin directly by setting XWIN_ARCH so
            // it downloads the ARM64 Windows SDK instead of the default x64 one.
            const env = {
                ...process.env,
                XWIN_ARCH: "aarch64",
                // Ensure cargo picks up xwin's sysroot for the linker
                CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER: "lld-link",
            };
            await $`npx napi build --release --target ${target} --cross-compile --platform`.env(env);

        } else if ("cross" in cfg && cfg.cross) {
            if (cfg.apple && sdkRoot) {
                // macOS cross: set SDKROOT so cargo-zigbuild can find frameworks
                process.env.SDKROOT = sdkRoot;
                await $`npx napi build --release --target ${target} --cross-compile --platform`;
                delete process.env.SDKROOT;
            } else if (cfg.apple) {
                // No SDK available — skip gracefully
                console.warn(`  ⚠️  Skipping ${target}: no macOS SDK available (set SDKROOT to fix)`);
                results.push({ target, success: false });
                continue;
            } else {
                // Linux / Windows / other cross targets (cargo-zigbuild or cargo-xwin)
                await $`npx napi build --release --target ${target} --cross-compile --platform`;
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