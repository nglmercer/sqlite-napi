export interface BenchResult {
  label: string;
  avgUs: number;
  minUs: number;
  maxUs: number;
  medianUs: number;
  opsPerSec: number;
  samples: number;
}

export type BenchFn = () => void;

export interface BenchConfig {
  label: string;
  fn: BenchFn;
  warmup?: number;
  iterations?: number;
}

function formatUs(us: number): string {
  if (us >= 1_000_000) return `${(us / 1_000_000).toFixed(3)}s`;
  if (us >= 1_000) return `${(us / 1_000).toFixed(3)}ms`;
  return `${us.toFixed(1)}µs`;
}

export function runBench(config: BenchConfig): BenchResult {
  const warmup = config.warmup ?? 3;
  const iterations = config.iterations ?? 7;

  for (let i = 0; i < warmup; i++) {
    config.fn();
  }

  const times: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = Bun.nanoseconds();
    config.fn();
    const end = Bun.nanoseconds();
    times.push((end - start) / 1000);
  }

  const sorted = [...times].sort((a, b) => a - b);
  const avgUs = times.reduce((a, b) => a + b, 0) / times.length;
  const minUs = sorted[0];
  const maxUs = sorted[sorted.length - 1];
  const medianUs = sorted[Math.floor(sorted.length / 2)];
  const opsPerSec = Math.round(1_000_000 / avgUs);

  return { label: config.label, avgUs, minUs, maxUs, medianUs, opsPerSec, samples: iterations };
}

export function compareResults(
  napi: BenchResult,
  bun: BenchResult,
): { ratio: number; label: string } {
  const ratio = napi.avgUs / bun.avgUs;
  const label = ratio >= 1
    ? `${ratio.toFixed(2)}x slower`
    : `${(1 / ratio).toFixed(2)}x faster`;
  return { ratio, label };
}

export function printHeader(title: string): void {
  console.log();
  console.log(`╔══ ${title} ${"═".repeat(Math.max(2, 60 - title.length))}`);

}

export function printResult(r: BenchResult, lib: string): void {
  const padded = lib.padEnd(16);
  const ops = r.opsPerSec.toLocaleString().padStart(10);
  console.log(
    `  ${padded} ${formatUs(r.avgUs).padStart(10)}  ${ops} ops/s  `
    + `[min:${formatUs(r.minUs)}  med:${formatUs(r.medianUs)}  max:${formatUs(r.maxUs)}]`,
  );
}

export function printComparison(napi: BenchResult, bunRes: BenchResult): void {
  const { label } = compareResults(napi, bunRes);
  const rel = label.padStart(14);
  console.log(`  ${"".padStart(16)} ${"─".repeat(10)}  ${"─".repeat(10)}  ${rel}`);
}

export function runGroup(
  title: string,
  tests: Array<{ label: string; napi: BenchFn; bun: BenchFn; iterations?: number }>,
): void {
  printHeader(title);
  for (const t of tests) {
    const napiR = runBench({ label: t.label, fn: t.napi, iterations: t.iterations ?? 7 });
    const bunR = runBench({ label: t.label, fn: t.bun, iterations: t.iterations ?? 7 });
    printResult(napiR, "sqlite-napi");
    printResult(bunR, "bun:sqlite");
    printComparison(napiR, bunR);
  }
}
