-- An account keeps its actor when its private key is managed elsewhere.
-- A locally managed actor has a secret_key; an externally managed actor does
-- not. PLC is the source of truth for its current revision. user_id stays unique.
CREATE TABLE new_actors (
    did TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    secret_key BLOB,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;
INSERT INTO new_actors (did, user_id, secret_key, created_at)
SELECT did, user_id, secret_key, created_at FROM actors;
DROP TABLE actors;
ALTER TABLE new_actors RENAME TO actors;
CREATE UNIQUE INDEX idx_actors_by_user_id ON actors(user_id);
