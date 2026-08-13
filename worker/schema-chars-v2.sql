-- Fiche de personnage étendue (profil Lodestone JSON) + limite de synchro
-- forcée. Appliquer : npx wrangler@4.121.0 d1 execute ogs-rooms --remote --file=schema-chars-v2.sql
ALTER TABLE characters ADD COLUMN profile TEXT;
ALTER TABLE characters ADD COLUMN forced_at INTEGER;
