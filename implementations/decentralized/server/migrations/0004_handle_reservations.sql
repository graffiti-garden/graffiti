-- A handle stays reserved for 15 minutes while its owner creates a passkey.
-- Retrying the registration renews the reservation by updating created_at.
CREATE TABLE handle_reservations (
    name TEXT PRIMARY KEY,
    session_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,

    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
) STRICT;
