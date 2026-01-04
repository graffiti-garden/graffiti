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
-- vvvvvvvvv Inboxes vvvvvvvvvvv
---------------------------------------

PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS inboxes (
    inbox_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inboxes_by_user_id ON inboxes(user_id, inbox_id);

INSERT OR IGNORE INTO inboxes (inbox_id, user_id, created_at)
    VALUES ('public', 'root', 0);

CREATE TABLE IF NOT EXISTS inbox_messages (
  seq             INTEGER PRIMARY KEY,
  inbox_id        TEXT NOT NULL,
  hash            BLOB NOT NULL UNIQUE,
  data            TEXT NOT NULL,
  tags            TEXT NOT NULL,

  FOREIGN KEY (inbox_id) REFERENCES inboxes(inbox_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_by_seq ON inbox_messages(inbox_id, seq ASC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_by_hash ON inbox_messages(inbox_id, hash);

CREATE TABLE IF NOT EXISTS inbox_message_tags (
    message_seq     INTEGER NOT NULL,
    tag             TEXT NOT NULL,
    inbox_id        TEXT NOT NULL,

    PRIMARY KEY (message_seq, tag),
    FOREIGN KEY (message_seq) REFERENCES inbox_messages(seq) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inbox_message_tags
    ON inbox_message_tags(inbox_id, tag, message_seq ASC);
CREATE INDEX IF NOT EXISTS idx_inbox_message_tags_by_message_seq
    ON inbox_message_tags(message_seq, tag);

CREATE TABLE IF NOT EXISTS inbox_message_labels (
    message_seq     INTEGER NOT NULL,
    user_id         TEXT NOT NULL,
    label           INTEGER NOT NULL CHECK (label > 0),

    PRIMARY KEY (message_seq, user_id),
    FOREIGN KEY (message_seq) REFERENCES inbox_messages(seq) ON DELETE CASCADE
) STRICT;
---------------------------------------
-- ^^^^^^^^^ Inboxes ^^^^^^^^^^^
---------------------------------------
