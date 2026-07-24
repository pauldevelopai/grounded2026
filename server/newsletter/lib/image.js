// image.js — Component 3: one symbolic header image per issue.
//
// Two stages: a tiny Haiku call turns the lead story into an ABSTRACT visual
// concept, then OpenAI gpt-image-1 renders it behind a fixed house style so
// every issue looks like the same publication.
//
// Hard guardrails: symbolic only — no real faces, no logos, no text in the
// image. And image failure NEVER blocks the newsletter: on any error we return
// { imagePath: null, error } and the issue ships without a picture.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../../config.js';
import { callClaude } from '../../services/claude.js';
import { MODELS, IMAGE_STYLE_PREFIX } from './pillars.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../../../uploads/newsletter');
const ARCHIVE_DIR = path.resolve(__dirname, '../archive');

const SIZE = process.env.NEWSLETTER_IMAGE_SIZE || '1536x1024'; // landscape Substack header
const QUALITY = process.env.NEWSLETTER_IMAGE_QUALITY || 'medium';

export function newsletterImageDir() { return UPLOAD_DIR; }

async function conceptFor(leadStory) {
  const raw = await callClaude({
    model: MODELS.imageConcept,
    system: 'You turn a news story into a single symbolic editorial illustration concept. Abstract and symbolic only. No real people, no real logos, no brand marks, no text in the image. Reply with ONE sentence describing the concept, nothing else.',
    userContent: `Story: ${leadStory.headline || leadStory.title}\n${leadStory.what_happened || leadStory.nl_one_line || ''}`.slice(0, 800),
    maxTokens: 120,
    temperature: 0.7,
  });
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

/**
 * Generate the header image for an issue.
 * @param {object} leadStory  the first story of the lead section (or a raw item)
 * @param {string} isoDate    YYYY-MM-DD
 * @returns {Promise<{ imagePath: string|null, servedPath: string|null, concept: string|null, error: string|null }>}
 */
export async function generateHeaderImage(leadStory, isoDate, { log = console.log } = {}) {
  if (!config.openaiApiKey) {
    const msg = 'OPENAI_API_KEY not set — skipping header image';
    log(`[nl-image] ${msg}`);
    return { imagePath: null, servedPath: null, concept: null, error: msg };
  }
  if (!leadStory) {
    return { imagePath: null, servedPath: null, concept: null, error: 'no lead story for image' };
  }

  try {
    const concept = await conceptFor(leadStory);
    const prompt = `${IMAGE_STYLE_PREFIX} ${concept}`;
    log(`[nl-image] concept: ${concept}`);

    const res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'gpt-image-1', prompt, size: SIZE, quality: QUALITY, n: 1 }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error('OpenAI returned no image data');

    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
    const buf = Buffer.from(b64, 'base64');
    const served = path.join(UPLOAD_DIR, `${isoDate}-header.png`);
    const archived = path.join(ARCHIVE_DIR, `${isoDate}-header.png`);
    fs.writeFileSync(served, buf);
    fs.writeFileSync(archived, buf);

    log(`[nl-image] saved ${served} (${Math.round(buf.length / 1024)} KB)`);
    return {
      imagePath: `newsletter/archive/${isoDate}-header.png`,
      servedPath: served,
      concept,
      error: null,
    };
  } catch (err) {
    log(`[nl-image] FAILED (issue still ships): ${err.message}`);
    return { imagePath: null, servedPath: null, concept: null, error: err.message };
  }
}
