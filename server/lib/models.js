// models.js — BE AI READY model/provider layer (the Models admin page).
// Resolves provider keys (env first, then a key saved via the admin UI), reports
// configured status WITHOUT exposing secrets, and offers one askModel() that
// talks to Claude / OpenAI-compatible (OpenAI, Groq) / Gemini / local Ollama.
import pool from '../db/pool.js';
import { callClaude } from '../services/claude.js';

export const PROVIDERS = {
  anthropic: { label: 'Anthropic (Claude)', envKey: 'ANTHROPIC_API_KEY', models: ['claude-opus-4-8', 'claude-haiku-4-5-20251001'] },
  openai:    { label: 'OpenAI (ChatGPT)',   envKey: 'OPENAI_API_KEY',    models: ['gpt-4o', 'gpt-4o-mini'], base: 'https://api.openai.com/v1', openaiCompat: true },
  gemini:    { label: 'Google (Gemini)',    envKey: 'GEMINI_API_KEY',    models: ['gemini-1.5-pro', 'gemini-1.5-flash'] },
  groq:      { label: 'Groq',               envKey: 'GROQ_API_KEY',      models: ['llama-3.3-70b-versatile'], base: 'https://api.groq.com/openai/v1', openaiCompat: true },
  ollama:    { label: 'Local (Ollama)',     envKey: null, urlSetting: 'ollama_url', models: ['llama3.1', 'mistral'] },
};

// The functions whose model is configurable, with sensible defaults.
export const FUNCTIONS = [
  { key: 'visibility_models', label: 'Visibility scan — which assistants to ask', multi: true, default: ['anthropic'] },
  { key: 'policy_model',      label: 'AI-policy generation', multi: false, default: 'anthropic' },
  { key: 'security_model',    label: 'Data-security assessment', multi: false, default: 'anthropic' },
  { key: 'chat_model',        label: 'Ask-For-Help chatbot', multi: false, default: 'anthropic' },
];

async function getSetting(key) {
  const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}
async function putSetting(key, value, userId) {
  await pool.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ($1,$2::jsonb,$3,NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, JSON.stringify(value), userId || null]
  );
}

// Key: env wins, then a key saved through the admin UI. Never returned to clients.
export async function getProviderKey(provider) {
  const p = PROVIDERS[provider];
  if (!p) return null;
  if (p.envKey && process.env[p.envKey]) return process.env[p.envKey];
  const saved = await getSetting(`secret.${provider}_key`);
  return typeof saved === 'string' ? saved : null;
}
export async function getOllamaUrl() {
  return process.env.OLLAMA_URL || (await getSetting('secret.ollama_url')) || 'http://localhost:11434';
}

// Vantage app URL — the deployed address of the standalone Vantage security
// system, surfaced as a launch link in the BE AI READY admin. NOT a secret
// (it's a plain URL), so it is stored under a non-`secret.` key and read back
// verbatim. env VANTAGE_URL wins if set.
export async function getVantageUrl() {
  const saved = await getSetting('vantage_url');
  return process.env.VANTAGE_URL || (typeof saved === 'string' ? saved : '') || '';
}
export async function saveVantageUrl(url, userId) {
  await putSetting('vantage_url', String(url || '').trim(), userId);
}

// Status for the admin page — booleans + source only, NO secret values.
export async function providerStatus() {
  const out = [];
  for (const [id, p] of Object.entries(PROVIDERS)) {
    let configured = false, source = null;
    if (id === 'ollama') {
      const saved = await getSetting('secret.ollama_url');
      configured = !!(process.env.OLLAMA_URL || saved);
      source = process.env.OLLAMA_URL ? 'env' : saved ? 'saved' : null;
    } else {
      if (p.envKey && process.env[p.envKey]) { configured = true; source = 'env'; }
      else if (await getSetting(`secret.${id}_key`)) { configured = true; source = 'saved'; }
    }
    out.push({ id, label: p.label, models: p.models, configured, source });
  }
  return out;
}

export async function saveProviderSecret(provider, value, userId) {
  const settingKey = provider === 'ollama' ? 'secret.ollama_url' : `secret.${provider}_key`;
  await putSetting(settingKey, String(value), userId);
}

export async function getModelConfig() {
  const saved = (await getSetting('beaiready.models')) || {};
  const cfg = {};
  for (const f of FUNCTIONS) cfg[f.key] = saved[f.key] ?? f.default;
  return cfg;
}
export async function saveModelConfig(cfg, userId) {
  await putSetting('beaiready.models', cfg, userId);
}

// One call, any provider. Returns plain text. Throws if the provider isn't configured.
export async function askModel({ provider, model, system, prompt, maxTokens = 600, temperature = 0.2 }) {
  const p = PROVIDERS[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);
  const useModel = model || p.models[0];

  if (provider === 'anthropic') {
    return String(await callClaude({ system, userContent: prompt, maxTokens, temperature }));
  }

  if (p.openaiCompat) {
    const key = await getProviderKey(provider);
    if (!key) throw new Error(`${p.label} is not configured`);
    const res = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: useModel, max_tokens: maxTokens, temperature,
        messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`${p.label}: HTTP ${res.status}`);
    const j = await res.json();
    return j.choices?.[0]?.message?.content || '';
  }

  if (provider === 'gemini') {
    const key = await getProviderKey('gemini');
    if (!key) throw new Error('Gemini is not configured');
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature } }),
    });
    if (!res.ok) throw new Error(`Gemini: HTTP ${res.status}`);
    const j = await res.json();
    return (j.candidates?.[0]?.content?.parts || []).map((x) => x.text).join('') || '';
  }

  if (provider === 'ollama') {
    const url = await getOllamaUrl();
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: useModel, stream: false,
        messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Ollama: HTTP ${res.status}`);
    const j = await res.json();
    return j.message?.content || '';
  }

  throw new Error(`Provider ${provider} not wired`);
}
