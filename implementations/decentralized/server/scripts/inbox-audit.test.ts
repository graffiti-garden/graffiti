import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { encode as dagCborEncode } from "@ipld/dag-cbor";
import { GraffitiErrorNotFound } from "@graffiti-garden/api";
import { auditRows, InboxAuditor, parseSnapshot, type AuditRow, type AuditStatus } from "./inbox-audit";

const actor = "did:web:example.test";
const hex = (value: unknown) => Buffer.from(dagCborEncode(value)).toString("hex");
function row(sequence: number): AuditRow {
  return {
    message_seq: sequence, message_id: String(sequence), hash: "ab".repeat(32),
    inbox_id: "shared", account_id: 0, recipient: null, sponsor_account_id: 1,
    created_at: null, tags: hex([]), metadata: hex(dagCborEncode({ k: String(sequence) })),
    object: JSON.stringify({ url: `graffiti:${sequence}`, actor, channels: [], value: {} }),
  };
}

test("validates the export boundary and excludes hints, missing data, and unknown sponsors from the plan", async () => {
  const statuses: AuditStatus[] = ["verified", "missing", "unavailable", "invalid"];
  const rows = Array.from({ length: 6 }, (_, i) => row(i + 1));
  rows[4].metadata = hex(dagCborEncode({ t: "an-untrusted-reference" }));
  rows[5].sponsor_account_id = null;
  const parsed = parseSnapshot([{ results: rows, success: true }]);
  const { results, sql } = await auditRows(parsed, "https://example.test", async (_inbox, message) => statuses[Number(message.id) - 1]);
  assert.deepEqual(results.map((result) => result.status), [...statuses, "hint", "unresolved-sponsor"]);
  assert.equal((sql.match(/INSERT INTO/g) ?? []).length, 1);
  assert.equal((sql.match(/UPDATE inbox_messages/g) ?? []).length, 1);
  assert.doesNotMatch(sql, /DELETE|DROP|graffiti:/);
  assert.throws(() => parseSnapshot([{ results: [{ ...row(1), hash: "'; DROP TABLE inbox_messages;" }] }]));
});

test("generated SQL is idempotent and cannot pin a changed row or renew its arrival", async () => {
  const { sql } = await auditRows([row(1)], "https://example.test", async () => "verified");
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE actors (did TEXT PRIMARY KEY, account_id INTEGER);
      CREATE TABLE inboxes (inbox_seq INTEGER PRIMARY KEY, account_id INTEGER);
      CREATE TABLE inbox_messages (message_seq INTEGER PRIMARY KEY, hash BLOB, inbox_seq INTEGER, object TEXT, created_at INTEGER);
      CREATE TABLE inbox_message_pins (message_seq INTEGER REFERENCES inbox_messages ON DELETE CASCADE, account_id INTEGER, PRIMARY KEY(message_seq, account_id));
      INSERT INTO inboxes VALUES (0, 0);`);
    db.prepare("INSERT INTO actors VALUES (?, ?)").run(actor, 1);
    db.prepare("INSERT INTO inbox_messages VALUES (?, ?, ?, ?, NULL)").run(1, Buffer.from(row(1).hash, "hex"), 0, row(1).object);
    db.exec(sql);
    assert.equal(db.prepare("SELECT count(*) AS n FROM inbox_message_pins").get()!.n, 1);
    db.exec("UPDATE inbox_messages SET created_at = 123");
    db.exec(sql);
    assert.equal(db.prepare("SELECT created_at FROM inbox_messages").get()!.created_at, 123);
    db.exec("DELETE FROM inbox_messages");
    db.prepare("INSERT INTO inbox_messages VALUES (?, ?, ?, ?, NULL)").run(1, Buffer.from("cd".repeat(32), "hex"), 0, row(1).object);
    db.exec(sql);
    assert.equal(db.prepare("SELECT count(*) AS n FROM inbox_message_pins").get()!.n, 0);
    assert.equal(db.prepare("SELECT created_at FROM inbox_messages").get()!.created_at, null);
  } finally { db.close(); }
});

class FixtureAuditor extends InboxAuditor {
  bytes?: Uint8Array;
  readError?: Error;
  constructor() {
    super();
    this.dids.resolve = async () => ({ id: actor, service: [{ id: "#graffitiStorageBucket", type: "GraffitiStorageBucket", serviceEndpoint: "https://example.test/storage" }] });
    this.storageBuckets.get = async () => {
      if (this.readError) throw this.readError;
      if (!this.bytes) throw new Error("No fixture");
      return this.bytes;
    };
  }
  async original() {
    const encoded = await this.objectEncoding.encode({ value: { text: "verified" }, channels: [], allowed: [actor] }, actor);
    this.bytes = encoded.objectBytes;
    return { ...row(1), account_id: 1, inbox_id: "personal", recipient: actor,
      object: JSON.stringify(encoded.object), tags: hex(encoded.tags),
      metadata: hex(dagCborEncode({ k: "key", n: [], s: encoded.allowedTickets })),
    };
  }
}

test("uses real object/ticket validation and distinguishes storage absence from a transport failure", async () => {
  const valid = new FixtureAuditor();
  const original = await valid.original();
  const check = async (auditor: FixtureAuditor, input = original) =>
    (await auditRows([input], "https://example.test", auditor.verify)).results[0].status;
  assert.equal(await check(valid), "verified");
  const invalid = new FixtureAuditor();
  invalid.bytes = valid.bytes;
  assert.equal(await check(invalid, { ...original, object: JSON.stringify({ ...JSON.parse(original.object), value: { forged: true } }) }), "invalid");
  const missing = new FixtureAuditor();
  missing.readError = new GraffitiErrorNotFound("Gone");
  assert.equal(await check(missing), "missing");
  const offline = new FixtureAuditor();
  offline.readError = new TypeError("Network down");
  assert.equal(await check(offline), "unavailable");
});
