-- Signalements envoyés depuis l'application.
--
-- L'anti-robot principal n'est pas un captcha : c'est l'obligation d'avoir un
-- compte Discord connecté. Un robot n'en a pas, et ceux qui en auraient un
-- sont traçables et bannissables. S'y ajoutent un quota par compte, une borne
-- de longueur, un champ piège invisible, et la limite de débit par IP déjà en
-- place sur le worker.
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT,
  char_id INTEGER,
  tab TEXT,
  message TEXT NOT NULL,
  created INTEGER NOT NULL,
  handled INTEGER NOT NULL DEFAULT 0
);

-- Le quota compte les envois récents d'un compte ; l'admin lit les non traités
-- du plus récent au plus ancien.
CREATE INDEX IF NOT EXISTS idx_reports_user ON reports(user_id, created);
CREATE INDEX IF NOT EXISTS idx_reports_open ON reports(handled, created);
