-- Read-only export. Deliberately exclude account secrets and old labels.
SELECT m.message_seq, m.message_id, hex(m.hash) AS hash,
       hex(m.tags) AS tags, m.object, hex(m.metadata) AS metadata,
       m.created_at, i.inbox_id, i.account_id,
       owner.did AS recipient,
       CASE WHEN i.inbox_seq = 0 THEN author.account_id ELSE i.account_id END AS sponsor_account_id
FROM inbox_messages m
JOIN inboxes i ON i.inbox_seq = m.inbox_seq
LEFT JOIN actors owner ON owner.account_id = i.account_id
LEFT JOIN actors author ON author.did = json_extract(m.object, '$.actor')
WHERE m.created_at IS NULL
ORDER BY m.message_seq;
