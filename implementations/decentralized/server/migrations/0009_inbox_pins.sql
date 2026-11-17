-- A pin records which account is keeping an inbox entry. Pins do not expire.
CREATE TABLE inbox_message_pins (
    message_seq INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
    PRIMARY KEY (message_seq, account_id),
    FOREIGN KEY (message_seq) REFERENCES inbox_messages(message_seq) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
) STRICT;
