CREATE TABLE IF NOT EXISTS handles_lowercase (
    name TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    services TEXT,
    also_known_as TEXT,
    created_at INTEGER NOT NULL,
    CHECK (LENGTH(name) > 0 AND LENGTH(name) <= 64),
    CHECK (name NOT GLOB '*[^a-z0-9_-]*'),

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

INSERT INTO handles_lowercase (name, user_id, services, also_known_as, created_at)
SELECT name, user_id, services, also_known_as, created_at FROM handles;

DROP TABLE handles;
ALTER TABLE handles_lowercase RENAME TO handles;

CREATE INDEX IF NOT EXISTS idx_handles_by_user_id ON handles(user_id);
