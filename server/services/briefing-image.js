// briefing-image.js — source a RELEVANT hero photo for a daily briefing by scraping the
// Open Graph image off its top cited-source article, downloading it, and self-hosting it
// under uploads/briefings/<category>.<ext>. Served publicly (same-origin, reliable) via
// GET /api/public/briefing-image/:category. Refreshed whenever the briefing regenerates.
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'node:fs';
import path from 'node:path';

const UPLOAD_ROOT = path.resolve(process.cwd(), '..', 'uploads');
const DIR = path.join(UPLOAD_ROOT, 'briefings');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TYPE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const EXTS = Object.values(TYPE_EXT);
export const EXT_TYPE = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

export function briefingImageDir() { return DIR; }

// Read the og:image (or twitter:image) URL from an article page.
async function ogImage(articleUrl) {
  try {
    const { data } = await axios.get(articleUrl, { timeout: 9000, headers: { 'User-Agent': UA }, maxRedirects: 4 });
    const $ = cheerio.load(data);
    const raw = $('meta[property="og:image"]').attr('content')
      || $('meta[property="og:image:url"]').attr('content')
      || $('meta[name="twitter:image"]').attr('content')
      || $('meta[name="twitter:image:src"]').attr('content')
      || '';
    return raw ? new URL(raw, articleUrl).href : null;   // resolve any relative URL
  } catch { return null; }
}

// Download an image URL to uploads/briefings/<category>.<ext>. Returns the ext or null.
async function downloadTo(imageUrl, category) {
  try {
    const res = await axios.get(imageUrl, {
      timeout: 12000, responseType: 'arraybuffer', maxRedirects: 4, maxContentLength: 8 * 1024 * 1024,
      headers: { 'User-Agent': UA, Referer: new URL(imageUrl).origin + '/' },
    });
    const type = String(res.headers['content-type'] || '').split(';')[0].trim();
    const ext = TYPE_EXT[type];
    if (!ext) return null;                                   // not a servable image type
    const buf = Buffer.from(res.data);
    if (buf.length < 2048 || buf.length > 8 * 1024 * 1024) return null;   // too small (tracking pixel) / too big
    fs.mkdirSync(DIR, { recursive: true });
    for (const e of EXTS) { const p = path.join(DIR, `${category}.${e}`); try { fs.existsSync(p) && fs.unlinkSync(p); } catch { /* ignore */ } }
    fs.writeFileSync(path.join(DIR, `${category}.${ext}`), buf);
    return ext;
  } catch { return null; }
}

// Try each cited source in turn until one yields a usable image. Returns a same-origin
// served URL (with a date cache-buster so browsers refresh it daily) or null.
export async function sourceHeroImage(category, headlines = []) {
  const urls = (headlines || []).map((h) => h && h.url).filter(Boolean).slice(0, 4);
  for (const u of urls) {
    const img = await ogImage(u);
    if (!img) continue;
    const ext = await downloadTo(img, category);
    if (ext) {
      const v = new Date().toISOString().slice(0, 10);
      return `/api/public/briefing-image/${category}?v=${v}`;
    }
  }
  return null;
}
