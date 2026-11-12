import { prepare, run, scenarios } from "./public/benchmark-node.mjs";
import { mkdir, writeFile } from "node:fs/promises";
await prepare();
for (const s of scenarios)
  for (const mode of ["baseline", "memo"]) await run(s.name, mode);
const results = [];
for (let trial = 0; trial < 5; trial++)
  for (const scenario of trial % 2 ? [...scenarios].reverse() : scenarios)
    for (const mode of trial % 2
      ? ["memo", "baseline"]
      : ["baseline", "memo"]) {
      const cpu = process.cpuUsage();
      const result = {
        ...(await run(scenario.name, mode)),
        trial,
        cpu: process.cpuUsage(cpu),
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
await mkdir(new URL("./results/", import.meta.url), { recursive: true });
await writeFile(
  new URL("./results/node.json", import.meta.url),
  JSON.stringify({ node: process.version, results }, null, 2),
);
