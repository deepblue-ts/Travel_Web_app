/**
 * server/utils.js
 * ------------------------------------------------------------
 * 役割:
 *  - ファイル入出力（JSONキャッシュ）と軽量ユーティリティ群
 *  - URLの妥当性チェック（HEAD→GET で 2xx を確認）
 *  - Google マップ用の補助URL生成
 *  - 正規化・キャッシュキー関連の小道具
 */

import fs from 'fs/promises';
import path from 'path';

// ---------- ファイルユーティリティ ----------
export async function ensureFile(p, init = '{}\n') {
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    try { await fs.access(p); } catch { await fs.writeFile(p, init, 'utf8'); }
  } catch (e) {
    console.warn('ensureFile failed:', p, e.message);
  }
}
export async function readJsonFile(p) {
  try {
    await ensureFile(p);
    const raw = await fs.readFile(p, 'utf8').catch(async (e) => {
      if (e.code === 'ENOENT') { await fs.writeFile(p, '{}\n'); return '{}\n'; }
      throw e;
    });
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    console.warn('readJsonFile failed, fallback to {}:', p, e.message);
    return {};
  }
}
export async function writeJsonFile(p, obj) {
  try {
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn('writeJsonFile failed (ignored):', p, e.message);
  }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 文字列・キャッシュキー ----------
export function normalizeCandidates(dest) {
  if (!dest) return [];
  const raw = String(dest).trim();
  const noSpace = raw.replace(/\s+/g, '');
  const lower = noSpace.toLowerCase();
  const strip1 = noSpace.replace(/[都道府県市区町村郡]$/u, '');
  const strip1lower = strip1.toLowerCase();
  return Array.from(new Set([raw, noSpace, lower, strip1, strip1lower]));
}
export function findCacheKey(cacheObj, dest) {
  const cands = normalizeCandidates(dest);
  for (const key of Object.keys(cacheObj || {})) {
    const kc = normalizeCandidates(key);
    if (kc.some((k) => cands.includes(k))) return key;
  }
  return null;
}
export function canonicalizeDestination(input) {
  if (!input) return '';
  let s = String(input).normalize('NFKC').trim().toLowerCase();
  s = s.replace(/\s+/g, '');
  s = s.replace(/[都道府県市区町村郡]$/u, '');
  const romaji2ja = {
    tokyo: '東京', kyoto: '京都', osaka: '大阪',
    hokkaido: '北海道', okinawa: '沖縄', fukuoka: '福岡',
    nagoya: '名古屋', sapporo: '札幌', nara: '奈良',
    kobe: '神戸', yokohama: '横浜', chiba: '千葉',
    saitama: '埼玉', hiroshima: '広島', sendai: '仙台',
  };
  if (romaji2ja[s]) s = romaji2ja[s];
  return s;
}
export function extractJsonFromString(text = '') {
  const s = text.indexOf('{');
  if (s === -1) return null;
  const e = text.lastIndexOf('}');
  if (e === -1 || e < s) return null;
  return text.substring(s, e + 1);
}

// ---------- URLユーティリティ ----------
export function isHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}
export function buildMapsPlaceUrl(placeId) {
  return placeId
    ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
    : '';
}
export function buildMapsSearchUrl(name, area, dest) {
  const q = [name, area, dest, '日本'].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

// HEAD→GET で 2xx を確認（タイムアウト付き）
export async function checkUrl2xx(url, { timeoutMs = 4500 } = {}) {
  if (!isHttpUrl(url)) return false;

  const attempt = async (method) => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const resp = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        // 一部サイトは HEAD を雑に拒否するので User-Agent は素直に
        headers: { 'User-Agent': 'travel-planner/1.0 (+https://example.net)' },
      });
      clearTimeout(t);
      return resp.status >= 200 && resp.status < 300;
    } catch {
      return false;
    }
  };

  // まず HEAD、ダメなら GET
  if (await attempt('HEAD')) return true;
  return attempt('GET');
}

// 候補を上から順に 2xx を満たす最初のURLを返す
export async function validateAndPickUrl(candidates, { timeoutMs = 4500 } = {}) {
  for (const c of candidates) {
    if (!c || !isHttpUrl(c)) continue;
    if (await checkUrl2xx(c, { timeoutMs })) return c;
  }
  return ''; // すべてNG
}
