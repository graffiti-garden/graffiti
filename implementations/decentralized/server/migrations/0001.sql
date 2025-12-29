---------------------------------------
-- vvvvvvvvv Authentication vvvvvvvvvvv
---------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY, -- random id for session
    user_id TEXT NOT NULL,
    secret_hash BLOB NOT NULL, -- sha256 of random secret
    last_verified_at INTEGER NOT NULL, -- unix seconds
    created_at INTEGER NOT NULL -- unix seconds
) STRICT;

CREATE TABLE IF NOT EXISTS passkey_registration_challenges (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    challenge TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS passkey_authentication_challenges (
    session_id TEXT PRIMARY KEY,
    challenge TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS passkeys (
    credential_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credential_type TEXT NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    device_type TEXT NOT NULL,
    backed_up INTEGER NOT NULL CHECK (backed_up IN (0, 1)),
    created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS oauth_codes (
    code TEXT PRIMARY KEY,
    redirect_uri TEXT NOT NULL,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

---------------------------------------
-- ^^^^^^^^^ Authentication ^^^^^^^^^^^
---------------------------------------

CREATE TABLE IF NOT EXISTS services (
    service_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    type TEXT NOT NULL,
    CHECK (type IN ('bucket', 'indexer'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_services_by_user_id ON services(user_id, service_id);

CREATE TABLE IF NOT EXISTS handles (
    name TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    services TEXT,
    also_known_as TEXT,
    created_at INTEGER NOT NULL,
    CHECK (LENGTH(name) > 0 AND LENGTH(name) <= 64),
    CHECK (name NOT GLOB '*[^a-zA-Z0-9_-]*')
) STRICT;

CREATE INDEX IF NOT EXISTS idx_handles_by_user_id ON handles(user_id);

CREATE TABLE IF NOT EXISTS actors (
    did TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    secret_key BLOB NOT NULL,
    cid TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_actors_by_user_id ON actors(user_id);


---------------------------------------
-- vvvvvvvvv Announcements vvvvvvvvvvv
---------------------------------------

PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS indexers (
    indexer_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_indexers_by_user_id ON indexers(user_id, indexer_id);

CREATE TABLE IF NOT EXISTS announcements (
  announcement_id TEXT PRIMARY KEY,
  indexer_id      TEXT NOT NULL,
  tombstone       INTEGER NOT NULL CHECK (tombstone IN (0, 1)),
  data            TEXT NOT NULL,
  tags            TEXT NOT NULL,

  FOREIGN KEY (indexer_id) REFERENCES indexers(indexer_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_announcements_by_indexer_id ON announcements(indexer_id);

-- Maintain a logical clock that increments with each announcement.
-- This means we will not miss any announements if we attempt to get
-- all announcements after a particular one.
CREATE TABLE IF NOT EXISTS announcement_clock (
    id    INTEGER PRIMARY KEY CHECK (id = 1),
    value INTEGER NOT NULL
) STRICT;
INSERT OR IGNORE INTO announcement_clock (id, value) VALUES (1, 0);
CREATE TRIGGER IF NOT EXISTS bump_announcement_clock
AFTER INSERT ON announcements
BEGIN
    UPDATE announcement_clock
        SET value = value + 1
        WHERE id = 1;
END;

CREATE TABLE IF NOT EXISTS announcement_tags (
    announcement_id   TEXT NOT NULL,
    tag               TEXT NOT NULL,
    indexer_id        TEXT NOT NULL,
    created_at        INTEGER NOT NULL,

    PRIMARY KEY (announcement_id, tag),
    FOREIGN KEY (announcement_id) REFERENCES announcements(announcement_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_announcement_tags
    ON announcement_tags(indexer_id, tag, created_at DESC, announcement_id);
CREATE INDEX IF NOT EXISTS idx_announcement_tags_by_announcement_id
    ON announcement_tags(announcement_id, tag);

CREATE TABLE IF NOT EXISTS announcement_labels (
    announcement_id TEXT NOT NULL,
    user_id         TEXT NOT NULL,
    label           INTEGER NOT NULL CHECK (label > 0),

    PRIMARY KEY (announcement_id, user_id),
    FOREIGN KEY (announcement_id) REFERENCES announcements(announcement_id) ON DELETE CASCADE
) STRICT;

---------------------------------------
-- ^^^^^^^^^ Announcements ^^^^^^^^^^^
---------------------------------------
