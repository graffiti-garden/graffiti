PRAGMA foreign_keys=ON;

---------------------------------------
-- vvvvvvvvv Authentication vvvvvvvvvvv
---------------------------------------
CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY,
    created_at INTEGER NOT NULL
) STRICT;

-- Insert "temp user"
INSERT OR IGNORE INTO users (user_id, created_at) VALUES (-1, 0);
-- Insert "root"
INSERT OR IGNORE INTO users (user_id, created_at) VALUES (0, 0);

CREATE TABLE IF NOT EXISTS sessions (
    session_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    secret_hash BLOB NOT NULL,
    last_verified_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS passkey_registration_challenges (
    session_id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    challenge TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS passkey_authentication_challenges (
    session_id INTEGER PRIMARY KEY,
    challenge TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS passkeys (
    credential_id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    credential_type TEXT NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    device_type TEXT NOT NULL,
    backed_up INTEGER NOT NULL CHECK (backed_up IN (0, 1)),
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS oauth_codes (
    code TEXT PRIMARY KEY,
    redirect_uri TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

---------------------------------------
-- ^^^^^^^^^ Authentication ^^^^^^^^^^^
---------------------------------------

CREATE TABLE IF NOT EXISTS storage_buckets (
    bucket_seq INTEGER PRIMARY KEY,
    bucket_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_storage_buckets_by_bucket_id ON storage_buckets(bucket_id);
CREATE INDEX IF NOT EXISTS idx_storage_buckets_by_user_id ON storage_buckets(user_id);

CREATE TABLE IF NOT EXISTS handles (
    name TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    services TEXT,
    also_known_as TEXT,
    created_at INTEGER NOT NULL,
    CHECK (LENGTH(name) > 0 AND LENGTH(name) <= 64),
    CHECK (name NOT GLOB '*[^a-zA-Z0-9_-]*'),

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_handles_by_user_id ON handles(user_id);

CREATE TABLE IF NOT EXISTS actors (
    did TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    secret_key BLOB NOT NULL,
    cid TEXT NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_actors_by_user_id ON actors(user_id);

---------------------------------------
-- vvvvvvvvv Inboxes vvvvvvvvvvv
---------------------------------------

CREATE TABLE IF NOT EXISTS inboxes (
    inbox_seq INTEGER PRIMARY KEY,
    inbox_id TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inboxes_by_inbox_id ON inboxes(inbox_id);
CREATE INDEX IF NOT EXISTS idx_inboxes_by_user_id ON inboxes(user_id);

-- Insert the shared inbox
INSERT OR IGNORE INTO inboxes (inbox_seq, inbox_id, user_id, created_at)
    VALUES (0, 'shared', 0, 0);

CREATE TABLE IF NOT EXISTS inbox_messages (
  seq             INTEGER PRIMARY KEY,
  message_id      TEXT NOT NULL,
  inbox_seq       INTEGER NOT NULL,
  hash            BLOB NOT NULL UNIQUE,
  tags            BLOB NOT NULL,
  object          TEXT NOT NULL,
  metadata        BLOB NOT NULL,

  FOREIGN KEY (inbox_seq) REFERENCES inboxes(inbox_seq) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inbox_messages_by_seq ON inbox_messages(inbox_seq, seq ASC);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_by_message_id ON inbox_messages(inbox_seq, message_id);
CREATE INDEX IF NOT EXISTS idx_inbox_messages_by_hash ON inbox_messages(inbox_seq, hash);

CREATE TABLE IF NOT EXISTS inbox_message_tags (
    message_seq     INTEGER NOT NULL,
    tag             BLOB NOT NULL,
    inbox_seq       INTEGER NOT NULL,

    PRIMARY KEY (message_seq, tag),
    FOREIGN KEY (message_seq) REFERENCES inbox_messages(seq) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_inbox_message_tags
    ON inbox_message_tags(inbox_seq, tag, message_seq ASC);
CREATE INDEX IF NOT EXISTS idx_inbox_message_tags_by_message_seq
    ON inbox_message_tags(message_seq, tag);

CREATE TABLE IF NOT EXISTS inbox_message_labels (
    message_seq     INTEGER NOT NULL,
    user_id         INTEGER NOT NULL,
    label           INTEGER NOT NULL CHECK (label > 0),

    PRIMARY KEY (message_seq, user_id),
    FOREIGN KEY (message_seq) REFERENCES inbox_messages(seq) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;
---------------------------------------
-- ^^^^^^^^^ Inboxes ^^^^^^^^^^^
---------------------------------------
