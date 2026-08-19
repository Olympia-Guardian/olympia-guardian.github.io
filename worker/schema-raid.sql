-- Groupes de raid : un groupe suit UN palier savage, et n'affiche ni planning,
-- ni collections, ni avancement — ces écrans parlent de cosmétique.
--
-- `type` vaut 'collection' (défaut, tous les groupes existants) ou 'raid'.
-- `tier` porte la clé du palier suivi, telle qu'elle figure dans
-- public/data/raid.json ; elle reste vide pour un groupe de collection.
--
-- Appliquer : npx wrangler@4.121.0 d1 execute ogs-rooms --remote --file=schema-raid.sql
ALTER TABLE groups ADD COLUMN type TEXT NOT NULL DEFAULT 'collection';
ALTER TABLE groups ADD COLUMN tier TEXT;
