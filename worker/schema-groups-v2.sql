-- Groupes v2 : adhésion sur validation, lien d'invitation révocable, bans.
-- Appliquer : npx wrangler@4.121.0 d1 execute ogs-rooms --remote --file=schema-groups-v2.sql
ALTER TABLE groups ADD COLUMN invite_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_invite ON groups(invite_code);

CREATE TABLE IF NOT EXISTS group_requests (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  char_id INTEGER NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_bans (
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

-- Groupes déjà synchronisés : un code tout neuf (les anciens liens #j=grp-…
-- deviennent invalides, c'est assumé — le créateur re-partage).
UPDATE groups SET invite_code = 'inv-' || lower(hex(randomblob(16)))
  WHERE shared = 1 AND invite_code IS NULL;
