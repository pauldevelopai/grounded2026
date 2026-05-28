// Monetisation — the third top-level section of Grounded. Practical ways a
// newsroom can turn its journalism (and its rights) into revenue in the AI era.
// Linked from the master menu's "Monetisation" dropdown; each topic has an
// anchor id so the dropdown can jump straight to it.
import { useEffect, useState } from 'react';
import { publicFetch } from '../../hooks/usePublicApi.js';

const TOPICS = [
  {
    id: 'archive',
    title: 'Extracting value from your archive',
    lede: 'Your back catalogue is an asset, not a cost.',
    body: [
      'Years of reporting — verified, edited, rights-cleared — is exactly the high-quality, structured text AI companies pay for. The work is already done; the value is locked up.',
      'Practical moves: inventory what you own outright vs. licensed; clean and tag the archive so it can be sold as a structured dataset; offer tiered access (full licence, time-boxed windows, topic slices); and keep an audit trail of provenance so a buyer can trust it.',
    ],
  },
  {
    id: 'crawlers',
    title: 'Accommodating AI crawlers for cash',
    lede: 'If a bot is going to read your site, it can pay to.',
    body: [
      'AI crawlers harvest your content to train models and answer questions — usually for free, often without attribution. You can change the terms: block by default, then sell access.',
      'Practical moves: declare your rules in robots.txt and emerging signals; gate bot access at the edge (e.g. pay-per-crawl arrangements now appearing through CDNs); separate "may index for attribution" from "may train" and price them differently; and log who is taking what, so the conversation starts from evidence.',
    ],
  },
  {
    id: 'aeo',
    title: 'Answer Engine Optimization',
    lede: 'Be the source the AI cites — and capture the value of being cited.',
    body: [
      'Readers increasingly get answers from ChatGPT, Perplexity and Google AI Overviews instead of clicking through. AEO is the discipline of making your reporting the thing those engines quote, link and trust.',
      'Practical moves: structure articles so they answer real questions cleanly; add clear sourcing, dates and structured data; track which engines cite you and for what; and treat citations as a measurable channel — referrals, brand authority, and leverage in licensing talks.',
    ],
  },
  {
    id: 'bargaining',
    title: 'Collective bargaining with other organisations',
    lede: 'One newsroom is a price-taker. A coalition sets the price.',
    body: [
      'Individually, a newsroom has little leverage against a trillion-dollar model maker. Together, newsrooms control a corpus no one can ignore — and can negotiate licensing terms, attribution standards and payment as a bloc.',
      'Practical moves: form or join a licensing consortium; agree shared minimum terms so members are not played off against each other; pool usage evidence; and negotiate collectively for both back-catalogue licences and ongoing access.',
    ],
  },
];

export default function PublicMonetisation() {
  // Published resources compiled by the monetisation scraper + AI pipeline,
  // grouped by topic.
  const [byTopic, setByTopic] = useState({});
  useEffect(() => {
    publicFetch('/public/monetisation')
      .then(r => {
        const g = {};
        (r.items || []).forEach(it => { (g[it.topic] = g[it.topic] || []).push(it); });
        setByTopic(g);
      })
      .catch(() => setByTopic({}));
  }, []);

  // Jump to the anchored topic if the URL has a hash (the menu links use them).
  useEffect(() => {
    if (window.location.hash) {
      const el = document.getElementById(window.location.hash.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <div>
      <section style={{ marginBottom: 30, maxWidth: 760 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 10 }}>
          Monetisation
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 800, margin: '0 0 14px 0', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Turn your journalism into revenue in the AI era
        </h1>
        <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          Four practical strategies for newsrooms to capture value from their content and their rights —
          rather than giving them away to AI for free.
        </p>
      </section>

      {/* Topic index */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 32 }}>
        {TOPICS.map(t => (
          <a key={t.id} href={`#${t.id}`}
             style={{ fontSize: 13, fontWeight: 600, padding: '7px 13px', borderRadius: 999, textDecoration: 'none',
                      border: '1px solid var(--border-color)', color: 'var(--text-primary)', background: 'var(--card-bg)' }}>
            {t.title}
          </a>
        ))}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 820 }}>
        {TOPICS.map((t, i) => (
          <article key={t.id} id={t.id} className="card" style={{ padding: 24, scrollMarginTop: 90 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>{String(i + 1).padStart(2, '0')}</div>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 6px 0', letterSpacing: '-0.01em' }}>{t.title}</h2>
            <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--accent)', margin: '0 0 12px 0' }}>{t.lede}</p>
            {t.body.map((p, j) => (
              <p key={j} style={{ fontSize: 14.5, color: 'var(--text-secondary)', lineHeight: 1.65, margin: '0 0 10px 0' }}>{p}</p>
            ))}
            {(byTopic[t.id] && byTopic[t.id].length > 0) && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Latest reading
                </div>
                {byTopic[t.id].map(r => (
                  <div key={r.id} style={{ marginBottom: 8 }}>
                    <a href={r.url || '#'} target="_blank" rel="noreferrer" style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}>
                      {r.title}
                    </a>
                    {r.source_name && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}> · {r.source_name}</span>}
                    {r.summary && <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.summary}</div>}
                  </div>
                ))}
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
