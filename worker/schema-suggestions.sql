-- Suggestions d'objets entre membres d'un groupe online : A propose un objet
-- pour le perso de B ; B accepte (l'objet est coché) ou refuse.
-- Appliquer : npx wrangler@4.121.0 d1 execute ogs-rooms --remote --file=schema-suggestions.sql
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  from_user_id TEXT NOT NULL,
  group_id TEXT,
  created INTEGER NOT NULL,
  UNIQUE (char_id, kind, item_id)
);
CREATE INDEX IF NOT EXISTS idx_suggestions_char ON suggestions(char_id);
