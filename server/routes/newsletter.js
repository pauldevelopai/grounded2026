import { Router } from 'express';
import pool from '../db/pool.js';
import { createKnowledgeEntry } from '../services/knowledge.js';
import { generateDailyDigest, classifyNewsletterContent } from '../services/claude.js';
import { scrapeSectorNews } from '../services/web-scraper.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const { date, curriculum, category, limit } = req.query;
    let query = 'SELECT * FROM newsletter_items WHERE 1=1';
    const params = [];
    if (date) { params.push(date); query += ` AND digest_date::date = $${params.length}::date`; }
    if (curriculum === 'true') query += ' AND is_curriculum_relevant = true';
    if (category) { params.push(category); query += ` AND category = $${params.length}`; }
    query += ' ORDER BY received_at DESC';
    params.push(parseInt(limit) || 50);
    query += ` LIMIT $${params.length}`;
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get digest for a specific date (from archive)
router.get('/digest/:date', async (req, res) => {
  try {
    // Get current digest for this date
    const { rows: digests } = await pool.query(
      'SELECT * FROM newsletter_digests WHERE digest_date = $1 AND is_current = true ORDER BY version DESC LIMIT 1',
      [req.params.date]
    );

    // Get items for this date
    const { rows: items } = await pool.query(
      'SELECT * FROM newsletter_items WHERE digest_date::date = $1::date ORDER BY is_curriculum_relevant DESC, category, received_at',
      [req.params.date]
    );

    res.json({
      date: req.params.date,
      digest: digests[0]?.content || null,
      items,
      total: items.length,
      curriculum_count: items.filter(i => i.is_curriculum_relevant).length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/curriculum', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM newsletter_items WHERE is_curriculum_relevant = true
       ORDER BY received_at DESC LIMIT 50`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/promote', async (req, res) => {
  try {
    const { rows: [item] } = await pool.query('SELECT * FROM newsletter_items WHERE id = $1', [req.params.id]);
    if (!item) return res.status(404).json({ message: 'Not found' });

    let sectorId = null;
    if (item.relevant_sectors?.length > 0) {
      const { rows } = await pool.query('SELECT id FROM sectors WHERE name = ANY($1) LIMIT 1', [item.relevant_sectors]);
      sectorId = rows[0]?.id || null;
    }

    // Merge user-selected tags with auto-generated tags
    const userTags = Array.isArray(req.body?.tags) ? req.body.tags : [];
    const autoTags = ['newsletter', item.category, ...(item.relevant_sectors || []).map(s => s.toLowerCase())].filter(Boolean);
    const allTags = [...new Set([...userTags, ...autoTags])];

    const knowledgeId = await createKnowledgeEntry({
      category: 'industry_trend',
      subcategory: item.category,
      title: item.summary?.split('.')[0] || item.subject,
      content: (item.summary || '') + (item.curriculum_relevance_reason ? '\n\nCurriculum impact: ' + item.curriculum_relevance_reason : ''),
      sectorId,
      sourceType: 'newsletter',
      sourceDescription: `Newsletter from ${item.sender}: ${item.subject}`,
      sourceUrl: item.source_url || null,
      confidence: 0.65,
      tags: allTags,
    });

    await pool.query('UPDATE newsletter_items SET promoted_to_knowledge = true WHERE id = $1', [req.params.id]);

    res.status(201).json({ knowledge_id: knowledgeId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const { is_curriculum_relevant, curriculum_relevance_reason } = req.body;
    const { rows } = await pool.query(
      `UPDATE newsletter_items SET is_curriculum_relevant = COALESCE($1, is_curriculum_relevant),
       curriculum_relevance_reason = COALESCE($2, curriculum_relevance_reason)
       WHERE id = $3 RETURNING *`,
      [is_curriculum_relevant, curriculum_relevance_reason, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Regenerate or generate digest for a specific date
router.post('/regenerate-digest', async (req, res) => {
  try {
    const targetDate = req.body.date || new Date().toISOString().split('T')[0];
    const storiesLimit = Math.min(Math.max(parseInt(req.body.storiesLimit) || 10, 3), 10);
    const sourceFilter = req.body.sourceFilter || 'all'; // 'all' | 'email' | 'web'

    let itemQuery = 'SELECT * FROM newsletter_items WHERE digest_date::date = $1::date';
    const params = [targetDate];
    if (sourceFilter === 'email') { params.push('email'); itemQuery += ` AND source_type = $${params.length}`; }
    else if (sourceFilter === 'web') { params.push('web'); itemQuery += ` AND source_type = $${params.length}`; }
    itemQuery += ' ORDER BY is_curriculum_relevant DESC, category';

    const { rows: allItems } = await pool.query(itemQuery, params);
    if (allItems.length === 0) return res.status(400).json({ message: `No items for ${targetDate} to generate from` });

    // Apply stories limit: curriculum items first, then fill remaining slots
    const currItems = allItems.filter(i => i.is_curriculum_relevant);
    const otherItems = allItems.filter(i => !i.is_curriculum_relevant);
    const items = [...currItems, ...otherItems].slice(0, storiesLimit);

    const digest = await generateDailyDigest(items);

    // Archive any existing current digest for this date
    await pool.query(
      `UPDATE newsletter_digests SET is_current = false WHERE digest_date = $1 AND is_current = true`,
      [targetDate]
    );

    // Get next version number
    const { rows: [{ max_version }] } = await pool.query(
      `SELECT COALESCE(MAX(version), 0) AS max_version FROM newsletter_digests WHERE digest_date = $1`,
      [targetDate]
    );

    // Insert new version as current
    await pool.query(
      `INSERT INTO newsletter_digests (digest_date, content, item_count, curriculum_count, version, is_current)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [targetDate, digest, items.length, items.filter(i => i.is_curriculum_relevant).length, (max_version || 0) + 1]
    );

    res.json({ digest, itemCount: items.length });
  } catch (err) {
    console.error('Regenerate digest error:', err);
    res.status(500).json({ message: err.message || 'Regeneration failed' });
  }
});

// Save edited digest content
router.put('/digest/:date', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ message: 'content required' });

    // Update the current version for this date
    const { rowCount } = await pool.query(
      `UPDATE newsletter_digests SET content = $1, updated_at = NOW() WHERE digest_date = $2 AND is_current = true`,
      [content, req.params.date]
    );
    if (rowCount === 0) {
      await pool.query(
        `INSERT INTO newsletter_digests (digest_date, content, item_count, curriculum_count, version, is_current)
         VALUES ($1, $2, 0, 0, 1, true)`,
        [req.params.date, content]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Fetch web AI news and store as newsletter items
router.post('/fetch-web', async (req, res) => {
  try {
    const targetDate = req.body.date || new Date().toISOString().split('T')[0];

    // Get sector names for classification context
    const { rows: sectors } = await pool.query('SELECT name FROM sectors LIMIT 20');
    const sectorNames = sectors.map(s => s.name).length > 0
      ? sectors.map(s => s.name)
      : ['media', 'legal', 'general'];

    // Scrape AI news from web sources
    const articles = await scrapeSectorNews('general_ai');
    if (!articles || articles.length === 0) {
      return res.json({ inserted: 0, message: 'No articles found from web sources' });
    }

    let inserted = 0;
    let skipped = 0;

    for (const article of articles) {
      const articleText = [article.title, article.description, article.fullText].filter(Boolean).join('\n\n');
      let classified = [];
      try {
        classified = await classifyNewsletterContent(articleText, sectorNames);
      } catch (e) {
        classified = [{
          title: article.title,
          summary: article.description || article.title,
          source_url: article.url,
          category: 'industry_news',
          is_curriculum_relevant: false,
          curriculum_relevance_reason: null,
          relevant_sectors: [],
        }];
      }

      for (let idx = 0; idx < Math.min(classified.length, 3); idx++) {
        const item = classified[idx];
        // Unique key per classified item: url + index (so multiple items per article get distinct keys)
        const dedupeKey = `web:${article.url}:${idx}`;
        const result = await pool.query(
          `INSERT INTO newsletter_items
            (gmail_message_id, sender, subject, received_at, raw_text, summary, source_url,
             category, is_curriculum_relevant, curriculum_relevance_reason, relevant_sectors,
             digest_date, source_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'web')
           ON CONFLICT (gmail_message_id) DO NOTHING`,
          [
            dedupeKey,
            article.source,
            item.title || article.title,
            article.publishDate ? new Date(article.publishDate) : new Date(),
            articleText.slice(0, 5000),
            item.summary,
            item.source_url || article.url,
            item.category || 'industry_news',
            item.is_curriculum_relevant || false,
            item.curriculum_relevance_reason || null,
            item.relevant_sectors || [],
            targetDate,
          ]
        );
        if (result.rowCount > 0) inserted++; else skipped++;
      }
    }

    res.json({ inserted, skipped, total: articles.length });
  } catch (err) {
    console.error('Web fetch error:', err);
    res.status(500).json({ message: err.message || 'Web fetch failed' });
  }
});

// Generate a briefing from all curriculum-relevant items
router.post('/curriculum-digest', async (req, res) => {
  try {
    const { rows: items } = await pool.query(
      `SELECT * FROM newsletter_items WHERE is_curriculum_relevant = true ORDER BY received_at DESC LIMIT 50`
    );
    if (items.length === 0) return res.status(400).json({ message: 'No curriculum items found' });
    const digest = await generateDailyDigest(items);
    res.json({ digest, itemCount: items.length });
  } catch (err) {
    console.error('Curriculum digest error:', err);
    res.status(500).json({ message: err.message || 'Generation failed' });
  }
});

// List all past digests (archive)
router.get('/archive', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT nd.id, nd.digest_date, nd.item_count, nd.curriculum_count, nd.created_at,
        nd.version, nd.is_current,
        LEFT(nd.content, 200) AS preview
      FROM newsletter_digests nd
      ORDER BY nd.digest_date DESC, nd.version DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/settings', async (req, res) => {
  res.json({ label: process.env.NEWSLETTER_LABEL || 'CATEGORY_FORUMS' });
});

export default router;
