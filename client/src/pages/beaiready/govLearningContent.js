// govLearningContent.js — the four Governance Learning units (Part 4).
// See docs/BUILD_bair-governance-assess-learn.md.
//
// ORIGINAL content in Develop AI's own words, using the four AIGP governance domains as a
// skeleton. It is applied ("how to govern the AI in your work"), tied to the GROUNDED
// features where relevant, so learning closes the loop with the Governance Assessment.
// It does NOT reproduce IAPP/AIGP copyrighted material, and completing it is professional
// development — NOT the AIGP credential.
//
// The catalogue (unit_no, title, domain, summary) is mirrored into bair.gov_learning_unit
// by migration 129; the section bodies + checks live here so the client can render them
// and track per-unit completion.

export const GOV_LEARNING_UNITS = [
  {
    unit_no: 1,
    domain: 1,
    title: 'Foundations of AI governance',
    summary: 'What AI governance is, why it matters for your business, and who is responsible for it.',
    minutes: 8,
    sections: [
      {
        heading: 'What we mean by AI governance',
        body: [
          'AI governance is the set of rules, roles and habits that keep your use of AI safe, legal and trustworthy. It is not about stopping your team using AI — it is about using it with your eyes open.',
          'The risks do not scale with headcount. A leaked client list, a biased decision, or a made-up "fact" published as truth can hurt a five-person business as badly as a large one. Governance is how a small business earns the right to move fast with AI.',
        ],
      },
      {
        heading: 'Responsible-AI principles, in plain terms',
        body: [
          'A handful of ideas do most of the work. Be transparent — say when AI was involved. Keep a human accountable — AI advises, people decide. Be fair — watch for AI that treats people differently. Protect data — do not feed AI what you would not put in an email to a stranger. Stay accurate — check before you trust.',
          'None of these are abstract. Each one becomes a concrete habit and, later, a control you can point to.',
        ],
      },
      {
        heading: 'Someone has to own it',
        body: [
          'Governance fails when it is "everyone\'s job", because that means no one\'s. Name one accountable owner, define what they are responsible for, and make sure staff know the basics and what is expected of them.',
          'In GROUNDED, that owner and their review routine live in Roles & Review — the same data your Governance Assessment reads when it checks whether accountability is in place.',
        ],
      },
    ],
    check: [
      {
        q: 'AI governance is mainly about…',
        options: ['Stopping your team from using AI', 'Using AI with clear rules, roles and accountability', 'Buying the most advanced AI tools'],
        answer: 1,
        why: 'Governance is about using AI safely and accountably — not banning it, and not about which tools are newest.',
      },
      {
        q: 'Who should be accountable for AI governance in your business?',
        options: ['Everyone, in general', 'A single named owner with a defined role', 'The company that sells you the AI tool'],
        answer: 1,
        why: 'Accountability needs a name. "Everyone" means no one, and the vendor is not accountable for how you use their tool.',
      },
    ],
  },

  {
    unit_no: 2,
    domain: 2,
    title: 'Laws, standards & frameworks',
    summary: 'The laws that apply when you use AI — POPIA first — plus the frameworks that set the bar.',
    minutes: 10,
    sections: [
      {
        heading: 'POPIA: the law you cannot ignore in South Africa',
        body: [
          'POPIA governs personal information. The moment you put a customer\'s name, ID number, contract or message into an AI tool, POPIA applies — even if the tool is free and the task feels trivial.',
          'The duties, in plain terms: only use personal information for the purpose you collected it; do not send it to a tool or country without a lawful basis; keep it secure; and be able to say what you hold and why.',
          'A practical rule for your whole team: before pasting anything into an AI tool, ask "is there personal information here, and am I allowed to send it there?" If you are unsure, treat the answer as no.',
        ],
      },
      {
        heading: 'Beyond POPIA: the other laws in the room',
        body: [
          'Intellectual property — who owns AI output, and did the AI train on someone else\'s protected work? Non-discrimination — an AI that screens CVs or sets prices can discriminate, and the liability is yours, not the tool\'s. Consumer protection and liability — if your AI misleads a customer, that is on your business.',
          'AI-specific law is arriving. The EU AI Act tiers AI systems by risk and sets duties for the riskier ones. Even a South-Africa-only business can be reached by it the moment it serves or processes the data of people in the EU.',
        ],
      },
      {
        heading: 'Frameworks: what "good" looks like',
        body: [
          'You do not have to invent governance from scratch. Recognised frameworks describe what mature AI governance looks like — the OECD AI principles, the NIST AI Risk Management Framework, and the ISO 42001 management-system standard.',
          'You do not need to certify against them today. But knowing they exist tells you where the bar sits, and your own AI policy can borrow their structure and language.',
        ],
      },
    ],
    check: [
      {
        q: 'You want to paste a customer\'s signed contract into an AI summariser. POPIA says…',
        options: ['Fine — it is just a summary', 'Stop — that is personal information; confirm you have a lawful basis and a secure tool first', 'POPIA only applies to banks and hospitals'],
        answer: 1,
        why: 'A signed contract is personal information. POPIA applies regardless of the tool being convenient or free.',
      },
      {
        q: 'You only serve South African customers, so the EU AI Act…',
        options: ['Can never affect you', 'Can still reach you if you ever serve or process the data of people in the EU', 'Replaces POPIA in South Africa'],
        answer: 1,
        why: 'Reach follows the people and their data, not your street address.',
      },
    ],
  },

  {
    unit_no: 3,
    domain: 3,
    title: 'Governing AI development',
    summary: 'Governing the AI you build or adopt — from choosing a tool to keeping it in check.',
    minutes: 9,
    sections: [
      {
        heading: 'Know what you are running',
        body: [
          'You cannot govern what you cannot see. The first control is a register: every AI tool and system in use, what it is for, who owns it, and what data it touches.',
          '"Shadow AI" — tools staff adopt quietly, without telling anyone — is the biggest blind spot in most businesses. In GROUNDED this is your AI System Register, and its risk tiers are exactly what the Governance Assessment reads for Domain 2.',
        ],
      },
      {
        heading: 'Controls: turning intent into safeguards',
        body: [
          'A control is a concrete safeguard, not a principle. "No client personal information in public chatbots." "A human signs off every AI-drafted contract." "We record which tool produced published content." Each is specific, owned, and linked to the systems it covers.',
          'Borrow framework-backed starter controls rather than starting from a blank page — then adapt them to how your business actually works. GROUNDED\'s Controls Library does exactly this.',
        ],
      },
      {
        heading: 'Data governance in the build',
        body: [
          'If you train, fine-tune, or feed data into an AI system, mind what goes in — consent, licence, and quality — because the output inherits the input\'s problems. "Garbage in, liability out."',
          'Test before you rely on it, monitor after you deploy it, and always keep a way to turn it off.',
        ],
      },
    ],
    check: [
      {
        q: 'The biggest blind spot in governing the AI your business uses is usually…',
        options: ['The tools on your official list', '"Shadow AI" — tools staff use that no one has logged', 'The electricity the tools consume'],
        answer: 1,
        why: 'You can only govern what you can see. Unlogged tools are the gap a register is designed to close.',
      },
      {
        q: 'A good control is…',
        options: ['A broad principle everyone nods along to', 'Specific, owned, and linked to the systems it covers', 'A one-off reminder email'],
        answer: 1,
        why: 'Controls only work when they are concrete, have an owner, and attach to real systems.',
      },
    ],
  },

  {
    unit_no: 4,
    domain: 4,
    title: 'Governing AI deployment & use',
    summary: 'Governing AI once it is live — deciding what is acceptable, watching it, and handling incidents.',
    minutes: 9,
    sections: [
      {
        heading: 'Decide before you rely',
        body: [
          'Before a tool goes into real work, make an acceptability call: approved, restricted (only for certain tasks or data), or avoid. Base it on what data the tool touches and what could go wrong if it fails.',
          'Third-party and vendor tools need the same scrutiny — if your supplier runs AI on your data, their risk becomes your risk.',
        ],
      },
      {
        heading: 'Keep it under review',
        body: [
          'Governance goes stale on its own. Set a cadence — quarterly is a sensible default — and actually hold the review: what changed, what new tools appeared, what nearly went wrong. Then log it.',
          'In GROUNDED this is Roles & Review, and a logged review cadence is exactly what the Governance Assessment checks for in Domain 4.',
        ],
      },
      {
        heading: 'When something goes wrong',
        body: [
          'You will have an incident eventually — a leak, a bad output published, a tool behaving unexpectedly. Have a simple path ready: who is told, what is done, what is logged, and what changes so it does not recur.',
          'A logged, handled incident is a sign of a maturing business, not a failing one.',
        ],
      },
    ],
    check: [
      {
        q: 'A third-party AI tool your supplier uses on your data…',
        options: ['Is not your concern', 'Carries risk that becomes your risk — assess it too', 'Is automatically POPIA-compliant because it is a paid product'],
        answer: 1,
        why: 'Outsourcing the tool does not outsource the responsibility; their risk lands on you.',
      },
      {
        q: 'Your AI governance review cadence should be…',
        options: ['Set once and never revisited', 'A set rhythm (e.g. quarterly) with reviews that are actually logged', 'Only ever after a disaster'],
        answer: 1,
        why: 'Governance decays; a regular, logged review is what keeps it current.',
      },
    ],
  },
];

// Convenience: the catalogue rows (kept in sync with migration 129's seed).
export const GOV_LEARNING_CATALOGUE = GOV_LEARNING_UNITS.map(({ unit_no, domain, title, summary }) => ({ unit_no, domain, title, summary }));
