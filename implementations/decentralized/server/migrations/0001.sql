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
);

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

CREATE TABLE IF NOT EXISTS service_instances (
    service_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    type TEXT NOT NULL,
    CHECK (type IN ('bucket', 'indexer'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_service_instances_by_user_id ON service_instances(user_id);

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
