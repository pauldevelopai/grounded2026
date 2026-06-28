-- 112_prompt_wiki.sql
-- The company prompt wiki (Paul, 2026-06-24). Company prompts (prompts.newsroom_id
-- set) are shared + editable by any member of that company — so members can add,
-- edit and share prompts collaboratively, building the best prompts for the
-- company's tasks. Track who last edited (wiki attribution). The 'client' source
-- marks a member-added company prompt (vs an admin-pushed one). Additive.
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES team_members(id);

-- ROLLBACK:
--   ALTER TABLE prompts DROP COLUMN IF EXISTS updated_by;
--   DELETE FROM migrations WHERE name='112_prompt_wiki.sql';
