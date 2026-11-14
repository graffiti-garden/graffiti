-- Legacy rows have no reliable arrival time. Exempt them until the audit has
-- identified live originals and seeded their sponsors; do not infer from labels.
ALTER TABLE inbox_messages ADD COLUMN created_at INTEGER;
CREATE INDEX idx_expiring_shared_messages ON inbox_messages(created_at, message_seq)
    WHERE inbox_seq = 0 AND created_at IS NOT NULL;

-- SQLite can reuse the largest INTEGER PRIMARY KEY after deletion. Keep a
-- separate high-water mark so garbage collection cannot invalidate pagination.
CREATE TABLE inbox_sequence (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    value INTEGER NOT NULL
) STRICT;
INSERT INTO inbox_sequence (id, value)
    SELECT 1, COALESCE(MAX(message_seq), 0) FROM inbox_messages;
