// company-knowledge-ingest.js — bulk ingestion into KnowHow's company knowledge:
// many URLs at once, a sitemap crawl, or a public Google Drive folder. Each source is
// scraped / extracted → stored (encrypted) in beaiready_company_sources → indexed
// (chunk + embed) via indexSource. Ported from node-aiready lib/ingest.js + drive.js,
// adapted to the tracker's encrypted, newsroom_id-scoped model.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import pool from '../db/pool.js';
import { scrapeArticle } from './web-scraper.js';
import { extractText } from './document-processor.js';
import { encryptFor } from './crypto.js';
import { scheduleIndexing } from './company-knowledge-index.js';

const MAX_URLS = 150;                 // per bulk call
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const MIME = {
  gdoc: 'application/vnd.google-apps.document',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};

export function driveAvailable() { return !!process.env.GOOGLE_API_KEY; }

// Store one source (encrypted). Optional collection/role tag it into a Claims-Verifier mine.
// Chunking/embedding is NOT done here: at ~30ms a chunk it would keep a bulk import (up to
// 150 URLs, or a Drive folder) waiting for minutes. Callers store everything, then hand off
// to scheduleIndexing, which drains the backlog after the response has gone out.
async function storeAndIndex(newsroomId, userId, { kind, title, url = null, text, collection = null, role = 'reporting' }) {
  const { rows: [src] } = await pool.query(
    `INSERT INTO beaiready_company_sources (newsroom_id, kind, title, url, extracted_text, created_by, collection, role)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [newsroomId, kind, title, url, encryptFor(newsroomId, (text || '').slice(0, 20000)), userId, collection, role]);
  return src.id;
}

async function pooled(items, n, worker) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx], idx); }
  }));
}

function parseUrls(input) {
  if (Array.isArray(input)) return input.map((s) => String(s).trim()).filter((u) => /^https?:\/\//i.test(u));
  return String(input || '').split(/[\s,]+/).map((s) => s.trim()).filter((u) => /^https?:\/\//i.test(u));
}

// ── Many URLs at once ──
export async function ingestUrls(newsroomId, userId, input, { collection = null, role = 'reporting' } = {}) {
  const urls = [...new Set(parseUrls(input))].slice(0, MAX_URLS);
  const stats = { total: urls.length, added: 0, failed: 0, errors: [] };
  if (!urls.length) return { ...stats, message: 'Paste one or more page URLs (one per line).' };
  await pooled(urls, 4, async (url) => {
    try {
      const s = await scrapeArticle(url);
      if (!s.success || !s.text) { stats.failed++; stats.errors.push({ url, status: s.error || 'no readable text' }); return; }
      await storeAndIndex(newsroomId, userId, { kind: 'website', title: s.title || url, url, text: s.text, collection, role });
      stats.added++;
    } catch (e) { stats.failed++; stats.errors.push({ url, status: e.message }); }
  });
  if (stats.added) scheduleIndexing(newsroomId);
  return stats;
}

// ── Sitemap crawl → expand to page URLs → ingestUrls ──
export async function ingestSitemap(newsroomId, userId, sitemapUrl, opts = {}) {
  const url = String(sitemapUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) return { total: 0, added: 0, failed: 0, message: 'Enter a full sitemap URL (https://…/sitemap.xml).' };
  const urls = await expandSitemap(url, MAX_URLS);
  if (!urls.length) return { total: 0, added: 0, failed: 0, message: "Couldn't read any URLs from that sitemap. Check it's a sitemap.xml." };
  return ingestUrls(newsroomId, userId, urls, opts);
}

async function expandSitemap(url, limit, depth = 0) {
  const xml = await fetchText(url);
  if (!xml) return [];
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeXml(m[1]));
  if (/<sitemapindex[\s>]/i.test(xml) && depth < 1) {
    const out = [];
    for (const child of locs.slice(0, 50)) {
      if (out.length >= limit) break;
      out.push(...(await expandSitemap(child, limit - out.length, depth + 1)));
    }
    return [...new Set(out)].slice(0, limit);
  }
  return [...new Set(locs.filter((u) => /^https?:\/\//i.test(u)))].slice(0, limit);
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; KnowHow/1.0; +https://beaiready.developai.co.za)' } });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; } finally { clearTimeout(timer); }
}

function decodeXml(s) {
  return String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'");
}

// ── Public Google Drive folder ──
export function folderIdFromUrl(input) {
  const s = String(input || '').trim();
  let m = s.match(/\/folders\/([a-zA-Z0-9_-]+)/); if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9_-]+)/); if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{16,}$/.test(s)) return s;
  return null;
}

export async function ingestDriveFolder(newsroomId, userId, folderUrl, { collection = null, role = 'reporting' } = {}) {
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return { error: 'no_drive_key', message: 'Google Drive import needs a Google API key configured on the server. Use file upload or paste URLs instead.' };
  const folderId = folderIdFromUrl(folderUrl);
  if (!folderId) return { error: 'bad_folder', message: "That doesn't look like a Google Drive folder link." };
  let files;
  try { files = await listFolder(folderId, key); }
  catch (e) {
    if (e.status === 403 || e.status === 404) return { error: 'not_public', message: "That folder isn't shared as 'anyone with the link'. Set link-sharing to Viewer and try again." };
    return { error: 'drive_error', message: e.message };
  }
  const supported = files.filter((f) => [MIME.gdoc, MIME.docx, MIME.pdf].includes(f.mimeType) || /\.(html?|txt|md)$/i.test(f.name));
  const stats = { total: supported.length, added: 0, failed: 0, errors: [] };
  await pooled(supported, 3, async (f) => {
    try {
      const text = await driveFileText(f, key);
      if (!text || !text.trim()) { stats.failed++; stats.errors.push({ name: f.name, status: 'empty' }); return; }
      await storeAndIndex(newsroomId, userId, { kind: 'doc', title: stripExt(f.name), text, collection, role });
      stats.added++;
    } catch (e) { stats.failed++; stats.errors.push({ name: f.name, status: e.message }); }
  });
  if (stats.added) scheduleIndexing(newsroomId);
  return stats;
}

async function listFolder(folderId, key) {
  const out = [];
  let pageToken = '';
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const url = `${DRIVE_API}/files?q=${q}&key=${key}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType)`
      + (pageToken ? `&pageToken=${pageToken}` : '');
    const res = await fetch(url);
    if (!res.ok) { const err = new Error(`Drive list failed (${res.status})`); err.status = res.status; throw err; }
    const data = await res.json();
    out.push(...(data.files || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken && out.length < 5000);
  return out;
}

// Google Doc → export plain text; PDF/DOCX → download to a temp file → extractText;
// html/txt/md → download as text (html tags stripped).
async function driveFileText(f, key) {
  if (f.mimeType === MIME.gdoc) {
    const res = await fetch(`${DRIVE_API}/files/${f.id}/export?mimeType=text/plain&key=${key}`);
    if (!res.ok) throw new Error(`Drive export failed (${res.status})`);
    return await res.text();
  }
  const res = await fetch(`${DRIVE_API}/files/${f.id}?alt=media&key=${key}`);
  if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
  if (f.mimeType === MIME.pdf || f.mimeType === MIME.docx) {
    const buffer = Buffer.from(await res.arrayBuffer());
    const tmp = path.join(os.tmpdir(), `kh-${crypto.randomUUID()}`);
    fs.writeFileSync(tmp, buffer);
    try { return await extractText(tmp, f.mimeType); }
    finally { try { fs.unlinkSync(tmp); } catch { /* ignore */ } }
  }
  const raw = await res.text();
  return /\.html?$/i.test(f.name) ? raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : raw;
}

function stripExt(name) { return String(name || '').replace(/\.[^.]+$/, '').trim(); }
