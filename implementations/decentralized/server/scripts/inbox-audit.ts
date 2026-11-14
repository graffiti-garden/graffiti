import { decode as dagCborDecode } from "@ipld/dag-cbor";
import { z } from "zod";
import { InboxMessageBaseSchema, type InboxMessageBase } from "../../client/src/1-services/4-inboxes/messages";
import { GraffitiDecentralized } from "../../client/src/3-protocol/4-graffiti";

const Hex = z.string().regex(/^(?:[0-9a-f]{2})*$/i);
export const AuditRow = z.object({
  message_seq: z.int().positive(), message_id: z.string(), hash: Hex.length(64),
  tags: Hex, object: z.string(), metadata: Hex,
  created_at: z.int().nullable(), inbox_id: z.string(), account_id: z.int().nonnegative(),
  recipient: z.string().nullable(), sponsor_account_id: z.int().positive().nullable(),
});
export type AuditRow = z.infer<typeof AuditRow>;
export type AuditStatus = "verified" | "hint" | "missing" | "invalid" | "unavailable" | "unresolved-sponsor";
export type AuditResult = { sequence: number; url?: string; status: AuditStatus; sponsor: number | null };
type Verify = (inbox: string, message: InboxMessageBase, recipient: string | null) => Promise<AuditStatus>;

export function parseSnapshot(value: unknown): AuditRow[] {
  // This is the output of `wrangler d1 execute ... --json` for one SELECT.
  return z.array(z.object({ results: z.array(AuditRow) })).parse(value).flatMap((batch) => batch.results);
}

export class InboxAuditor extends GraffitiDecentralized {
  constructor() { super({ defaultInboxEndpoints: [] }); }

  readonly verify: Verify = async (inbox, message, recipient) => {
    // Reuse the client's validation, including private tickets, record kinds,
    // DID resolution, and bounded storage reads. This path never sends or pins.
    const result = await this.processOneInboxMessage(inbox, message, undefined, recipient);
    if (!result) return "missing";
    return "error" in result ? result.retryable ? "unavailable" : "invalid" : "verified";
  };
}

export async function auditRows(rows: AuditRow[], origin: string, verify: Verify) {
  const results: AuditResult[] = [];
  const statements = ["-- Reviewed verified originals only. No deletes; no writes for unresolved rows."];
  const audit = async (row: AuditRow): Promise<AuditResult> => {
    let message: InboxMessageBase;
    try {
      message = InboxMessageBaseSchema.parse({ id: row.message_id, m: {
        t: dagCborDecode(Buffer.from(row.tags, "hex")), o: JSON.parse(row.object),
        m: dagCborDecode(Buffer.from(row.metadata, "hex")),
      } });
    } catch { return { sequence: row.message_seq, status: "invalid", sponsor: row.sponsor_account_id }; }
    const base = { sequence: row.message_seq, url: message.m.o.url, sponsor: row.sponsor_account_id };
    let metadata: unknown;
    try { metadata = dagCborDecode(message.m.m); }
    catch { return { ...base, status: "invalid" }; }
    if (metadata && typeof metadata === "object" &&
      (("d" in metadata && metadata.d === true) || ("t" in metadata && typeof metadata.t === "string"))) {
      return { ...base, status: "hint" };
    }
    // The account mapping is local evidence of who can sponsor this entry.
    if (row.sponsor_account_id === null || (row.account_id !== 0 && !row.recipient)) {
      return { ...base, status: "unresolved-sponsor" };
    }
    try {
      return { ...base, status: await verify(`${origin}/i/${encodeURIComponent(row.inbox_id)}`, message, row.recipient) };
    } catch { return { ...base, status: "unavailable" }; }
  };

  // Bound parallel work and let the existing storage client batch nearby reads.
  for (let start = 0; start < rows.length; start += 32) {
    const chunk = rows.slice(start, start + 32);
    const checked = await Promise.all(chunk.map(audit));
    results.push(...checked);
    for (const [index, result] of checked.entries()) {
      if (result.status !== "verified" || result.sponsor === null) continue;
      const row = chunk[index];
      // Numeric IDs/hex hashes were validated at the input boundary. Recheck
      // identity/ownership when applying the plan, which may happen much later.
      const identity = `m.message_seq = ${row.message_seq} AND m.hash = X'${row.hash}'`;
      const owner = `(m.inbox_seq = 0 AND EXISTS (SELECT 1 FROM actors a WHERE a.did = json_extract(m.object, '$.actor') AND a.account_id = ${result.sponsor}))
          OR (m.inbox_seq != 0 AND EXISTS (SELECT 1 FROM inboxes i WHERE i.inbox_seq = m.inbox_seq AND i.account_id = ${result.sponsor}))`;
      statements.push(`INSERT INTO inbox_message_pins (message_seq, account_id)
  SELECT m.message_seq, ${result.sponsor} FROM inbox_messages m WHERE ${identity} AND (${owner})
  ON CONFLICT (message_seq, account_id) DO NOTHING;`);
      // A partial application is safe: never timestamp the legacy row unless
      // its pin exists. Retrying does not renew an already assigned timestamp.
      statements.push(`UPDATE inbox_messages AS m SET created_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
  WHERE ${identity} AND (${owner}) AND m.created_at IS NULL
    AND EXISTS (SELECT 1 FROM inbox_message_pins p WHERE p.message_seq = m.message_seq AND p.account_id = ${result.sponsor});`);
    }
  }
  return { results, sql: statements.join("\n\n") + "\n" };
}
