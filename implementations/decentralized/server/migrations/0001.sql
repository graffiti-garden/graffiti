CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY, -- random id for session
    user_id TEXT NOT NULL,
    secret_hash BLOB NOT NULL, -- sha256 of random secret
    last_verified_at INTEGER NOT NULL, -- unix seconds
    created_at INTEGER NOT NULL -- unix seconds
);

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
);

CREATE TABLE IF NOT EXISTS passkeys (
    credential_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    credential_type TEXT NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    device_type TEXT NOT NULL,
    backed_up BOOLEAN NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS actors (
    actor TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    CHECK (LENGTH(actor) > 0 AND LENGTH(actor) <= 255),
    CHECK (actor NOT GLOB '*[^a-zA-Z0-9._~-]*')
);

CREATE INDEX IF NOT EXISTS idx_actors_by_user_id ON actors(user_id);

CREATE TRIGGER IF NOT EXISTS trg_max5_actors_per_user
BEFORE INSERT ON actors
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM actors WHERE user_id = NEW.user_id) >= 5
BEGIN
  SELECT RAISE(ABORT, 'max_actors_reached');
END;
