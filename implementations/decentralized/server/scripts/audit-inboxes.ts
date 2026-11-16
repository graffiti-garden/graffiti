import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { auditRows, InboxAuditor, parseSnapshot } from "./inbox-audit";

async function main() {
  const { values } = parseArgs({ options: {
    input: { type: "string" }, report: { type: "string" }, plan: { type: "string" },
    origin: { type: "string", default: "https://graffiti.actor" },
  } });
  if (!values.input || !values.report || !values.plan) {
    throw new Error("Usage: npm run audit:inboxes -- --input snapshot.json --report report.json --plan pins.sql [--origin https://provider]");
  }
  if (resolve(values.report) === resolve(values.plan)) throw new Error("Report and plan must use different files");
  for (const path of [values.report, values.plan]) {
    const exists = await stat(path).then(() => true, (error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return false;
      throw error;
    });
    if (exists) throw new Error(`Output already exists: ${path}`);
  }
  const origin = new URL(values.origin);
  if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("origin must be an HTTPS origin without credentials, path, query, or fragment");
  }
  const rows = parseSnapshot(JSON.parse(await readFile(values.input, "utf8")));
  const auditor = new InboxAuditor();
  const { results, sql } = await auditRows(rows, origin.origin, auditor.verify);
  // Never overwrite an earlier audit or execute the generated SQL.
  await writeFile(values.report, JSON.stringify(results, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  await writeFile(values.plan, sql, { flag: "wx", mode: 0o600 });
  const counts: Record<string, number> = {};
  for (const result of results) counts[result.status] = (counts[result.status] ?? 0) + 1;
  console.log(JSON.stringify({ inspected: results.length, counts, report: values.report, plan: values.plan }));
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });
