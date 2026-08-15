-- Compteurs journaliers des évènements qui ne laissent aucune trace ailleurs.
--
-- Ces trois signaux ne se déduisent d'aucune donnée existante : un scrape qui
-- échoue, une erreur du worker ou une requête refusée par la limite de débit
-- ne laissent rien derrière eux. Sans ce comptage, une panne du Lodestone ou
-- un changement de son HTML resteraient invisibles jusqu'à ce qu'un joueur
-- s'en plaigne.
--
-- Une ligne par jour et par clé, incrémentée à la volée : le volume reste
-- minuscule (quelques lignes par jour) contrairement à un journal évènementiel.
CREATE TABLE IF NOT EXISTS metrics (
  jour TEXT NOT NULL,
  cle TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (jour, cle)
);
