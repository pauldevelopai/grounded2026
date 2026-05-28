// The 8 journalism agents, as workflow blocks (Phase 5).
//
// Five are Claude-only and live now (their core AI action ported via the shared,
// profile-aware aiRun). Three lean on multi-GB LOCAL models we deferred on the
// lean box (Archivist=embeddings, Translator=NLLB, Producer=audio) — they ship
// as "coming soon" shells: visible + droppable, but run() is blocked so nothing
// downloads. Agent slugs are 'agent-*' to coexist with the Node blocks.
import { register } from './registry.js';
import { aiRun } from './ai.js';

function comingSoonRun(name) {
  return async () => {
    const e = new Error(`The ${name} agent is coming soon — its local AI models aren't enabled on this deployment yet.`);
    e.code = 'AGENT_COMING_SOON';
    throw e;
  };
}

// ── Verifier ─────────────────────────────────────────────────────────────────
register({
  slug: 'agent-verifier', name: 'Verifier', category: 'agent', icon: '✅',
  description: 'Multi-source claim verification — confidence tier, evidence, gaps, and a careful draft response. Never accuses.',
  inputs: { claim: { type: 'longtext', required: true, description: 'The claim to verify.' }, sources: { type: 'longtext', required: false, description: 'Optional sources/context you already have.' } },
  outputs: { output: { type: 'json' } },
  run: (i) => aiRun(
    `You are a careful newsroom verification agent. Verify the claim against the evidence given plus general knowledge. NEVER accuse anyone; state confidence honestly. ` +
    `Return ONLY JSON: {"tier":"verified|contested|likely_false|insufficient_evidence","reasoning":["..."],"evidence":["..."],"gaps":["..."],"further_checks":["..."],"draft_response":"..."}.`,
    `Claim:\n${i.claim || ''}\n\nSources / context:\n${i.sources || '(none)'}`, 2200),
});

// ── Researcher ───────────────────────────────────────────────────────────────
register({
  slug: 'agent-researcher', name: 'Researcher', category: 'agent', icon: '🔬',
  description: 'Builds a research dossier — key facts, players, timeline, open questions, and where to look next.',
  inputs: { topic: { type: 'longtext', required: true, description: 'The topic / question to research.' }, context: { type: 'longtext', required: false } },
  outputs: { output: { type: 'json' } },
  run: (i) => aiRun(
    `You are a newsroom researcher. Produce a research dossier. Return ONLY JSON: ` +
    `{"summary":"...","key_facts":["..."],"key_players":["..."],"timeline":[{"date":"...","event":"..."}],"open_questions":["..."],"where_to_look":["..."]}.`,
    `Topic:\n${i.topic || ''}\n\nContext:\n${i.context || '(none)'}`, 2400),
});

// ── Copywriter ───────────────────────────────────────────────────────────────
register({
  slug: 'agent-copywriter', name: 'Copywriter', category: 'agent', icon: '✍️',
  description: 'Drafts social copy, headlines, newsletter blurbs or scripts in your house style.',
  inputs: { brief: { type: 'longtext', required: true, description: 'What to write + the source material.' }, format: { type: 'string', required: false, description: 'social | headline | newsletter | script' } },
  outputs: { output: { type: 'json' } },
  run: (i) => aiRun(
    `You are a newsroom copywriter. Write in the house style. Format requested: "${i.format || 'social'}". ` +
    `Return ONLY JSON: {"variants":["..."],"recommended":"...","notes":"..."}.`,
    `Brief / source material:\n${i.brief || ''}`),
});

// ── Digital News Gatherer ────────────────────────────────────────────────────
register({
  slug: 'agent-news-gatherer', name: 'Digital News Gatherer', category: 'agent', icon: '📥',
  description: 'Triages an inbound tip/submission and recommends where to route it (verify, research, ops, or drop).',
  inputs: { submission: { type: 'longtext', required: true, description: 'The tip / submission / contributor piece.' } },
  outputs: { output: { type: 'json' } },
  run: (i) => aiRun(
    `You triage inbound newsroom submissions. Assess newsworthiness + risk, recommend routing. ` +
    `Return ONLY JSON: {"summary":"...","newsworthiness":"high|medium|low","risk_flags":["..."],"route_to":"verifier|researcher|operations|editor|drop","why":"..."}.`,
    `Submission:\n${i.submission || ''}`),
});

// ── Social Media Listener ────────────────────────────────────────────────────
register({
  slug: 'agent-social-listener', name: 'Social Media Listener', category: 'agent', icon: '📡',
  description: 'Analyses suspect social posts for coordinated / foreign-origin narratives and attribution signals.',
  inputs: { posts: { type: 'longtext', required: true, description: 'The post(s) / narrative to analyse.' }, context: { type: 'longtext', required: false } },
  outputs: { output: { type: 'json' } },
  run: (i) => aiRun(
    `You analyse the ORIGIN of suspect social content (not just what it says): coordination, talking-point lifts, foreign/state-aligned signals. ` +
    `Be descriptive, never accusatory. Return ONLY JSON: {"risk_label":"low|watch|strong_signals|highly_coordinated","flags":["..."],"reasoning":["..."],"further_checks":["..."],"do_not_publish":["..."]}.`,
    `Posts:\n${i.posts || ''}\n\nContext:\n${i.context || '(none)'}`, 2200),
});

// ── Coming-soon shells (local-model agents deferred on the lean box) ──────────
register({
  slug: 'agent-archivist', name: 'Archivist', category: 'agent', icon: '🗄️', comingSoon: true,
  description: 'Semantic search + knowledge graph over your own archive. (Needs local embeddings — coming soon.)',
  inputs: { query: { type: 'string', required: true } }, outputs: { results: { type: 'json' } },
  run: comingSoonRun('Archivist'),
});
register({
  slug: 'agent-translator', name: 'Translator', category: 'agent', icon: '🌍', comingSoon: true,
  description: 'English ↔ African languages with a newsroom glossary. (Needs local translation models — coming soon.)',
  inputs: { text: { type: 'longtext', required: true }, targetLanguage: { type: 'string', required: true } }, outputs: { translation: { type: 'json' } },
  run: comingSoonRun('Translator'),
});
register({
  slug: 'agent-producer', name: 'Audio & Video Producer', category: 'agent', icon: '🎬', comingSoon: true,
  description: 'Radio scripts, podcast outlines, audio assembly. (Needs local audio models — coming soon.)',
  inputs: { brief: { type: 'longtext', required: true } }, outputs: { output: { type: 'json' } },
  run: comingSoonRun('Audio & Video Producer'),
});
