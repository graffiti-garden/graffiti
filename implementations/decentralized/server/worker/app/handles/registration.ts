import { HTTPException } from "hono/http-exception";
import { identifierToHandle } from "../../../shared/did-schemas";

export const CHALLENGE_MAX_AGE = 15 * 60 * 1000; // Passkey challenges and handle reservations

export async function getAccountHandle(db: D1Database, accountId: number, baseHost: string) {
  const row = await db.prepare("SELECT identifier FROM handles WHERE account_id = ?")
    .bind(accountId)
    .first<{ identifier: string }>();
  if (!row) throw new Error("Account has no handle.");
  return identifierToHandle(row.identifier, baseHost);
}

export async function isHandleAvailable(
  db: D1Database,
  localName: string,
  sessionId = -1,
) {
  const info = await db.prepare(
    `SELECT 1 FROM handles WHERE identifier = ?
     UNION SELECT 1 FROM handle_reservations
     WHERE name = ? AND created_at > ? AND session_id <> ?`,
  )
    .bind(localName, localName, Date.now() - CHALLENGE_MAX_AGE, sessionId)
    .first();
  return !info;
}

function checkLocalName(localName: string) {
  if (typeof localName !== "string" || !/^[a-z0-9_-]{1,64}$/.test(localName)) {
    throw new HTTPException(400, { message: "Handle is invalid." });
  }
}

export async function reserveHandle(
  db: D1Database,
  localName: string,
  sessionId: number,
) {
  checkLocalName(localName);
  const existing = await db.prepare("SELECT 1 FROM handles WHERE identifier = ?")
    .bind(localName)
    .first();
  if (existing) {
    throw new HTTPException(409, { message: "Handle already exists." });
  }

  const now = Date.now();
  const reserved = await db.prepare(
    `INSERT INTO handle_reservations (name, session_id, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       session_id = excluded.session_id,
       created_at = excluded.created_at
     WHERE handle_reservations.session_id = excluded.session_id
        OR handle_reservations.created_at <= ?`,
  )
    .bind(localName, sessionId, now, now - CHALLENGE_MAX_AGE)
    .run();
  if (!reserved.meta.changes) {
    throw new HTTPException(409, { message: "Handle is being registered." });
  }

  // A retried passkey prompt can choose a different handle. Release the old one.
  await db.prepare(
    "DELETE FROM handle_reservations WHERE session_id = ? AND name <> ?",
  )
    .bind(sessionId, localName)
    .run();
}

// If the reservation is missing or expired, the subquery returns NULL. The
// handle insert then fails, rolling back the passkey insert in the same batch.
export function prepareHandleInsertFromReservation(
  db: D1Database,
  accountId: number,
  sessionId: number,
) {
  const now = Date.now();
  return db.prepare(
    `INSERT INTO handles (account_id, identifier, created_at)
     VALUES (?, (
       SELECT name FROM handle_reservations
       WHERE session_id = ? AND created_at > ?
     ), ?)`,
  ).bind(accountId, sessionId, now - CHALLENGE_MAX_AGE, now);
}

export function prepareHandleReplacement(
  db: D1Database,
  accountId: number,
  identifier: string,
  sessionId: number,
) {
  const now = Date.now();
  // An external DID is verified by its document. A local name must still be
  // reserved by this session when the row is replaced; otherwise NULL makes
  // the insert fail and rolls back the actor CID update in the same batch.
  const insert = identifier.startsWith("did:web:")
    ? db.prepare(
        `INSERT INTO handles (identifier, account_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET identifier = excluded.identifier, created_at = excluded.created_at`,
      ).bind(identifier, accountId, now)
    : db.prepare(
        `INSERT INTO handles (identifier, account_id, created_at)
         VALUES ((SELECT name FROM handle_reservations
                  WHERE name = ? AND session_id = ? AND created_at > ?), ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET identifier = excluded.identifier, created_at = excluded.created_at`,
      ).bind(identifier, sessionId, now - CHALLENGE_MAX_AGE, accountId, now);
  return insert;
}
