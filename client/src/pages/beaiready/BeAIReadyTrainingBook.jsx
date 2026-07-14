// BeAIReadyTrainingBook — /training/book on the BE AI READY site. The PUBLIC advert
// for the one-day training: the three courses we teach, how the day works, the
// offering, the track record, and the booking CTA. Deliberately NOT gated and NOT
// client-specific — this is the page a prospect lands on from "Book a training".
// The signed-in client's own agenda and materials live on the separate, gated
// /training page.
import { Link } from 'react-router-dom';

const TRAINING_WHATSAPP =
  'https://wa.me/27722337458?text=' +
  encodeURIComponent("Hi, I'd like to book a Be AI Ready training day.");

const TERRACOTTA = '#c75b39';
const CHARCOAL = '#211d18';
const BODY = '#4a443d';
const BORDER = '#ead9d0';

// Self-contained line icons (no external images) — one visual per course.
const ICONS = {
  governance: (
    <>
      <path d="M12 3l7 3v5c0 4.6-3.1 7.7-7 9-3.9-1.3-7-4.4-7-9V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  cyber: (
    <>
      <rect x="4.5" y="10.5" width="15" height="9.5" rx="2" />
      <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
      <path d="M12 14.5v2.5" />
    </>
  ),
  understanding: (
    <>
      <path d="M9.5 18h5" />
      <path d="M10.5 21h3" />
      <path d="M12 3a6 6 0 0 0-3.8 10.6c.7.6 1.1 1.4 1.2 2.4h5.2c.1-1 .5-1.8 1.2-2.4A6 6 0 0 0 12 3z" />
    </>
  ),
};

const COURSES = [
  { key: 'governance', name: 'AI Governance',
    desc: 'Use AI without landing your business in trouble. Policy, risk, legal exposure, and the guardrails that let your team move fast — safely.' },
  { key: 'cyber', name: 'Cyber Security',
    desc: 'Where AI and security meet. Protecting your data, spotting AI-enabled threats, and keeping staff from leaking what matters.' },
  { key: 'understanding', name: 'Understanding AI',
    desc: 'The one that demystifies it. What these tools actually are, what they can and can’t do, and how your people put them to work day to day.' },
];

function CourseIcon({ name }) {
  return (
    <span style={{
      width: 52, height: 52, borderRadius: 14, background: TERRACOTTA,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff"
           strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {ICONS[name]}
      </svg>
    </span>
  );
}

function Check() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={TERRACOTTA}
         strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
         style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export default function BeAIReadyTrainingBook() {
  return (
    <div className="hub hub-beaiready">
      <section className="hub-hero">
        <div className="hub-eyebrow">Hands-on training</div>
        <h1>One day that changes how your team works with AI.</h1>
        <p className="hub-lede">
          Audits tell you where you stand. <b>Training changes what your people do on Monday
          morning.</b> Choose from three focused one-day courses — delivered on-site anywhere in South
          Africa, and tailored to your business, your tools and your real work.
        </p>
        <div className="hub-hero-cta">
          <a href={TRAINING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">
            Book a training day
          </a>
        </div>
      </section>

      {/* ── The three courses, each with its own visual ── */}
      <div className="hub-section-label">What we teach — three one-day courses</div>
      <section style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
        gap: 18, marginBottom: 40,
      }}>
        {COURSES.map((c) => (
          <article key={c.key} style={{
            background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 16,
            padding: '22px 22px 24px', boxShadow: '0 4px 18px rgba(90,45,20,0.06)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <CourseIcon name={c.key} />
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 750, color: CHARCOAL, letterSpacing: '-0.01em' }}>
              {c.name}
            </h3>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: BODY }}>{c.desc}</p>
          </article>
        ))}
      </section>

      <section className="hub-band">
        <h2>Every engagement starts with a deep needs assessment.</h2>
        <p>
          Before we teach anything, we learn your business, your tools and the work your team does every
          day. Then we tailor the session to fit — one course, or a blend of all three — so the day maps
          to what your people actually need, not an off-the-shelf syllabus.
        </p>
      </section>

      <div className="hub-section-label">How the day works</div>
      <section className="hub-grid">
        <div className="hub-card">
          <div className="hub-card-kicker">Tailored</div>
          <p>To your business — your tools, your data, your everyday tasks. Not a generic slideshow.</p>
        </div>
        <div className="hub-card">
          <div className="hub-card-kicker">Practical</div>
          <p>Hands-on the whole day. Everyone works with AI; nobody just watches.</p>
        </div>
        <div className="hub-card">
          <div className="hub-card-kicker">Mentored</div>
          <p>Three follow-up sessions included — the day is the start, not the product.</p>
        </div>
      </section>

      {/* ── The offering: the clear, unmistakable price + what's included ── */}
      <section style={{
        border: `2px solid ${TERRACOTTA}`, borderRadius: 18, overflow: 'hidden',
        margin: '8px 0 36px', background: '#fff',
      }}>
        <div style={{ background: TERRACOTTA, color: '#fff', padding: '20px 26px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.9 }}>
            The offering
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
            <span style={{ fontSize: 40, fontWeight: 820, letterSpacing: '-0.02em', lineHeight: 1 }}>R35,000</span>
            <span style={{ fontSize: 15, opacity: 0.92 }}>per one-day course — one full day + three mentoring sessions</span>
          </div>
        </div>
        <div style={{ padding: '22px 26px 24px' }}>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
            {[
              'A full day on-site with your team, anywhere in South Africa (travel and accommodation excluded).',
              'Up to 30 people in the room.',
              'Three 45-minute mentoring sessions in the weeks that follow — guiding implementation and making the habits stick.',
              'All training and mentoring materials live on in your dashboard, for your staff, at any time.',
            ].map((line, i) => (
              <li key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', fontSize: 15, lineHeight: 1.55, color: BODY }}>
                <Check />{line}
              </li>
            ))}
          </ul>
          <div style={{ marginTop: 22 }}>
            <a href={TRAINING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">
              Book a training day
            </a>
          </div>
        </div>
      </section>

      <section className="hub-band">
        <h2>Trained across Africa, Europe and beyond.</h2>
        <p>
          Develop&nbsp;AI has trained teams from Cape Town and Johannesburg to Zambia, Zimbabwe, Kenya,
          Namibia, Moldova and Ukraine — on behalf of international organisations including
          DW&nbsp;Akademie (Germany), the Thomson Reuters Foundation (UK) and International Media
          Support (Denmark). That experience is distilled into a format judged on one thing: whether
          your team actually uses AI better afterwards.
        </p>
      </section>

      <section className="hub-band" style={{ background: '#f4f1ec' }}>
        <p style={{ margin: 0 }}>
          Training pairs naturally with the <Link to="/audit">Be AI Ready audit</Link> — train first,
          then audit; or audit first, then train against the findings. Either order works.
        </p>
      </section>

      <div className="hub-hero-cta" style={{ margin: '8px 0 24px' }}>
        <a href={TRAINING_WHATSAPP} target="_blank" rel="noreferrer" className="hub-btn hub-btn-solid">
          Book a training day
        </a>
        <Link to="/audit" className="hub-btn hub-btn-ghost">See the audit</Link>
      </div>
    </div>
  );
}
