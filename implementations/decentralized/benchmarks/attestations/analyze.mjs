import { readFile } from "node:fs/promises";
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2;
};
for (const file of process.argv.slice(2)) {
  const data = JSON.parse(await readFile(file, "utf8"));
  console.log(
    file,
    JSON.stringify({ completed: data.completed, error: data.error }),
  );
  for (const scenario of new Set(data.results.map((r) => r.scenario)))
    for (const mode of ["baseline", "memo"]) {
      const rows = data.results.filter(
        (r) => r.scenario === scenario && r.mode === mode,
      );
      console.log(
        JSON.stringify({
          scenario,
          mode,
          trials: rows.length,
          medianMs: median(rows.map((r) => r.ms)),
          minMs: Math.min(...rows.map((r) => r.ms)),
          maxMs: Math.max(...rows.map((r) => r.ms)),
          verificationCalls: rows.map((r) => r.verificationCalls),
          alteredBytesRejected: rows.every((r) => r.alteredBytesRejected),
          ...(rows[0].cpu
            ? {
                medianProcessCpuMs: median(
                  rows.map((r) => (r.cpu.user + r.cpu.system) / 1000),
                ),
              }
            : {}),
        }),
      );
    }
}
