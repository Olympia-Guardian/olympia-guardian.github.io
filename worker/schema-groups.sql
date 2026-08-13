-- Groupes (privés et synchronisés) — voir worker/index.js, section « groupes ».
-- Appliquer : npx wrangler@4.121.0 d1 execute ogs-rooms --remote --file=schema-groups.sql
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  shared INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_groups_owner ON groups(owner_user_id);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL,
  char_id INTEGER NOT NULL,
  added_by TEXT,
  added INTEGER NOT NULL,
  PRIMARY KEY (group_id, char_id)
);

CREATE TABLE IF NOT EXISTS group_links (
  user_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  added INTEGER NOT NULL,
  PRIMARY KEY (user_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_group_links_group ON group_links(group_id);
