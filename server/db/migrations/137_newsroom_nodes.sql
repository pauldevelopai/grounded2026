-- 137_newsroom_nodes.sql
-- Per-client Node entitlements for BE AI READY: which Nodes a signed-in business
-- (newsroom) has access to on the /nodes storefront. If a newsroom has NO rows here it
-- sees the full storefront (nobody is blocked); if it has rows, it sees only those.
-- Served by GET /api/beaiready/my-nodes. Additive + reversible.

CREATE TABLE IF NOT EXISTS beaiready_newsroom_nodes (
  newsroom_id UUID NOT NULL REFERENCES newsrooms(id) ON DELETE CASCADE,
  node_slug   TEXT NOT NULL,        -- matches nodes.json slug (leadfinder, bair-extract, …)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (newsroom_id, node_slug)
);
CREATE INDEX IF NOT EXISTS idx_beaiready_newsroom_nodes ON beaiready_newsroom_nodes(newsroom_id);

-- Seed Leads 2 Business (tenant zero) with its two Nodes: LeadFinder + Extract PDF.
INSERT INTO beaiready_newsroom_nodes (newsroom_id, node_slug)
SELECT n.id, v.slug
  FROM newsrooms n
  CROSS JOIN (VALUES ('leadfinder'), ('bair-extract')) AS v(slug)
 WHERE n.name = 'Leads 2 Business'
ON CONFLICT DO NOTHING;

-- ROLLBACK:
--   DROP TABLE IF EXISTS beaiready_newsroom_nodes;
--   DELETE FROM migrations WHERE name='137_newsroom_nodes.sql';
