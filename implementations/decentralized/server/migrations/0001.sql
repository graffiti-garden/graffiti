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
