-- Open-source tools pipeline (second content domain) + stronger source coverage.
-- Reuses the generic content_* tables from migration 069; adds the compiled
-- oss_tools table and seeds higher-signal sources for both domains.

-- ── Compiled dataset: open-source tools / modules ───────────────────────────
CREATE TABLE IF NOT EXISTS oss_tools (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  raw_item_id UUID REFERENCES content_raw_items(id) ON DELETE SET NULL,
  name VARCHAR(300) NOT NULL,
  category VARCHAR(60),        -- 'transcription'|'data'|'scraping'|'cms'|'security'|'ai'|'audio'|'visualisation'|'verification'|'other'
  description TEXT,            -- AI summary of what it does
  newsroom_use TEXT,          -- AI: how a newsroom could use it
  url TEXT,                    -- repo / project / download URL
  language VARCHAR(60),
  license VARCHAR(60),
  relevance NUMERIC(3,2),
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'review',   -- 'review'|'published'|'rejected'
  rag_synced BOOLEAN NOT NULL DEFAULT false,
  rag_synced_at TIMESTAMPTZ,
  knowledge_entry_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_oss_tools_category ON oss_tools(category);
CREATE INDEX IF NOT EXISTS idx_oss_tools_status   ON oss_tools(status);
CREATE INDEX IF NOT EXISTS idx_oss_tools_rag      ON oss_tools(rag_synced);

-- ── Stronger Monetisation sources (research + industry + strategy) ──────────
INSERT INTO content_sources (domain, name, kind, url, tags, run_frequency_hours) VALUES
  ('monetisation', 'Reuters Institute', 'rss', 'https://reutersinstitute.politics.ox.ac.uk/rss.xml', ARRAY['research'], 24),
  ('monetisation', 'WAN-IFRA', 'rss', 'https://wan-ifra.org/feed/', ARRAY['industry','strategy'], 24),
  ('monetisation', 'What''s New in Publishing', 'rss', 'https://whatsnewinpublishing.com/feed/', ARRAY['strategy','industry'], 24),
  ('monetisation', 'The Rebooting', 'rss', 'https://www.therebooting.com/feed', ARRAY['strategy','business'], 24),
  ('monetisation', 'Columbia Journalism Review', 'rss', 'https://www.cjr.org/feed', ARRAY['research'], 24),
  ('monetisation', 'Poynter', 'rss', 'https://www.poynter.org/feed/', ARRAY['industry'], 24),
  ('monetisation', 'INMA blog', 'rss', 'https://www.inma.org/rss/blogs.cfm', ARRAY['industry','strategy'], 24)
ON CONFLICT (domain, kind, url) DO NOTHING;

-- ── Open-source tools sources (journalism + dev tooling) ────────────────────
INSERT INTO content_sources (domain, name, kind, url, tags, run_frequency_hours) VALUES
  ('tools', 'Source (OpenNews)', 'rss', 'https://source.opennews.org/articles/feed/', ARRAY['journalism','community'], 24),
  ('tools', 'GitHub Blog', 'rss', 'https://github.blog/feed/', ARRAY['oss','releases'], 24),
  ('tools', 'Console.dev tools', 'rss', 'https://console.dev/tools/rss.xml', ARRAY['dev-tools'], 24),
  ('tools', 'Hacker News (Show HN)', 'rss', 'https://hnrss.org/show', ARRAY['oss','launches'], 12)
ON CONFLICT (domain, kind, url) DO NOTHING;
