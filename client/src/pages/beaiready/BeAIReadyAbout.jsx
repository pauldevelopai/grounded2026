// BeAIReadyAbout — /about on the BE AI READY site. The story of Develop AI, the
// company behind Be AI Ready and Grounded, assembled from developai.co.za (their own
// site): who they are, what they do, where they've worked, the team, talks and press.
// Public (no sign-in). All real content — nothing invented.
import { Link } from 'react-router-dom';

const TERRACOTTA = '#c75b39';
const CHARCOAL = '#1c1b1a';

const label = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: TERRACOTTA };
const h2 = { fontSize: 22, fontWeight: 800, margin: '0 0 6px', color: CHARCOAL };
const lede = { fontSize: 15, lineHeight: 1.65, color: '#4a453f' };
const card = { background: '#fff', border: '1px solid #eee5da', borderRadius: 14, padding: 20 };

function Section({ kicker, title, children, style }) {
  return (
    <section style={{ marginBottom: 40, ...style }}>
      {kicker && <div style={{ ...label, marginBottom: 6 }}>{kicker}</div>}
      {title && <h2 style={h2}>{title}</h2>}
      {children}
    </section>
  );
}

// A compact year → items timeline (training history, conferences).
function Timeline({ groups }) {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {groups.map((g) => (
        <div key={g.year} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', gap: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: TERRACOTTA }}>{g.year}</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 6 }}>
            {g.items.map((it, i) => <li key={i} style={{ fontSize: 13.5, color: '#4a453f', lineHeight: 1.5 }}>{it}</li>)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Stat({ n, label: l }) {
  return (
    <div style={{ ...card, padding: '16px 20px', minWidth: 150, flex: '1 1 150px' }}>
      <div style={{ fontSize: 30, fontWeight: 800, color: TERRACOTTA, lineHeight: 1 }}>{n}</div>
      <div style={{ fontSize: 13, color: '#6b6359', marginTop: 6 }}>{l}</div>
    </div>
  );
}

function Person({ img, name, role, children }) {
  return (
    <div style={{ ...card, display: 'grid', gridTemplateColumns: img ? '120px 1fr' : '1fr', gap: 18, alignItems: 'start' }}>
      {img && <img src={img} alt={name} loading="lazy" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, border: '1px solid #eee5da' }} />}
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: CHARCOAL }}>{name}</div>
        <div style={{ ...label, color: '#8a8076', marginBottom: 8 }}>{role}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#4a453f' }}>{children}</div>
      </div>
    </div>
  );
}

const SERVICES = [
  ['AI strategy', 'Build a practical AI strategy for a business or newsroom.'],
  ['Workflows & structure', 'Restructure staff and optimise workflows around AI.'],
  ['Training workshops', 'Hands-on AI training, in person and online.'],
  ['Prototypes', 'Consult on AI implementation and build working prototypes.'],
  ['AI ethics & policy', 'Integrate an AI-ethics policy the organisation owns.'],
  ['Data-security audits', 'Audit the data security of the AI systems in use.'],
];

const TRAINING = [
  { year: '2026', items: [
    'Online AI training for the DNTF newsroom cohort',
    'Closing workshop with the Thomson Reuters Foundation for exiled media (6-month coaching programme)',
    'In-person training in Kenya and Tanzania',
    'Zambia & Zimbabwe newsroom training in Lusaka',
    'Online AI & Podcasting course with DW Akademie (hundreds of podcasters)',
  ] },
  { year: '2025', items: [
    'Afghanistan newsroom implementation training',
    'Five-day in-person workshop in Namibia with NBC',
    'Three-day online workshop with Radio Television of Serbia',
    'AI-journalism training with the Moldova School of Journalism',
    'Pacific-region workshops with the Public Media Alliance',
    'Six-week Africa-wide newsroom training with DW Akademie',
  ] },
  { year: '2024 & earlier', items: [
    'Workshops across Serbia, Ethiopia, Malaysia, Kenya, Ghana and Egypt',
    'Partnerships with nation media groups and public broadcasters',
  ] },
];

const CONFERENCES = [
  { year: '2026', items: [
    'International Journalism Festival, Perugia — panel, supported by the Thomson Reuters Foundation',
    'Africa Editors Congress 2026, Kenya — AI in African newsrooms',
  ] },
  { year: '2025', items: [
    'Copenhagen Conference on Information Integrity — “AI and the future of media”',
    'PodFest, Moldova — AI and podcasting futures',
    'M20 Summit, Johannesburg — regulation and AI in media',
    'Global Media Forum, Bonn — DW Freedom workshop on AI',
  ] },
  { year: '2023–24', items: [
    'Radiodays Asia, Malaysia — “Leveraging AI for Podcasting”',
    'Africa Media Perspectives, South Africa — AI’s impact on journalism',
    'Egypt Media Forum · Brave New Media Forum, Serbia · Radio Days Ethiopia',
    'Africa Business Media Innovators · Media Freedom Festival · Jamfest, Johannesburg',
  ] },
];

const PRESS = [
  '“Survive and Thrive: The Media Viability Podcast” — AI, the end of the web, and new media business models',
  'John Maytham, CapeTalk Afternoon Drive — AI and self-driving cars',
  'BBC World Service — AI’s technical issues with race and sentience',
  'PodCircle / DW Akademie — AI and podcasting',
  'Power FM — AI news presenters',
  'Podnews & The Podcast Sessions — the podcast-creation app',
  'Judge, WAN-IFRA “Best Use of AI in the Newsroom” (2024)',
];

export default function BeAIReadyAbout() {
  return (
    <div className="hub hub-beaiready">
      {/* Hero */}
      <section style={{ marginBottom: 40 }}>
        <div style={label}>About</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: '6px 0 12px', color: CHARCOAL, letterSpacing: '-0.01em' }}>
          Develop&nbsp;AI — the company behind Be&nbsp;AI&nbsp;Ready
        </h1>
        <p style={{ ...lede, maxWidth: '70ch', fontSize: 16.5 }}>
          Develop&nbsp;AI is dedicated to using AI to help people, newsrooms and businesses in the Global South
          and Eastern Europe solve problems and fulfil their potential. An AI consultancy and training company,
          it helps newsrooms and businesses adopt artificial intelligence responsibly — through AI policies,
          working prototypes and hands-on staff training.
        </p>
      </section>

      {/* Stats */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 40 }}>
        <Stat n="100+" label="newsrooms helped to implement or build AI, aligned with editorial values" />
        <Stat n="12+" label="countries where we’ve trained people to use AI" />
        <Stat n="5" label="regions — Africa, Europe, MENA, Asia & the Pacific" />
        <Stat n="2023" label="founded — a South African company and nonprofit foundation" />
      </section>

      {/* Mission */}
      <Section kicker="Why we exist" title="AI that strengthens journalism, justice and accountability">
        <div style={{ ...card, borderLeft: `3px solid ${TERRACOTTA}` }}>
          <p style={{ ...lede, margin: 0 }}>
            We work to ensure that artificial intelligence <strong>strengthens, rather than undermines,
            journalism, justice, and public accountability</strong> — especially where institutions are fragile
            and resources are limited. That means building ethical, low-bandwidth and context-aware AI systems
            that support journalists and civil society, with a priority on the people most often left out:
            women journalists and early-career reporters in under-resourced environments.
          </p>
        </div>
      </Section>

      {/* What we do */}
      <Section kicker="What we do" title="Consulting, training and AI projects">
        <p style={{ ...lede, maxWidth: '70ch', marginBottom: 16 }}>
          We help organisations navigate AI without being left behind by it — from strategy and workflow design
          to policy, prototypes and data-security audits.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {SERVICES.map(([t, d]) => (
            <div key={t} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: CHARCOAL, marginBottom: 3 }}>{t}</div>
              <div style={{ fontSize: 13, color: '#6b6359', lineHeight: 1.5 }}>{d}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Projects */}
      <Section kicker="AI projects" title="We build AI that fixes systems that are neglected or broken">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 16, color: CHARCOAL }}>GROUNDED</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#4a453f', margin: '6px 0 0' }}>
              Fully open-source, shared AI infrastructure for African newsrooms — a set of AI agents and tools
              that newsroom builders combine into workflows, deploy locally on their own hardware, and share
              across the network.
            </p>
          </div>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 16, color: CHARCOAL }}>Awareness AI</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#4a453f', margin: '6px 0 0' }}>
              Age-appropriate, audience-specific data literacy for South African schools — equipping learners,
              teachers and parents with the frameworks and rights awareness to engage with AI tools on their own
              terms, rather than simply rejecting them.
            </p>
          </div>
        </div>
      </Section>

      {/* Training history */}
      <Section kicker="Where we’ve worked" title="Training across a dozen-plus countries">
        <img src="/developai/training.jpg" alt="Develop AI training workshop" loading="lazy"
          style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 14, border: '1px solid #eee5da', marginBottom: 18 }} />
        <p style={{ ...lede, maxWidth: '70ch', marginBottom: 18 }}>
          We’ve trained hundreds of people to use AI efficiently, partnering with DW Akademie, USAGM, the Public
          Media Alliance, the Thomson Reuters Foundation and International Media Support. A recent snapshot:
        </p>
        <Timeline groups={TRAINING} />
      </Section>

      {/* Team */}
      <Section kicker="Team" title="Who we are">
        <div style={{ display: 'grid', gap: 14 }}>
          <Person img="/developai/paul.jpg" name="Paul McNally" role="Founder & Director">
            Twenty years starting companies in AI, podcasting and community radio, and fifteen as an
            investigative journalist. Winner of the <strong>CNN African Journalist of the Year</strong> award
            (one of sixteen career awards), author of <em>The Street</em> (Pan Macmillan), and creator and host
            of <em>Alibi</em>, described as Africa’s first investigative podcast. A Visiting Nieman Fellow at
            Harvard (2016) who won The Innovating Justice Challenge in The Hague (2017); founder of the Citizen
            Justice Network and Develop Audio. MA in creative writing, BA in psychology (University of Cape Town).
          </Person>
          <Person img="/developai/lorraine.jpg" name="Lorraine Tatenda Mafusire" role="Operations Manager">
            Runs operations at Develop AI, from Zimbabwe — keeping training, coaching and consulting engagements
            across the network moving.
          </Person>
        </div>
      </Section>

      {/* Conferences */}
      <Section kicker="On stage" title="Conference appearances">
        <Timeline groups={CONFERENCES} />
      </Section>

      {/* Press */}
      <Section kicker="In the press" title="Selected coverage & interviews">
        <div style={card}>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            {PRESS.map((p, i) => (
              <li key={i} style={{ fontSize: 13.5, color: '#4a453f', lineHeight: 1.5, paddingLeft: 16, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, color: TERRACOTTA }}>›</span>{p}
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Community */}
      <Section kicker="Community" title="Join the conversation">
        <div style={{ ...card, display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 12 }}>
          <img src="/developai/community.webp" alt="Develop AI community" loading="lazy"
            style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 10 }} />
          <p style={{ ...lede, margin: 0 }}>
            Develop AI runs a free WhatsApp community where members trade perspectives on how AI is reshaping
            work, media, education, health, justice and more. A sister venture, <strong>Develop Audio</strong>,
            produces investigative podcasts on wrongful convictions, assassinations and disinformation.
          </p>
        </div>
      </Section>

      {/* Contact */}
      <section style={{ background: CHARCOAL, color: '#f2ede7', borderRadius: 16, padding: '28px 26px', marginBottom: 8 }}>
        <div style={{ ...label, color: TERRACOTTA }}>Get in touch</div>
        <h2 style={{ ...h2, color: '#fff', marginTop: 6 }}>Talk to us about your AI strategy</h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#cfc7bd', maxWidth: '62ch', marginBottom: 16 }}>
          Whether you’re a newsroom or a business, we can help you adopt AI in a way that fits your values,
          your workflows and your budget.
        </p>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
          <a href="mailto:paul@developai.co.za" style={{ color: '#fff', fontWeight: 700 }}>paul@developai.co.za</a>
          <a href="https://developai.co.za" target="_blank" rel="noreferrer" style={{ color: TERRACOTTA }}>developai.co.za ↗</a>
          <a href="https://developai.substack.com" target="_blank" rel="noreferrer" style={{ color: TERRACOTTA }}>Newsletter ↗</a>
          <Link to="/training" style={{ color: TERRACOTTA }}>Book a training →</Link>
        </div>
      </section>
    </div>
  );
}
