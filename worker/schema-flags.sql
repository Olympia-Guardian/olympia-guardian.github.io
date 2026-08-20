-- Interrupteurs : de quoi éteindre une partie de l'application sans déployer.
--
-- Une ligne par élément ÉTEINT, et rien pour les autres : le défaut est
-- « allumé », de sorte qu'une table vide (ou illisible) laisse l'application
-- entière fonctionner. L'inverse aurait fait tomber le site le jour où la
-- lecture de cette table échoue.
--
-- Appliquer : npx wrangler@4.121.0 d1 execute ogs-rooms --remote --file=schema-flags.sql
CREATE TABLE IF NOT EXISTS flags (
  cle     TEXT PRIMARY KEY,
  actif   INTEGER NOT NULL DEFAULT 1,
  updated INTEGER NOT NULL
);
