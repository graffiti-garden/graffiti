-- Existing accounts have been cleaned up, so the lookup indexes can also
-- enforce one handle, actor, bucket, and inbox per user.
DROP INDEX idx_handles_by_user_id;
CREATE UNIQUE INDEX idx_handles_by_user_id ON handles(user_id);

DROP INDEX idx_actors_by_user_id;
CREATE UNIQUE INDEX idx_actors_by_user_id ON actors(user_id);

DROP INDEX idx_storage_buckets_by_user_id;
CREATE UNIQUE INDEX idx_storage_buckets_by_user_id ON storage_buckets(user_id);

DROP INDEX idx_inboxes_by_user_id;
CREATE UNIQUE INDEX idx_inboxes_by_user_id ON inboxes(user_id);
