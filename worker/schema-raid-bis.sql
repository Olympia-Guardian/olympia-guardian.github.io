-- Le BiS d'un joueur sur un palier : ce qu'il vise, emplacement par
-- emplacement, tel qu'il l'a écrit chez Etro.
--
-- C'est un DOCUMENT, pas une liste d'identifiants cochés : il ne rentre pas
-- dans le mécanisme des collections, qui ne sait faire que des ensembles. D'où
-- cette table, la seule qu'ajoute le suivi d'équipement de raid.
--
-- `pieces` porte { case Etro : identifiant d'objet } en JSON — douze cases au
-- plus. La provenance ne s'y trouve pas : elle se déduit du catalogue du
-- palier, qui dit quel objet tombe en savage et lequel s'achète en mémoquartz.
--
-- Appliquer : npx wrangler@4.121.0 d1 execute ogs-rooms --remote --file=schema-raid-bis.sql
CREATE TABLE IF NOT EXISTS raid_bis (
  char_id INTEGER NOT NULL,
  tier    TEXT    NOT NULL,
  job     TEXT,
  nom     TEXT,
  url     TEXT,
  pieces  TEXT    NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (char_id, tier)
);
