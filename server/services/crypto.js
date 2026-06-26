// crypto.js — encryption at rest for sensitive client knowledge.
//
// A business's captured knowledge is stored ENCRYPTED in the database and only
// decrypted transiently, in memory, when the AI needs to read it to answer. Even with
// database or disk access, the text is ciphertext at rest.
//
// AES-256-GCM (authenticated — tampering is detected). Each tenant's data uses its own
// key, derived per-newsroom from a single master key via HKDF, so one client's key
// can't read another's data and there are no N keys to manage.
//
// Master key: env KNOWLEDGE_ENCRYPTION_KEY — 32 bytes, base64 or hex. Generate with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// If it's absent, encryption is simply OFF: values pass through as plaintext and reads
// still work — so nothing breaks before a key is set. Existing plaintext rows keep
// working after a key is set too (decrypt() returns non-'enc:v1:' values unchanged);
// only new writes get encrypted.
import crypto from 'node:crypto';
import config from '../config.js';

const PREFIX = 'enc:v1:';
const IV_LEN = 12;   // GCM standard nonce
const TAG_LEN = 16;

function masterKey() {
  const raw = config.knowledgeEncryptionKey || process.env.KNOWLEDGE_ENCRYPTION_KEY || '';
  if (!raw) return null;
  // Accept base64 (44 chars) or hex (64 chars); must decode to 32 bytes.
  let buf;
  try { buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64'); } catch { return null; }
  return buf.length === 32 ? buf : null;
}

export function isEncryptionEnabled() {
  return !!masterKey();
}

// Per-tenant 32-byte key, derived from the master key + the newsroom id (HKDF).
function tenantKey(master, newsroomId) {
  return Buffer.from(crypto.hkdfSync('sha256', master, Buffer.from('bair-knowledge'), Buffer.from(String(newsroomId || 'global')), 32));
}

// Encrypt a plaintext string for a tenant. Returns 'enc:v1:<base64>' or, if encryption
// is off / the input is empty, the plaintext unchanged.
export function encryptFor(newsroomId, plaintext) {
  const master = masterKey();
  if (!master || plaintext == null || plaintext === '') return plaintext;
  const key = tenantKey(master, newsroomId);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64');
}

// Decrypt a value for a tenant. Non-encrypted (legacy plaintext) values pass through.
// A wrong tenant / wrong key throws on the auth tag — we swallow it and return null so
// a mis-scoped read can never leak readable text.
export function decryptFor(newsroomId, value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const master = masterKey();
  if (!master) return null;   // encrypted data but no key → can't read
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv('aes-256-gcm', tenantKey(master, newsroomId), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
