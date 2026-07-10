-- 138_beaiready_client_tools.sql
-- BE AI READY — tools curated FOR a specific client. The Toolbox (/api/public/toolkit)
-- is a global catalogue with no client linkage; this is the missing per-client join so
-- the admin can recommend specific tools to one business. The OTHER half of a client's
-- tool picture — what their team already uses — is derived live from their intake
-- survey, so it is deliberately not stored here. Reversible.

CREATE TABLE IF NOT EXISTS beaiready_client_tools (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  tool_slug   TEXT NOT NULL,               -- slug from the toolkit catalogue
  tool_name   TEXT NOT NULL,               -- denormalised for display
  note        TEXT,                        -- why this tool, for this client
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (newsroom_id, tool_slug)
);
CREATE INDEX IF NOT EXISTS idx_bair_client_tools_tenant ON beaiready_client_tools(newsroom_id);

-- ROLLBACK:
--   DROP TABLE IF EXISTS beaiready_client_tools;
--   DELETE FROM migrations WHERE name='138_beaiready_client_tools.sql';
