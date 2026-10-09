-- The "users" table represents accounts. Rename it and its references so
-- the database uses the same terminology as the account UI and API.
ALTER TABLE users RENAME TO accounts;
ALTER TABLE accounts RENAME COLUMN user_id TO account_id;

ALTER TABLE sessions RENAME COLUMN user_id TO account_id;
ALTER TABLE passkey_registration_challenges RENAME COLUMN user_id TO account_id;
ALTER TABLE passkeys RENAME COLUMN user_id TO account_id;
ALTER TABLE oauth_codes RENAME COLUMN user_id TO account_id;
ALTER TABLE storage_buckets RENAME COLUMN user_id TO account_id;
ALTER TABLE handles RENAME COLUMN user_id TO account_id;
ALTER TABLE actors RENAME COLUMN user_id TO account_id;
ALTER TABLE inboxes RENAME COLUMN user_id TO account_id;
ALTER TABLE inbox_message_labels RENAME COLUMN user_id TO account_id;

-- SQLite updates index definitions when a column is renamed, but not their
-- names. Keep the names in sync with the columns they index.
DROP INDEX idx_storage_buckets_by_user_id;
CREATE UNIQUE INDEX idx_storage_buckets_by_account_id ON storage_buckets(account_id);

DROP INDEX idx_actors_by_user_id;
CREATE UNIQUE INDEX idx_actors_by_account_id ON actors(account_id);

DROP INDEX idx_inboxes_by_user_id;
CREATE UNIQUE INDEX idx_inboxes_by_account_id ON inboxes(account_id);
