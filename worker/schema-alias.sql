-- Alias des membres d'un groupe : « Aly'n Dohrr » s'affiche « Monsieur Dohrr »
-- pour ceux qui l'appellent ainsi. L'alias appartient à l'APPARTENANCE, pas au
-- personnage : un même perso peut porter un surnom dans un groupe et son nom
-- dans un autre, et le chef d'un groupe ne renomme personne ailleurs que chez
-- lui. Voir worker/index.js, setMemberAlias.
-- Appliquer : npx wrangler@4.121.0 d1 execute ogs-rooms --remote --file=schema-alias.sql
ALTER TABLE group_members ADD COLUMN alias TEXT;
