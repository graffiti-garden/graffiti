// Keep entry retention and cursor validity together. Personal inbox expiration
// is disabled; an authenticated account's pins are sticky in either inbox type.
export const INBOX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// Use the database's arrival clock. Legacy NULL timestamps remain exempt until
// an audited migration assigns an arrival time and sponsors verified live data.
export const DATABASE_NOW_MS = "CAST(unixepoch('subsec') * 1000 AS INTEGER)";
export const EXPIRED_MESSAGE_SQL = `m.inbox_seq = 0 AND m.created_at IS NOT NULL
  AND m.created_at <= ${DATABASE_NOW_MS} - ${INBOX_RETENTION_MS}
  AND NOT EXISTS (SELECT 1 FROM inbox_message_pins p WHERE p.message_seq = m.message_seq)`;

export async function collectExpiredMessages(database: D1Database) {
  // Logical expiry applies in queries immediately, independently of this bounded
  // physical cleanup. Foreign keys also remove the entry's tag index rows.
  await database.prepare(`DELETE FROM inbox_messages WHERE message_seq IN (
    SELECT m.message_seq FROM inbox_messages m WHERE ${EXPIRED_MESSAGE_SQL}
    ORDER BY m.created_at, m.message_seq LIMIT 1000
  )`).run();
}
