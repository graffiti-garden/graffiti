-- Replace 'name' with 'identifier'.
-- An identifier can either be:
-- - A local name such as "alice", which is shorthand for "alice.graffiti.actor"
-- - An external DID such as "did:web:alice.com"
-- Local names keep the lowercase and 1-64 character checks;
-- the 'did:web:' prefix distinguishes an external DID.
-- Remove 'services' and 'also_known_as': services come from the actor's PLC
-- document, and the local handle's actor backlink comes from the account's
-- actor. This requires rebuilding the table; 'user_id' stays unique.
CREATE TABLE new_handles (
    identifier TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    CHECK (identifier GLOB 'did:web:*' OR LENGTH(identifier) > 0 AND LENGTH(identifier) <= 64),
    CHECK (identifier GLOB 'did:web:*' OR identifier NOT GLOB '*[^a-z0-9_-]*'),

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
) STRICT;
INSERT INTO new_handles (identifier, user_id, created_at)
SELECT name, user_id, created_at FROM handles;
DROP TABLE handles;
ALTER TABLE new_handles RENAME TO handles;
