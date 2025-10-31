CREATE TABLE IF NOT EXISTS usernames (
  username TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_usernames_by_user_id ON usernames(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY, -- random id for session
  user_id TEXT NOT NULL,
  secret_hash BLOB NOT NULL, -- sha256 of random secret
  last_verified_at INTEGER NOT NULL, -- unix seconds
  created_at INTEGER NOT NULL -- unix seconds
);

CREATE INDEX IF NOT EXISTS idx_sessions_by_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS registration_options (
    user_id TEXT PRIMARY KEY,
    challenge TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registrations (
    user_id TEXT NOT NULL,
    credential_id TEXT NOT NULL,
    credential_type TEXT NOT NULL,
    public_key BLOB NOT NULL,
    counter INTEGER NOT NULL,
    device_type TEXT NOT NULL,
    backed_up BOOLEAN NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, credential_id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_by_user_id ON registrations(user_id);
