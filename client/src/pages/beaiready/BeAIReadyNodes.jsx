// BE AI READY — public Nodes listing (the BAIR storefront).
//
// One registry, two storefronts: this reads /api/public/bair-nodes (the tracker
// filters nodes.json to the Nodes tagged for the 'bair' product) and shows them in
// the BAIR brochure look. A Node shared with GROUNDED would appear here AND on the
// newsroom front door from one registry entry — never copied.
//
// Run path (Paul's call): the tracker_token JWT is host-agnostic, so a signed-in
// BAIR client is accepted by the hosted Node on the grounded host — we link straight
// there (zero Caddy change on the beaiready host). A visitor gets a friendly sign-in.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const TERRACOTTA = '#c75b39';
const CHARCOAL = '#1c1b1a';

export default function BeAIReadyNodes() {
  const { user } = useAuth();
  const location = useLocation();
  const [nodes, setNodes] = useState(null);   // null = loading
  const [error, setError] = useState(false);

  useEffect(() => {
    let live = true;
    const load = (attempt = 0) => {
      fetch('/api/public/bair-nodes')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error('load'))))
        .then((d) => { if (live) { setNodes((d && d.nodes) || []); setError(false); } })
        .catch(() => {
          if (!live) return;
          if (attempt < 2) setTimeout(() => live && load(attempt + 1), 1200); // ride out a transient blip
          else setError(true);
        });
    };
    load();
    return () => { live = false; };
  }, []);

  const nextParam = encodeURIComponent(location.pathname + location.search);

  return (
    <div>
      <header style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 8px', color: CHARCOAL, letterSpacing: '-0.02em' }}>
          Nodes
        </h1>
        <p style={{ fontSize: 16, color: '#5a534c', maxWidth: 680, margin: 0, lineHeight: 1.6 }}>
          Small, focused AI tools your business runs and owns. Each does one job well, keeps your data yours,
          and runs in your browser here — or on your own machine if you’d rather. You bring your own AI key,
          so the running costs are yours and nothing is locked in.
        </p>
      </header>

      {error && (
        <p style={{ color: '#8a2c2c' }}>Couldn’t load the Nodes list just now. Refresh to try again.</p>
      )}
      {nodes === null && !error && (
        <p style={{ color: '#8a857e' }}>Loading…</p>
      )}
      {nodes && nodes.length === 0 && (
        <p style={{ color: '#8a857e', fontStyle: 'italic' }}>No Nodes are available yet — check back soon.</p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18 }}>
        {/* LeadFinder — a built-in Node (runs in-app, not from the hosted registry). */}
        <article style={{ background: '#fff', border: `1px solid ${TERRACOTTA}`, borderRadius: 12, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: CHARCOAL }}>LeadFinder</h2>
          </div>
          <p style={{ fontSize: 14.5, color: '#5a534c', lineHeight: 1.55, margin: 0, flex: 1 }}>
            Overnight tender watching. Pulls tenders from your sources, reads each one, and ranks them by how
            likely they are to convert — so your morning is a short list to act on, not a pile to sift.
          </p>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            {user ? (
              <a href="/leadfinder" style={{ background: TERRACOTTA, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '9px 16px', borderRadius: 7 }}>Open ›</a>
            ) : (
              <a href={`/login?next=${encodeURIComponent('/leadfinder')}`} style={{ background: TERRACOTTA, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '9px 16px', borderRadius: 7 }}>Sign in to use ›</a>
            )}
          </div>
        </article>
        {(nodes || []).map((n) => {
          const soon = n.status !== 'live';
          return (
            <article key={n.slug} style={{
              background: '#fff', border: '1px solid #e7e0d8', borderRadius: 12, padding: '20px 22px',
              display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: CHARCOAL }}>{n.name}</h2>
                {soon && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: TERRACOTTA, border: `1px solid ${TERRACOTTA}`, borderRadius: 20, padding: '2px 9px', whiteSpace: 'nowrap' }}>
                    Coming soon
                  </span>
                )}
              </div>
              {/* desc may carry simple inline HTML (<em>) from the registry. */}
              <p style={{ fontSize: 14.5, color: '#5a534c', lineHeight: 1.55, margin: 0, flex: 1 }}
                 dangerouslySetInnerHTML={{ __html: n.desc }} />

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
                {soon ? (
                  <span style={{ fontSize: 13, color: '#8a857e' }}>In development — ask us for early access.</span>
                ) : user ? (
                  <a href={n.runUrl} target="_blank" rel="noreferrer"
                     style={{ background: TERRACOTTA, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '9px 16px', borderRadius: 7 }}>
                    Open ›
                  </a>
                ) : (
                  <a href={`/login?next=${nextParam}`}
                     style={{ background: TERRACOTTA, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 600, padding: '9px 16px', borderRadius: 7 }}>
                    Sign in to use ›
                  </a>
                )}
                {!soon && (
                  <a href={`https://grounded.developai.co.za/nodes/${n.slug}/mac`} target="_blank" rel="noreferrer"
                     style={{ fontSize: 12.5, color: '#8a857e', textDecoration: 'none' }}>
                    or run on your machine
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <p style={{ fontSize: 13, color: '#8a857e', marginTop: 28, maxWidth: 680, lineHeight: 1.6 }}>
        Your API key is yours. When you run a Node here it’s stored encrypted for your account and used only to
        do your work — never shown again, never shared. Prefer to keep everything on your own computer? Each Node
        can be downloaded and run locally instead.
      </p>
    </div>
  );
}
