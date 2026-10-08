import { HTTPException } from "hono/http-exception";

export const CHALLENGE_MAX_AGE = 15 * 60 * 1000; // Passkey challenges and handle reservations

export async function getHandleName(db: D1Database, userId: number) {
  const handle = await db.prepare("SELECT name FROM handles WHERE user_id = ?")
    .bind(userId)
    .first<{ name: string }>();
  return handle?.name;
}

export async function isHandleAvailable(
  db: D1Database,
  name: string,
  sessionId = -1,
) {
  const info = await db.prepare(
    `SELECT 1 FROM handles WHERE name = ?
     UNION SELECT 1 FROM handle_reservations
     WHERE name = ? AND created_at > ? AND session_id <> ?`,
  )
    .bind(name, name, Date.now() - CHALLENGE_MAX_AGE, sessionId)
    .first();
  return !info;
}

function checkHandleName(name: string) {
  if (typeof name !== "string" || !/^[a-z0-9_-]{1,64}$/.test(name)) {
    throw new HTTPException(400, { message: "Handle is invalid." });
  }
}

export async function reserveHandle(
  db: D1Database,
  name: string,
  sessionId: number,
) {
  checkHandleName(name);
  const existing = await db.prepare("SELECT 1 FROM handles WHERE name = ?")
    .bind(name)
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
    .bind(name, sessionId, now, now - CHALLENGE_MAX_AGE)
    .run();
  if (!reserved.meta.changes) {
    throw new HTTPException(409, { message: "Handle is being registered." });
  }

  // A retried passkey prompt can choose a different handle. Release the old one.
  await db.prepare(
    "DELETE FROM handle_reservations WHERE session_id = ? AND name <> ?",
  )
    .bind(sessionId, name)
    .run();
}

// If the reservation is missing or expired, the subquery returns NULL. The
// handle insert then fails, rolling back the passkey insert in the same batch.
export function prepareHandleInsertFromReservation(
  db: D1Database,
  userId: number,
  sessionId: number,
) {
  const now = Date.now();
  return db.prepare(
    `INSERT INTO handles (user_id, name, created_at)
     VALUES (?, (
       SELECT name FROM handle_reservations
       WHERE session_id = ? AND created_at > ?
     ), ?)`,
  ).bind(userId, sessionId, now - CHALLENGE_MAX_AGE, now);
}

// The ordinary register endpoint refuses handles still reserved by someone
// creating a passkey.
export function prepareHandleInsertFromName(
  db: D1Database,
  userId: number,
  name: string,
  options: {
    services?: string | null;
    alsoKnownAs?: string | null;
  } = {},
) {
  checkHandleName(name);
  const now = Date.now();
  return db.prepare(
    `INSERT INTO handles (user_id, name, created_at, services, also_known_as)
     SELECT ?, ?, ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM handle_reservations WHERE name = ? AND created_at > ?
     )`,
  ).bind(
    userId,
    name,
    now,
    options.services ?? null,
    options.alsoKnownAs ?? null,
    name,
    now - CHALLENGE_MAX_AGE,
  );
}
