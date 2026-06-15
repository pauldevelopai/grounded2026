-- Rollback for 096_prompt_library.sql
-- House style is forward-only (migrate.js runs every .sql in db/migrations/), so this
-- lives OUTSIDE that directory and is NOT auto-run. Apply manually if you must undo:
--   psql "$DATABASE_URL" -f server/db/rollbacks/096_prompt_library.sql
-- and delete the 096 row from the migrations table to allow re-applying.
DROP TABLE IF EXISTS prompt_feedback;
DROP TABLE IF EXISTS user_prompt_variants;
DROP TABLE IF EXISTS prompt_model_validations;
DROP TABLE IF EXISTS prompts;
