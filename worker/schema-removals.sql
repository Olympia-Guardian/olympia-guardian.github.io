-- Journal des retraits. Rien d'autre dans l'application ne garde la trace de ce
-- qui disparaît d'une collection : la table `collections` ne contient que
-- l'état courant, et Cloudflare n'offre aucun point de retour sur cette base
-- (Time Travel ne rend que le marque-page « maintenant »). Sans ce journal, un
-- retrait — accidentel, buggé ou malveillant — est définitif et invisible.
--
-- Les retraits sont rares : quelques lignes par mois, contre des milliers de
-- coches. Le coût en écritures D1 est négligeable, la valeur est totale.
CREATE TABLE IF NOT EXISTS removals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  char_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  -- identifiants retirés, tels quels : ils suffisent à tout remettre
  ids TEXT NOT NULL,
  -- combien restaient après le retrait, pour juger de l'ampleur d'un coup d'œil
  restants INTEGER NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_removals_char ON removals(char_id, at DESC);
