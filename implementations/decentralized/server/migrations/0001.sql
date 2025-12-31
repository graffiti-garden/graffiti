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

CREATE TABLE IF NOT EXISTS storage_buckets (
    bucket_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_storage_buckets_by_user_id ON storage_buckets(user_id, bucket_id);

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

INSERT OR IGNORE INTO indexers (indexer_id, user_id, name, created_at)
    VALUES ('public', 'root', 'The public indexer', 0);

CREATE TABLE IF NOT EXISTS announcements (
  seq             INTEGER PRIMARY KEY,
  indexer_id      TEXT NOT NULL,
  hash            BLOB NOT NULL UNIQUE,
  data            TEXT NOT NULL,
  tags            TEXT NOT NULL,

  FOREIGN KEY (indexer_id) REFERENCES indexers(indexer_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_announcements_by_indexer_id ON announcements(indexer_id, seq ASC);

CREATE TABLE IF NOT EXISTS announcement_tags (
    announcement_seq  INTEGER NOT NULL,
    tag               TEXT NOT NULL,
    indexer_id        TEXT NOT NULL,

    PRIMARY KEY (announcement_seq, tag),
    FOREIGN KEY (announcement_seq) REFERENCES announcements(seq) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_announcement_tags
    ON announcement_tags(indexer_id, tag, announcement_seq ASC);
CREATE INDEX IF NOT EXISTS idx_announcement_tags_by_announcement_seq
    ON announcement_tags(announcement_seq, tag);

CREATE TABLE IF NOT EXISTS announcement_labels (
    announcement_seq INTEGER NOT NULL,
    user_id          TEXT NOT NULL,
    label            INTEGER NOT NULL CHECK (label > 0),

    PRIMARY KEY (announcement_seq, user_id),
    FOREIGN KEY (announcement_seq) REFERENCES announcements(seq) ON DELETE CASCADE
) STRICT;

---------------------------------------
-- ^^^^^^^^^ Announcements ^^^^^^^^^^^
---------------------------------------
