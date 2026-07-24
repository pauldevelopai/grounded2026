import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env'), override: true });

export default {
  port: parseInt(process.env.SERVER_PORT || process.env.PORT || '3001', 10),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/tracker',
  jwtSecret: process.env.JWT_SECRET || 'change-me-to-a-random-string',
  adminEmail: process.env.ADMIN_EMAIL || 'paul@developai.co.za',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  knowledgeEncryptionKey: process.env.KNOWLEDGE_ENCRYPTION_KEY || '',  // 32-byte base64/hex; encryption-at-rest is off if unset
  openaiApiKey: process.env.OPENAI_API_KEY || '',

  // ── Daily newsletter pipeline (The Daily System) ──
  // Fallback recipient for the 05:45 SAST "newsletter draft" email (Component 6).
  newsletterEmailTo: process.env.NEWSLETTER_EMAIL_TO || process.env.ADMIN_EMAIL || 'paul@developai.co.za',
  // Timezone the issue is dated in. All pipeline cron runs are wall-clock in this zone.
  newsletterTz: process.env.NEWSLETTER_TZ || 'Africa/Johannesburg',

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/api/gmail/callback',

  // ── Pulse (feature-flagged feedback-loop system; additive, off by default) ──
  // When pulseEnabled is false, every /api/pulse/* route 404s and no Pulse code
  // path executes. See server/pulse/ and CLAUDE.md (Pulse section).
  pulseEnabled: String(process.env.PULSE_ENABLED || 'false').toLowerCase() === 'true',
  airtableApiKey: process.env.AIRTABLE_API_KEY || '',
  airtableBaseId: process.env.AIRTABLE_BASE_ID || 'app4FVlF4AAy8Q8s2',
  githubToken: process.env.GITHUB_TOKEN || '',
  // Org that hosts the node repos (repo name resolved by convention: node-<slug>).
  githubOrg: process.env.PULSE_GITHUB_ORG || 'pauldevelopai',
  // Optional slug→repo overrides as JSON, e.g. {"verifier":"node-capitalfm-verifier"}.
  pulseNodeRepos: process.env.PULSE_NODE_REPOS || '',
  // Base URL used to build the public per-cycle answer link.
  publicBaseUrl: process.env.PUBLIC_BASE_URL || 'https://grounded.developai.co.za',
};
