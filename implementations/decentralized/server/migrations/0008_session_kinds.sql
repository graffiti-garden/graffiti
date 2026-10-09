-- Browser sessions and OAuth tokens were previously indistinguishable. Old
-- sessions have no kind, so they cannot be trusted as account login cookies.
ALTER TABLE sessions ADD COLUMN kind TEXT;
