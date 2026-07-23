// Hub — the public front door for Grounded (Phase 1 · step 3).
//
// Rebuilt around the concept-note IA: the FIVE sections + THREE strategic
// layers + the data-sovereignty foundation story. Reads the section labels,
// blurbs, accents and public links from ui/sections.js so the Hub, the
// /sections product front door and the section pages can never drift.
//
// GOVERNING RULE: no fake data. The stat row shows real counts (or an em-dash
// while loading / if unavailable); sections with no public page yet say so and
// invite sign-in rather than linking somewhere fabricated.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { publicFetch } from '../../hooks/usePublicApi.js';
import { SECTIONS, LAYERS } from '../../ui/sections.js';
import { useAuth } from '../../context/AuthContext.jsx';
import TodayInAI from '../../components/TodayInAI.jsx';

export default function PublicHome() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ nodes: null, lawsuits: null, regulations: null, usecases: null });

  useEffect(() => {
    Promise.allSettled([
      fetch('/nodes/nodes.json').then(r => r.json()).then(d => (d.nodes || []).length),
      publicFetch('/public/lawsuits?pageSize=1').then(r => r.total),
      publicFetch('/public/regulations?pageSize=1').then(r => r.total),
      publicFetch('/public/usecases?pageSize=1').then(r => r.total),
    ]).then(([n, l, rg, u]) => setStats({
      nodes: n.status === 'fulfilled' ? n.value : null,
      lawsuits: l.status === 'fulfilled' ? l.value : null,
      regulations: rg.status === 'fulfilled' ? rg.value : null,
      usecases: u.status === 'fulfilled' ? u.value : null,
    }));
  }, []);

  return (
    <div className="hub">
      {/* ── Hero ── */}
      <section className="hub-hero">
        <div className="hub-eyebrow">Grounded · by Develop&nbsp;AI</div>
        <h1>Newsroom-owned AI</h1>
        <p className="hub-lede">
          Shared AI infrastructure for African public-interest newsrooms — tools your team
          <b> builds and owns</b>, the law and ethics around AI <b>tracked daily</b>, and the
          training to use it well. Built with newsrooms, run on your terms.
        </p>
        <div className="hub-hero-cta">
          {user ? (
            <>
              {/* Logged in → straight into the product workspace. */}
              <Link to="/sections" className="hub-btn hub-btn-solid">Go to your workspace →</Link>
              <a href="/nodes/" className="hub-btn hub-btn-ghost">See the Nodes</a>
            </>
          ) : (
            <>
              {/* Logged out → the things a visitor can actually do without an
                  account (GROUNDED is invite-only). Sign-in is a quiet link. */}
              <a href="/nodes/" className="hub-btn hub-btn-solid">See the Nodes</a>
              <Link to="/legal/dashboard" className="hub-btn hub-btn-ghost">Browse the tracker</Link>
              <a href="/login" className="hub-btn-text">Sign in →</a>
            </>
          )}
        </div>
      </section>

      {/* ── Today in AI — the daily newsroom (shared with the BE AI READY door):
          lead story + two shorter reads, from the three public briefings. Renders
          nothing until a briefing exists. Tracker links go to the public legal
          dashboard. ── */}
      <TodayInAI trackerTo="/legal/dashboard" />

      {/* ── What's inside (real counts) ── */}
      <section className="hub-stats">
        <Stat value={stats.nodes} label="Nodes you can run" to="/nodes/" external />
        <Stat value={stats.lawsuits} label="AI lawsuits tracked" to="/legal/lawsuits" />
        <Stat value={stats.regulations} label="Regulations tracked" to="/legal/regulations" />
        <Stat value={stats.usecases} label="Use cases logged" to="/legal/use-cases" />
      </section>

      {/* ── The five sections ── */}
      <div className="hub-section-label">What Grounded does · five sections</div>
      <section className="hub-grid">
        {SECTIONS.map((s) => (
          <SectionCard key={s.key} section={s} />
        ))}
      </section>

      {/* ── The three strategic layers ── */}
      <div className="hub-section-label">Three strategic layers</div>
      <p className="hub-layers-lede">
        The cross-cutting views that sit above the sections — where a newsroom understands its own
        work and chooses what to share. In development; built once the data that feeds them is real.
      </p>
      <section className="hub-grid hub-grid-layers">
        {LAYERS.map((l) => (
          <div key={l.key} className="hub-card hub-card-layer">
            <span className="hub-soon">● In development</span>
            <h3>{l.label}</h3>
            <p>{l.blurb}</p>
          </div>
        ))}
      </section>

      {/* ── The foundation: data sovereignty ── */}
      <section className="hub-foundation">
        <div className="hub-foundation-label">The foundation</div>
        <h2>Your data and your tools stay yours</h2>
        <p>
          Every Node downloads and runs on your own machine with one command — or online if you
          prefer. The newsroom owns its data, its archive and the tools built on top of them. The
          network makes each tool sharper without pooling anyone's data into someone else's product.
          That's what newsroom-owned means: shared infrastructure, sovereign newsrooms.
        </p>
      </section>
    </div>
  );
}

// One section as a public Hub card: accent-keyed, with its public front-door
// link — or, where no public page exists yet, an honest sign-in invite.
function SectionCard({ section }) {
  const style = { '--accent': `var(${section.accentVar})` };
  return (
    <div className="hub-card hub-card-section" style={style}>
      <h3>{section.label}</h3>
      <p>{section.blurb}</p>
      {section.hub ? (
        section.hub.external ? (
          <a href={section.hub.href} className="hub-card-cta">{section.hub.label} →</a>
        ) : (
          <Link to={section.hub.href} className="hub-card-cta">{section.hub.label} →</Link>
        )
      ) : (
        <span className="hub-card-cta hub-card-cta-muted">In development · sign in to follow</span>
      )}
    </div>
  );
}

function Stat({ value, label, to, external }) {
  const inner = (
    <>
      <div className="hub-stat-value">{value == null ? '—' : value}</div>
      <div className="hub-stat-label">{label}</div>
    </>
  );
  return (
    <div className="hub-stat">
      {external
        ? <a href={to}>{inner}</a>
        : <Link to={to}>{inner}</Link>}
    </div>
  );
}
