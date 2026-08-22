import { spawnSync } from "node:child_process";
import process from "node:process";

const forwardedArgs = process.argv.slice(2);
const debug = forwardedArgs.includes("--debug");
const buildArgs = forwardedArgs.filter((argument) => argument !== "--debug");
const napiCommand = process.platform === "win32" ? "napi.cmd" : "napi";

function runBuild(loaderArgs: string[]): void {
  const result = spawnSync(
    napiCommand,
    ["build", "--platform", ...(debug ? [] : ["--release"]), ...loaderArgs, ...buildArgs],
    { stdio: "inherit" },
  );

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// The native artifact is identical for both invocations; only the generated
// JavaScript loader differs. The CLI writes both loaders beside that artifact.
runBuild(["--js", "index.cjs"]);
runBuild(["--esm", "--js", "index.js"]);
