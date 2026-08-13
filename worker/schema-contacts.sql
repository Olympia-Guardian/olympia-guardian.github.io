-- Contacts (amis) et blacklist globale, plus les invitations directes de groupe.
-- Amitié : une ligne orientée demandeur → destinataire, status pending puis
-- accepted (la ligne d'origine est conservée, l'amitié se lit dans les 2 sens).

CREATE TABLE IF NOT EXISTS contacts (
  user_id TEXT NOT NULL,
  friend_id TEXT NOT NULL,
  status TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (user_id, friend_id)
);
CREATE INDEX IF NOT EXISTS idx_contacts_friend ON contacts(friend_id);

-- Code de contact partageable (lien #c=…), révocable par régénération.
CREATE TABLE IF NOT EXISTS contact_codes (
  user_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created INTEGER NOT NULL
);

-- Blacklist globale : user_id bloque blocked_id — tout est refusé en silence.
CREATE TABLE IF NOT EXISTS blocks (
  user_id TEXT NOT NULL,
  blocked_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (user_id, blocked_id)
);

-- Invitation directe d'un ami dans un groupe online (acceptée depuis la cloche).
CREATE TABLE IF NOT EXISTS group_invites (
  group_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (group_id, to_user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_invites_to ON group_invites(to_user_id);
