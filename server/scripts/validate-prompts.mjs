// validate-prompts.mjs — the engine that makes "proven" real.
//   npm run validate-prompts
//
// Reads prompts with validation_status in ('pending','draft'), runs each through
// promptfoo (https://promptfoo.dev, MIT) against the models whose API keys are
// configured, writes a prompt_model_validations row per model, and sets a prompt
// to 'proven' ONLY if it passes the threshold on at least one model. Otherwise it
// stays 'draft'. We NEVER hand-assert quality.
//
// Graceful degradation (by design):
//   • a model whose API key is absent           → that model marked 'untested'
//   • promptfoo not installed / a run/parse error → that model 'untested', run continues
// So with no keys (or no promptfoo) this runs cleanly and leaves everything 'draft'.
//
// Fixtures: uses server/fixtures/real/* if present (your private client docs,
// gitignored), else server/fixtures/public/* (shareable NRM2 stand-ins).
//
// NOTE: promptfoo's config/assertion + output-JSON shape evolve — the runPromptfoo()
// block is isolated and defensively parsed; confirm against current promptfoo docs
// before relying on scores. Required env keys live in .env.example.
import { readdir, readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import pool from '../db/pool.js';
import { providerStatus } from '../lib/models.js';

const here = dirname(fileURLToPath(import.meta.url));            // server/scripts
const serverDir = resolve(here, '..');                          // server
const PASS_THRESHOLD = 70;                                      // 0–100; ≥ this = pass

// Our model keys → the provider whose API key powers them (providerStatus()).
const MODEL_PROVIDER = { claude: 'anthropic', gpt: 'openai', gemini: 'gemini', copilot: null, meta: null };
const MODEL_LABEL = { claude: 'Claude', gpt: 'ChatGPT', gemini: 'Gemini', copilot: 'Copilot', meta: 'Meta AI' };
// Concrete model ids promptfoo understands (override via env if you prefer).
const PROVIDER_PFID = {
  anthropic: process.env.PF_ANTHROPIC_MODEL || 'anthropic:messages:claude-sonnet-4-6',
  openai: process.env.PF_OPENAI_MODEL || 'openai:gpt-4o-mini',
  gemini: process.env.PF_GEMINI_MODEL || 'google:gemini-1.5-flash',
};
const band = (r) => (r >= 85 ? 'excellent' : r >= 70 ? 'good' : r >= 50 ? 'fair' : 'poor');

function promptfooAvailable() {
  try { execFileSync('npx', ['--no-install', 'promptfoo', '--version'], { stdio: 'ignore', timeout: 15000 }); return true; }
  catch { return false; }
}

async function pickFixtures() {
  const real = join(serverDir, 'fixtures', 'real');
  const pub = join(serverDir, 'fixtures', 'public');
  for (const dir of [real, pub]) {
    if (!existsSync(dir)) continue;
    const files = (await readdir(dir)).filter((f) => !f.toLowerCase().startsWith('readme') && /\.(txt|md|csv)$/i.test(f));
    if (files.length) {
      const contents = [];
      for (const f of files.slice(0, 3)) contents.push(await readFile(join(dir, f), 'utf8'));
      return { dir, sample: contents.join('\n\n---\n\n').slice(0, 6000) };
    }
  }
  return { dir: null, sample: '' };
}

// Run one prompt against one provider via promptfoo. Returns {rating,pass,evidence} or null on failure.
async function runPromptfoo(prompt, providerId, sample) {
  const dir = await mkdtemp(join(tmpdir(), 'pf-'));
  try {
    // The prompt body, with the fixture injected as {{input}} (templated prompts get a var).
    const promptText = prompt.body.includes('{{') ? prompt.body : `${prompt.body}\n\nINPUT:\n{{input}}`;
    const config = {
      prompts: [promptText],
      providers: [providerId],
      tests: [{
        vars: { input: sample || 'N/A' },
        assert: [{
          type: 'llm-rubric',
          value: `The response correctly accomplishes this task: "${prompt.description || prompt.title}". It is well-structured, follows the instructions, and invents no facts.`,
        }],
      }],
    };
    await writeFile(join(dir, 'pf.json'), JSON.stringify(config));
    execFileSync('npx', ['--no-install', 'promptfoo', 'eval', '-c', join(dir, 'pf.json'), '-o', join(dir, 'out.json'), '--no-progress-bar'],
      { stdio: 'ignore', timeout: 180000, cwd: serverDir });
    const out = JSON.parse(await readFile(join(dir, 'out.json'), 'utf8'));
    // Defensive: promptfoo output shape varies by version. Find a 0–1 score.
    const results = out.results?.results || out.results || [];
    const scores = results.map((r) => (typeof r.score === 'number' ? r.score : (r.success ? 1 : 0))).filter((n) => !Number.isNaN(n));
    if (!scores.length) return null;
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const rating = Math.round(avg * 100);
    return { rating, pass: rating >= PASS_THRESHOLD, evidence: { tool: 'promptfoo', avg_score: avg, tests: results.length } };
  } catch (err) {
    console.warn(`    promptfoo run failed (${err.message.split('\n')[0]}) — marking untested`);
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function upsertValidation(promptId, modelKey, { status, rating = null, evidence = null }) {
  const validatedAt = status === 'validated' ? new Date().toISOString() : null;
  await pool.query(
    `INSERT INTO prompt_model_validations (prompt_id, model_key, model_label, rating, band, status, evidence, validated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
     ON CONFLICT (prompt_id, model_key) DO UPDATE SET
       model_label=EXCLUDED.model_label, rating=EXCLUDED.rating, band=EXCLUDED.band,
       status=EXCLUDED.status, evidence=EXCLUDED.evidence, validated_at=EXCLUDED.validated_at, updated_at=NOW()`,
    [promptId, modelKey, MODEL_LABEL[modelKey], rating, rating == null ? null : band(rating), status, evidence ? JSON.stringify(evidence) : null, validatedAt]
  );
}

async function main() {
  const status = await providerStatus();
  const configured = Object.fromEntries(Object.entries(MODEL_PROVIDER).map(([m, p]) => [m, !!(p && status[p]?.configured)]));
  const pfOk = promptfooAvailable();
  const { dir: fxDir, sample } = await pickFixtures();

  console.log('validate-prompts:');
  console.log('  models with keys:', Object.entries(configured).filter(([, v]) => v).map(([m]) => m).join(', ') || 'none');
  console.log('  promptfoo installed:', pfOk, pfOk ? '' : '(install with: npm install -D promptfoo)');
  console.log('  fixtures:', fxDir || 'none found');

  const { rows: prompts } = await pool.query("SELECT id, title, body, description FROM prompts WHERE validation_status IN ('pending','draft')");
  console.log(`  prompts to validate: ${prompts.length}\n`);

  let proven = 0;
  for (const p of prompts) {
    console.log(`• ${p.title}`);
    let anyPass = false;
    for (const modelKey of Object.keys(MODEL_PROVIDER)) {
      if (!configured[modelKey] || !pfOk) { await upsertValidation(p.id, modelKey, { status: 'untested' }); continue; }
      const r = await runPromptfoo(p, PROVIDER_PFID[MODEL_PROVIDER[modelKey]], sample);
      if (!r) { await upsertValidation(p.id, modelKey, { status: 'untested' }); continue; }
      await upsertValidation(p.id, modelKey, { status: r.pass ? 'validated' : 'failed', rating: r.rating, evidence: r.evidence });
      console.log(`    ${modelKey}: ${r.pass ? 'validated' : 'failed'} (${r.rating}/100)`);
      if (r.pass) anyPass = true;
    }
    // 'proven' ONLY when a real run passed; otherwise stays draft.
    await pool.query('UPDATE prompts SET validation_status=$1, updated_at=NOW() WHERE id=$2', [anyPass ? 'proven' : 'draft', p.id]);
    if (anyPass) proven += 1;
  }
  console.log(`\nDone: ${proven}/${prompts.length} now proven; the rest remain draft.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
