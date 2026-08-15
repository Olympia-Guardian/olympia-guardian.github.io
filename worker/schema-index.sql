-- Index manquants sur les colonnes filtrées en permanence. Sans eux, les
-- routes les plus chaudes font un balayage complet de table : /inbox est
-- appelée toutes les 90 s par chaque client, et usersSharingChar tourne à
-- chaque case cochée. Coût nul à la création, gain immédiat à la lecture.

-- bindings : la clé primaire est (user_id, char_id), donc filtrer sur le
-- personnage seul balayait tout (ownersOfChar, à chaque suggestion créée).
CREATE INDEX IF NOT EXISTS idx_bindings_char ON bindings(char_id);

-- group_members : même situation, clé primaire (group_id, char_id).
CREATE INDEX IF NOT EXISTS idx_members_char ON group_members(char_id);

-- suggestions : seul idx_suggestions_char existait ; /inbox filtre sur
-- l'émetteur.
CREATE INDEX IF NOT EXISTS idx_sugg_from ON suggestions(from_user_id);

-- tokens : purge des expirés et rétention des 5 sessions récentes, à chaque
-- connexion.
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_exp ON tokens(expires);

-- blocks : la jointure de createSuggestions filtre sur le compte bloqué.
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id);
