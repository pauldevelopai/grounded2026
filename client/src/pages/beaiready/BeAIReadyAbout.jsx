// BeAIReadyAbout — /about on the BE AI READY site. The story of Develop AI, the
// company behind Be AI Ready and Grounded, assembled from developai.co.za (their own
// site): who they are, how they help businesses, what they do, the full training
// history, the team, conferences, press and the newsletter. Public (no sign-in).
// All real content — nothing invented.
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

// A year → items timeline rendered as a card grid: each year gets a bold marker + a
// rule, and each entry is a small card. Where an entry starts with "Month — …", the
// month is lifted out into a terracotta chip; other entries render whole.
const MONTHS = new Set(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']);
function splitMonth(s) {
  const idx = s.indexOf(' — ');
  if (idx > 0) {
    const head = s.slice(0, idx).trim();
    if (MONTHS.has(head)) return [head, s.slice(idx + 3).trim()];
  }
  return [null, s];
}
function Timeline({ groups }) {
  return (
    <div style={{ display: 'grid', gap: 26 }}>
      {groups.map((g) => (
        <div key={g.year}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: TERRACOTTA, lineHeight: 1 }}>{g.year}</span>
            <span style={{ flex: 1, height: 1, background: '#eee5da' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(264px, 1fr))', gap: 10 }}>
            {g.items.map((it, i) => {
              const [m, rest] = splitMonth(it);
              return (
                <div key={i} style={{ background: '#fff', border: '1px solid #eee5da', borderRadius: 10, padding: '12px 14px' }}>
                  {m && <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: TERRACOTTA, marginBottom: 5 }}>{m}</div>}
                  <div style={{ fontSize: 13, color: '#4a453f', lineHeight: 1.55 }}>{rest}</div>
                </div>
              );
            })}
          </div>
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
      {img && <img src={img} alt={name} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 12, border: '1px solid #eee5da' }} />}
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: CHARCOAL }}>{name}</div>
        <div style={{ ...label, color: '#8a8076', marginBottom: 8 }}>{role}</div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: '#4a453f' }}>{children}</div>
      </div>
    </div>
  );
}

// How we help a business get AI-ready (the consulting services, business-framed).
const SERVICES = [
  ['AI strategy', 'A practical AI strategy for your business — where AI genuinely saves time and money, and what to do first.'],
  ['Workflows & structure', 'Redesign workflows and restructure teams around AI, so it fits how you actually work.'],
  ['Team training', 'Hands-on AI training for your staff, in person and online — changing what they do on Monday.'],
  ['Prototypes', 'Build working AI prototypes for the tasks that matter most to your business.'],
  ['AI policy & ethics', 'An AI-use policy your business owns — acceptable use, data rules and regulatory alignment.'],
  ['Data-security audits', 'Audit the data security of every AI tool in use, and get a clear ruling on what is safe.'],
];

const TRAINING = [
  { year: '2026', items: [
    'April — AI training for the DNTF newsroom cohort (online)',
    'March — Closing workshop with the Thomson Reuters Foundation for exiled media: five newsrooms completed six months of AI prototype and policy coaching',
    'February — In-person AI-implementation training with three newsrooms from Kenya and Tanzania',
    'February — Training in Lusaka for five newsrooms from Zambia and Zimbabwe',
    'January — Online “AI & Podcasting” course with DW Akademie (hundreds of podcasters engaged)',
  ] },
  { year: '2025', items: [
    'December — AI and podcasting workshop, 100+ participants (online)',
    'December — AI-implementation training for a newsroom in Afghanistan',
    'November — Five-day in-person workshop in Namibia with the Namibian Broadcasting Corporation (NBC)',
    'November — Three-day online workshop for Radio Television of Serbia',
    'October — AI-and-journalism training with DW Akademie and the Moldova School of Journalism',
    'September — Three-day workshop for Thomson Reuters Foundation exiled media',
    'July — AI workshops across the Pacific region with the Public Media Alliance',
    'June — Webinar series for International Media Support on newsroom AI',
    'February — Six-week AI training across African newsrooms with DW Akademie',
  ] },
  { year: '2024', items: [
    '“AI in Action” workshop at Innovation Days, Serbia',
    'Trained dozens of trainers in responsible AI in Ethiopia',
    '“Leveraging AI & Podcasting” workshop at Radiodays Asia, Malaysia',
    'July — Two AI workshops for Nation Media Group and Royal Media Services in Kenya (with Futuremedia Lab; hosted by the U.S. Agency for Global Media)',
    'June — Responsible-AI workshop for public media with the Public Media Alliance, hosted by SABC — participants from Ghana, Lesotho, Namibia and Seychelles',
    'June — Six sessions over three weeks with the Moldova School of Journalism and DW Akademie: AI tools, ethics and newsroom AI policy',
    'Taught “Data Verification, Fact-Checking and AI” and “Data Visualisation and AI” at the British University in Egypt',
  ] },
  { year: '2023', items: [
    'October — Facilitated Innovation Lab 2023 in Namibia',
  ] },
];

const CONFERENCES = [
  { year: '2026', items: [
    'International Journalism Festival, Perugia — panel, supported by the Thomson Reuters Foundation',
    'Africa Editors Congress 2026, Kenya — “AI in the newsrooms of Africa”',
  ] },
  { year: '2025', items: [
    'Copenhagen Conference on Information Integrity — “AI and the future of media”',
    'PodFest, Moldova (October) — “the future of AI and podcasting”',
    'M20 Summit, Johannesburg — “regulation and AI in the media”',
    'Global Media Forum, Bonn (July) — DW Freedom workshop on AI',
  ] },
  { year: '2024', items: [
    'Radiodays Asia, Malaysia (September) — “Leveraging AI For Podcasting”',
    'Africa Media Perspectives, South Africa (June 22) — panel on AI’s impact on journalism, with Paul McNally, Dr Clare Cook, Mungo Soggot and Mallick Mnela',
  ] },
  { year: '2023', items: [
    'Egypt Media Forum (November 26) — journalist learning in the AI era',
    'Brave New Media Forum & Innovation Days, Serbia (November 17) — “AI in Podcasting”',
    'Radio Days Ethiopia (November) — AI and podcasting',
    'Africa Business Media Innovators 2023 (November) — “Building a Data-Driven and Technology Focused Newsroom”',
    'Media Freedom Festival (October 18–20) — “AI Unleashed: Empowering Minds in the Age of Artificial Intelligence”',
    'Jamfest, Johannesburg (October 17) — “AI Journalism in Africa”',
  ] },
];

const PRESS = [
  { year: '2025', items: [
    '“Survive and Thrive: The Media Viability Podcast” — Paul McNally on AI, the end of the web, and new media business models',
  ] },
  { year: '2024', items: [
    'CapeTalk, John Maytham’s Afternoon Drive — AI and self-driving cars',
    'PodCircle by DW Akademie (March) — Paul McNally on AI and podcasting',
    'BBC World Service — AI’s technical problems with race and sentience',
    'DW Akademie, Kyle James — “The Good, The Bad and The Ugly” of AI and podcasting (also featured by Podnews)',
    'Judge, WAN-IFRA “Best Use of AI in the Newsroom”',
  ] },
  { year: '2023', items: [
    'Power FM (October 20) — AI news presenters',
    'Podnews (October 17) — Develop AI’s podcast-creation app',
    'The Podcast Sessions (October 2023 issue) — the podcast-creation app',
    'African Journalism Educators’ Network (October) — “we need to make sure AI doesn’t leave African media behind”',
  ] },
];

export default function BeAIReadyAbout() {
  return (
    <div className="hub hub-beaiready">
      {/* Hero — business-forward */}
      <section style={{ marginBottom: 40 }}>
        <div style={label}>About · for organisations of every size, public or private</div>
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: '6px 0 12px', color: CHARCOAL, letterSpacing: '-0.01em' }}>
          Develop&nbsp;AI — getting your business ready for an AI-first world
        </h1>
        <p style={{ ...lede, maxWidth: '70ch', fontSize: 16.5 }}>
          Develop&nbsp;AI is an AI consultancy and training company that helps businesses and newsrooms adopt
          artificial intelligence responsibly — and use it to their advantage. <strong>Be&nbsp;AI&nbsp;Ready</strong> is
          our structured programme for organisations of every size: capture what your business already knows,
          train your team, keep your AI safe and legal, put the right tools in people’s hands, and prove the
          results. It’s the same work that has helped businesses and 100+ newsrooms across the Global South and
          Eastern Europe stop worrying about AI and start using it.
        </p>
      </section>

      {/* Stats */}
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 40 }}>
        <Stat n="100+" label="newsrooms & businesses helped to implement or build AI" />
        <Stat n="12+" label="countries where we’ve trained people to use AI" />
        <Stat n="5" label="regions — Africa, Europe, MENA, Asia & the Pacific" />
        <Stat n="2023" label="founded — a South African company and nonprofit foundation" />
      </section>

      {/* Helping businesses — the emphasis */}
      <Section kicker="For your business" title="How we help you get AI-ready">
        <p style={{ ...lede, maxWidth: '72ch', marginBottom: 16 }}>
          AI is reshaping every industry, and millions of roles with it. We make sure it works <em>for</em> your
          business, not against it — giving you the strategy, skills and safeguards to adopt AI with confidence,
          whatever your size or sector.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {SERVICES.map(([t, d]) => (
            <div key={t} style={{ ...card, padding: '14px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: CHARCOAL, marginBottom: 3 }}>{t}</div>
              <div style={{ fontSize: 13, color: '#6b6359', lineHeight: 1.5 }}>{d}</div>
            </div>
          ))}
        </div>
        <p style={{ ...lede, marginTop: 16 }}>
          <Link to="/training" style={{ color: TERRACOTTA, fontWeight: 600 }}>Book a training →</Link>
          &nbsp;&nbsp;·&nbsp;&nbsp;
          <a href="mailto:paul@developai.co.za?subject=Be%20AI%20Ready%20consultation" style={{ color: TERRACOTTA, fontWeight: 600 }}>Ask for a consultation →</a>
        </p>
      </Section>

      {/* Mission */}
      <Section kicker="Why we exist" title="AI that works for your business — responsibly">
        <div style={{ ...card, borderLeft: `3px solid ${TERRACOTTA}` }}>
          <p style={{ ...lede, margin: 0 }}>
            We exist to make sure artificial intelligence <strong>strengthens businesses rather than disrupting
            them</strong> — especially the organisations that don’t have a big tech team or budget to spare. We
            help you adopt AI responsibly and on your own terms: a strategy that fits your goals, tools your
            people can trust, your data kept safe, and a policy you own. That same commitment carries into our
            work with newsrooms and civil society — making sure AI supports, rather than undermines, journalism,
            justice and public accountability, especially where institutions are fragile and resources are limited.
          </p>
        </div>
      </Section>

      {/* Projects */}
      <Section kicker="AI projects" title="We build AI that fixes systems that are neglected or broken">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div style={card}>
            <div style={{ fontWeight: 800, fontSize: 16, color: CHARCOAL }}>GROUNDED</div>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, color: '#4a453f', margin: '6px 0 0' }}>
              Fully open-source, shared AI infrastructure for African newsrooms — a set of AI agents and tools
              that builders combine into workflows, deploy locally on their own hardware, and share across the
              network.
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

      {/* Training history — the full record */}
      <Section kicker="Where we’ve worked" title="Training, workshops & coaching">
        <img src="/developai/training.jpg" alt="Develop AI training workshop"
          style={{ width: '100%', maxHeight: 300, objectFit: 'cover', borderRadius: 14, border: '1px solid #eee5da', marginBottom: 18 }} />
        <p style={{ ...lede, maxWidth: '72ch', marginBottom: 18 }}>
          We’ve trained hundreds of people across a dozen-plus countries, partnering with DW Akademie, the U.S.
          Agency for Global Media, the Thomson Reuters Foundation, the Public Media Alliance and International
          Media Support. A selection of recent work:
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

      {/* Conferences — full list */}
      <Section kicker="On stage" title="Conference appearances">
        <Timeline groups={CONFERENCES} />
      </Section>

      {/* Press / news — full list */}
      <Section kicker="In the press" title="News, coverage & interviews">
        <Timeline groups={PRESS} />
      </Section>

      {/* Community */}
      <Section kicker="Community" title="Join the conversation">
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            {/* Cover background (not <img>) so it fills its half and stretches to the
                text height without ever inflating to the image's intrinsic size. */}
            <div role="img" aria-label="Develop AI community"
              style={{ backgroundImage: 'url(/developai/community.webp)', backgroundSize: 'cover', backgroundPosition: 'center', minHeight: 240 }} />
            <div style={{ padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 14, justifyContent: 'center' }}>
              <p style={{ ...lede, margin: 0 }}>
                Join our <strong>free WhatsApp community</strong> — a vibrant space to trade perspectives on how AI
                is reshaping the world, with people asking the same questions across the Global South and beyond.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['Employment', 'Media', 'Education', 'Health', 'Justice', 'Mining'].map((t) => (
                  <span key={t} style={{ fontSize: 12, fontWeight: 600, color: '#7a4636', background: '#f7ece7', padding: '4px 11px', borderRadius: 999 }}>{t}</span>
                ))}
              </div>
              <a href="https://chat.whatsapp.com/Ctmp2x2H3PyCfzCWakok0E" target="_blank" rel="noreferrer"
                style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 8, background: '#25D366', color: '#fff', fontWeight: 700, fontSize: 14, padding: '11px 20px', borderRadius: 10, textDecoration: 'none' }}>
                Join on WhatsApp ↗
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* Newsletter — prominent, both platforms */}
      <Section kicker="Newsletter" title="The Develop AI Newsletter">
        <div style={{ ...card, display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <p style={{ ...lede, margin: 0, flex: '1 1 320px' }}>
            Our regular newsletter on AI and its impact on the world — practical, and written for people doing
            real work. Read it wherever you already are:
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href="https://developai.substack.com/" target="_blank" rel="noreferrer"
              style={{ background: TERRACOTTA, color: '#fff', fontWeight: 700, fontSize: 14, padding: '10px 18px', borderRadius: 8, textDecoration: 'none' }}>
              Subscribe on Substack ↗
            </a>
            <a href="https://www.linkedin.com/newsletters/develop-ai-daily-7352955707991777282/" target="_blank" rel="noreferrer"
              style={{ background: '#fff', color: TERRACOTTA, fontWeight: 700, fontSize: 14, padding: '10px 18px', borderRadius: 8, textDecoration: 'none', border: `1px solid ${TERRACOTTA}` }}>
              Follow on LinkedIn ↗
            </a>
          </div>
        </div>
      </Section>

      {/* Contact */}
      <section style={{ background: CHARCOAL, color: '#f2ede7', borderRadius: 16, padding: '28px 26px', marginBottom: 8 }}>
        <div style={{ ...label, color: TERRACOTTA }}>Get in touch</div>
        <h2 style={{ ...h2, color: '#fff', marginTop: 6 }}>Talk to us about your AI strategy</h2>
        <p style={{ fontSize: 14.5, lineHeight: 1.6, color: '#cfc7bd', maxWidth: '62ch', marginBottom: 16 }}>
          Whether you’re a business or a newsroom, we can help you adopt AI in a way that fits your values,
          your workflows and your budget.
        </p>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', fontSize: 14 }}>
          <a href="mailto:paul@developai.co.za" style={{ color: '#fff', fontWeight: 700 }}>paul@developai.co.za</a>
          <a href="https://developai.co.za" target="_blank" rel="noreferrer" style={{ color: TERRACOTTA }}>developai.co.za ↗</a>
          <a href="https://developai.substack.com/" target="_blank" rel="noreferrer" style={{ color: TERRACOTTA }}>Newsletter ↗</a>
          <Link to="/training" style={{ color: TERRACOTTA }}>Book a training →</Link>
        </div>
      </section>
    </div>
  );
}
