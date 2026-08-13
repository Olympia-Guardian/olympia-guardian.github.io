-- Schéma de base (référence + init d'un environnement local wrangler dev).
-- La base distante existe déjà : ce fichier ne sert qu'aux tests locaux.
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  doc TEXT NOT NULL,
  updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  server TEXT,
  dc TEXT,
  avatar TEXT,
  portrait TEXT,
  public_mounts INTEGER NOT NULL DEFAULT 1,
  public_minions INTEGER NOT NULL DEFAULT 1,
  updated INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS collections (
  char_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  ids TEXT NOT NULL,
  updated INTEGER NOT NULL,
  source TEXT,
  PRIMARY KEY (char_id, kind)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  name TEXT,
  avatar TEXT,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  expires INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bindings (
  user_id TEXT NOT NULL,
  char_id INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  code TEXT,
  created INTEGER NOT NULL,
  PRIMARY KEY (user_id, char_id)
);
