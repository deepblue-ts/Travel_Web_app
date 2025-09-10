// server.js (ESM) — Google Maps API を使った高速ジオコーディング対応版
// プロンプトは server/prompts.js に分離

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ExcelLogger } from './server/excelLogger.js';
import {
  areaSystemPrompt,
  diningSystemPrompt,
  accommodationSystemPrompt,
  activitySystemPrompt,
  createMasterPlanSystemPrompt,
  createDayPlanSystemPrompt,
} from './server/prompts.js';

// ─────────────────────────────────────────────
// 0) パス解決
// ─────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

// ★ Render 対策：本番は /tmp を使う。環境変数 CACHE_DIR があれば最優先。
const CACHE_DIR =
  process.env.CACHE_DIR ||
  (process.env.NODE_ENV === 'production'
    ? '/tmp/travel-cache'
    : path.join(__dirname, 'cache'));

const AREA_CACHE_FILE = path.join(CACHE_DIR, 'area-cache.json');
const GEOCODE_CACHE_FILE = path.join(CACHE_DIR, 'geocode-cache.json');

// Google Maps
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const GOOGLE_MAPS_REGION = process.env.GOOGLE_MAPS_REGION || 'jp';
const GOOGLE_MAPS_LANG   = process.env.GOOGLE_MAPS_LANG   || 'ja';

// ─────────────────────────────────────────────
// 1) サーバー初期化
// ─────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));

// CORS: dev/Pages/追加オリジン（環境変数 ALLOWED_ORIGINS で上書き可）
const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://deepblue-ts.github.io', // GitHub Pages（org用）
  'https://deepblue-ts.github.io/Travel_Web_app', // 末尾スラなしでOK
];
const allowList = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const origins = [...new Set([...defaultOrigins, ...allowList])];

app.use(cors({ origin: origins }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ─────────────────────────────────────────────
// 2) 共通ユーティリティ
// ─────────────────────────────────────────────
async function ensureFile(p, init = '{}\n') {
  await fs.mkdir(path.dirname(p), { recursive: true });
  try { await fs.access(p); } catch { await fs.writeFile(p, init, 'utf8'); }
}
async function readJsonFile(p) {
  await ensureFile(p);
  const raw = await fs.readFile(p, 'utf8');
  return raw.trim() ? JSON.parse(raw) : {};
}
async function writeJsonFile(p, obj) {
  await fs.writeFile(p, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function normalizeCandidates(dest) {
  if (!dest) return [];
  const raw = String(dest).trim();
  const noSpace = raw.replace(/\s+/g, '');
  const lower = noSpace.toLowerCase();
  const strip1 = noSpace.replace(/[都道府県市区町村郡]$/u, '');
  const strip1lower = strip1.toLowerCase();
  return Array.from(new Set([raw, noSpace, lower, strip1, strip1lower]));
}
function findCacheKey(cacheObj, dest) {
  const cands = normalizeCandidates(dest);
  for (const key of Object.keys(cacheObj || {})) {
    const kc = normalizeCandidates(key);
    if (kc.some((k) => cands.includes(k))) return key;
  }
  return null;
}
function extractJsonFromString(text = '') {
  const s = text.indexOf('{');
  if (s === -1) return null;
  const e = text.lastIndexOf('}');
  if (e === -1 || e < s) return null;
  return text.substring(s, e + 1);
}
function isValidAreas(areas) {
  return (
    Array.isArray(areas) &&
    areas.every(
      (a) =>
        a &&
        typeof a.name === 'string' &&
        Array.isArray(a.spots) &&
        a.spots.every((s) => typeof s === 'string')
    )
  );
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────────────────────
// 旅程の保存＆Excel再出力（lat/lon 反映版）
// ─────────────────────────────────────────────
async function persistItineraryAndExport(planId, itinerary, extra = {}) {
  if (!planId || !Array.isArray(itinerary)) return null;
  const logger = new ExcelLogger(planId);
  const finalPlan = { itinerary, ...extra };
  const xlsxPath = await logger.exportXlsx(finalPlan);
  return { finalPlan, xlsxPath };
}

// ─────────────────────────────────────────────
// 内部ジオコーディング（Google Maps 優先 → OSM/Nominatim Fallback）
// ─────────────────────────────────────────────
function buildGeocodeQuery(it, destination) {
  return [
    it?.name || it?.activity_name || '',
    it?.area || it?.areaName || '',
    destination || '',
    '日本',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

// L1メモリキャッシュ
const L1_GEOCODE = new Map(); // key(query) => { lat, lon, display_name, source, expiresAt }
const GEOCODE_TTL_MS = 1000 * 60 * 60 * 24 * 180; // 180日

async function geocodeViaGoogle(query) {
  if (!GOOGLE_MAPS_API_KEY) return null;

  // 1) Places Text Search（自由文検索に強い）
  const placesUrl =
    `https://maps.googleapis.com/maps/api/place/textsearch/json` +
    `?query=${encodeURIComponent(query)}` +
    `&language=${encodeURIComponent(GOOGLE_MAPS_LANG)}` +
    `&region=${encodeURIComponent(GOOGLE_MAPS_REGION)}` +
    `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
  try {
    const r = await fetch(placesUrl);
    const j = await r.json();
    if (j?.status === 'OK' && Array.isArray(j.results) && j.results.length > 0) {
      const top = j.results[0];
      const lat = top?.geometry?.location?.lat;
      const lon = top?.geometry?.location?.lng;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {
          lat, lon,
          display_name: top?.formatted_address || top?.name || query,
          source: 'gmaps_places',
        };
      }
    }
  } catch (_) {}

  // 2) Geocoding API（住所解決に強い）
  const geocodeUrl =
    `https://maps.googleapis.com/maps/api/geocode/json` +
    `?address=${encodeURIComponent(query)}` +
    `&language=${encodeURIComponent(GOOGLE_MAPS_LANG)}` +
    `&region=${encodeURIComponent(GOOGLE_MAPS_REGION)}` +
    `&key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}`;
  try {
    const r = await fetch(geocodeUrl);
    const j = await r.json();
    if (j?.status === 'OK' && Array.isArray(j.results) && j.results.length > 0) {
      const top = j.results[0];
      const lat = top?.geometry?.location?.lat;
      const lon = top?.geometry?.location?.lng;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return {
          lat, lon,
          display_name: top?.formatted_address || query,
          source: 'gmaps_geocode',
        };
      }
    }
  } catch (_) {}

  return null;
}

async function geocodeViaNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=1&accept-language=ja&q=${encodeURIComponent(query)}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'webapp-travel/1.0 (contact: you@example.com)' },
  });
  let arr = [];
  try { arr = await resp.json(); } catch {}
  if (Array.isArray(arr) && arr.length > 0) {
    const top = arr[0];
    return {
      lat: Number(top.lat),
      lon: Number(top.lon),
      display_name: top.display_name,
      source: 'nominatim',
    };
  }
  return null;
}

async function geocodeBatchInternal(destination, items, planId) {
  // まず CACHE_DIR を必ず作る（Render 本番で /tmp に作成）
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const diskCache = await readJsonFile(GEOCODE_CACHE_FILE);
  const results = [];
  const now = Date.now();

  for (const it of items || []) {
    const query = buildGeocodeQuery(it, destination);
    if (!query) continue;

    // 1) L1
    const l1 = L1_GEOCODE.get(query);
    if (l1 && l1.expiresAt > now) {
      results.push({ query, lat: l1.lat, lon: l1.lon, display_name: l1.display_name, source: 'cache:l1' });
      continue;
    }

    // 2) Disk
    if (diskCache[query]) {
      const entry = diskCache[query];
      results.push({ query, ...entry, source: entry?.source?.startsWith('gmaps') ? entry.source : 'cache:disk' });
      // L1へ格納
      L1_GEOCODE.set(query, { ...entry, expiresAt: now + GEOCODE_TTL_MS });
      continue;
    }

    // 3) Google Maps（優先）
    let hit = await geocodeViaGoogle(query);

    // 4) Fallback: Nominatim
    if (!hit) {
      hit = await geocodeViaNominatim(query);
      // Nominatim はレート制限が厳しいため、次のループ前に待機
      await sleep(1100);
    }

    if (hit) {
      // ディスクへ保存
      diskCache[query] = { lat: hit.lat, lon: hit.lon, display_name: hit.display_name, source: hit.source };
      await writeJsonFile(GEOCODE_CACHE_FILE, diskCache);
      // L1へ保存
      L1_GEOCODE.set(query, { ...diskCache[query], expiresAt: now + GEOCODE_TTL_MS });
      results.push({ query, ...diskCache[query], source: hit.source });
    } else {
      results.push({ query, lat: null, lon: null, error: 'not_found' });
    }
  }

  // Excelログ（任意）
  if (planId) {
    try {
      const logger = new ExcelLogger(planId);
      for (const r of results) await logger.log('geocode', r);
    } catch {}
  }

  return results;
}

function mergeGeocodesIntoItinerary(destination, itinerary, geocodeResults) {
  const map = new Map((geocodeResults || []).map(r => [r.query, { lat: r.lat, lon: r.lon }]));
  for (const day of itinerary || []) {
    for (const s of (day.schedule || [])) {
      const q = buildGeocodeQuery({ name: s.activity_name || s.name, area: day.area }, destination);
      const hit = map.get(q);
      if (hit && hit.lat != null && hit.lon != null) {
        if (s.lat == null) s.lat = hit.lat;
        if (s.lon == null) s.lon = hit.lon;
      }
    }
  }
  return itinerary;
}

// ─────────────────────────────────────────────
// 3) LLM 呼び出しヘルパ
// ─────────────────────────────────────────────
async function callLLMJson({ systemPrompt, userBody, model = 'gpt-4o-mini', planId, agent }) {
  const filtered = { ...(userBody || {}) };
  delete filtered.planId;

  const userPrompt = `提供された情報: ${JSON.stringify(filtered)}`;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  if (planId) {
    const logger = new ExcelLogger(planId);
    await logger.log('llm_input', {
      agent: agent || 'unknown',
      model,
      system_prompt: systemPrompt,
      user_prompt: userPrompt,
      variables_json: filtered,
    });
  }

  const chat = await openai.chat.completions.create({
    messages,
    model,
    response_format: { type: 'json_object' },
  });

  const raw = chat?.choices?.[0]?.message?.content ?? '';
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    const extracted = extractJsonFromString(raw);
    if (!extracted) throw new Error('AI応答がJSONで返りませんでした');
    json = JSON.parse(extracted);
  }

  if (planId) {
    const logger = new ExcelLogger(planId);
    await logger.log('llm_output', {
      agent: agent || 'unknown',
      model,
      raw_text: raw,
      parsed_json: json,
      usage: chat?.usage ?? null,
      finish_reason: chat?.choices?.[0]?.finish_reason ?? null,
    });
  }

  return json;
}

async function callLLMForAreas(body) {
  const out = await callLLMJson({
    systemPrompt: areaSystemPrompt,
    userBody: body,
    model: 'gpt-4o-mini',
    planId: body?.planId,
    agent: 'areas',
  });
  const areas = out?.areas;
  if (!isValidAreas(areas)) throw new Error('AI応答の形式が不正（areas 配列が不正）');
  return areas;
}

const createApiHandlerWithModel = (systemPrompt, agent, model) => async (req, res) => {
  try {
    const json = await callLLMJson({
      systemPrompt,
      userBody: req.body,
      model: model || 'gpt-4o-mini',
      planId: req.body?.planId,
      agent,
    });
    res.json(json);
  } catch (error) {
    const status = error?.status || error?.response?.status || 500;
    const detail = error?.response?.data || null;
    console.error(`${agent || 'api'} Error:`, error?.message, detail);
    res.status(status).json({ error: error?.message || 'Unknown server error', detail });
  }
};

// ─────────────────────────────────────────────
// 5) ルーティング
// ─────────────────────────────────────────────

// ==== /api/get-areas（POST互換） + GET新設 ====

// L1メモリキャッシュ（エリア）
const L1_AREAS = new Map(); // key => { areas, updatedAt, cache_key, expiresAt }
const AREA_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30日

function canonicalizeDestination(input) {
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

async function handleGetAreas(destination, res) {
  if (!destination || typeof destination !== 'string') {
    res.status(400).json({ error: 'destination は必須です（string）' });
    return;
  }

  const ckey = canonicalizeDestination(destination);
  const now = Date.now();

  // 1) L1
  const l1 = L1_AREAS.get(ckey);
  if (l1 && l1.expiresAt > now) {
    res.set('X-Cache', 'HIT-L1');
    res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.json({ areas: l1.areas, source: 'cache', cache_key: l1.cache_key, updatedAt: l1.updatedAt || null });
    return;
  }

  // 2) Disk
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const cacheObj = await readJsonFile(AREA_CACHE_FILE);
  const hitKeyByFn = findCacheKey(cacheObj, destination);
  const hitKeyByCanon = Object.keys(cacheObj).find(k => canonicalizeDestination(k) === ckey);
  const hitKey = hitKeyByFn || hitKeyByCanon;

  if (hitKey && cacheObj[hitKey]?.areas) {
    const payload = cacheObj[hitKey];
    L1_AREAS.set(ckey, {
      areas: payload.areas,
      updatedAt: payload.updatedAt || null,
      cache_key: hitKey,
      expiresAt: now + AREA_TTL_MS,
    });
    res.set('X-Cache', 'HIT-DISK');
    res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.json({ areas: payload.areas, source: 'cache', cache_key: hitKey, updatedAt: payload.updatedAt || null });
    return;
  }

  // 3) MISS → LLM
  const areas = await callLLMForAreas({ destination });

  const saveKeyOriginal = String(destination).trim();
  const saveKeyCanonical = ckey;
  const entry = { areas, updatedAt: new Date().toISOString() };
  const updated = {
    ...(cacheObj || {}),
    [saveKeyOriginal]: entry,
    [saveKeyCanonical]: entry,
  };
  await writeJsonFile(AREA_CACHE_FILE, updated);

  L1_AREAS.set(ckey, {
    areas,
    updatedAt: entry.updatedAt,
    cache_key: saveKeyOriginal,
    expiresAt: now + AREA_TTL_MS,
  });

  res.set('X-Cache', 'MISS');
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ areas, source: 'ai', cache_key: saveKeyOriginal, updatedAt: entry.updatedAt });
}

// POST版（既存互換）
app.post('/api/get-areas', async (req, res) => {
  try {
    await handleGetAreas(req.body?.destination, res);
  } catch (e) {
    const status = e?.status || e?.response?.status || 500;
    res.status(status).json({ error: e?.message || 'Unknown server error' });
  }
});

// GET版（プリフライト回避 & ブラウザキャッシュ活用）
app.get('/api/get-areas', async (req, res) => {
  try {
    await handleGetAreas(req.query?.destination, res);
  } catch (e) {
    const status = e?.status || e?.response?.status || 500;
    res.status(status).json({ error: e?.message || 'Unknown server error' });
  }
});

// 5-2) LLM系（ログ自動）
app.post('/api/find-dining',        createApiHandlerWithModel(diningSystemPrompt,        'dining',  'gpt-4o-mini'));
app.post('/api/find-accommodation', createApiHandlerWithModel(accommodationSystemPrompt, 'hotel',   'gpt-4o-mini'));
app.post('/api/find-activities',    createApiHandlerWithModel(activitySystemPrompt,      'activity','gpt-4o-mini'));

// 合成は 4o（ここが質の肝）
app.post('/api/create-master-plan', createApiHandlerWithModel(createMasterPlanSystemPrompt, 'master', 'gpt-4o'));

// 5-3) デイリープラン（バッチ）: 合成→geocode→保存→Excel再出力
app.post('/api/create-day-plans', async (req, res) => {
  const { days, planId, constraints } = req.body || {};
  if (!Array.isArray(days)) return res.status(400).json({ error: 'daysは配列である必要があります' });

  const pickDestination = (arr) => {
    for (const d of arr || []) {
      const dest = d?.planConditions?.destination || d?.destination;
      if (dest) return String(dest);
    }
    return '';
  };
  const destination = pickDestination(days);

  const createOne = async (dayData) => {
    const body = { ...dayData, constraints: dayData.constraints || constraints || {} };
    const json = await callLLMJson({
      systemPrompt: createDayPlanSystemPrompt,
      userBody: body,
      model: 'gpt-4o',
      planId,
      agent: 'day-planner',
    });
    return json;
  };

  try {
    // 1) 並列生成
    const settled = await Promise.allSettled(days.map((d) => createOne(d)));
    const results = settled.map((r, i) =>
      r.status === 'fulfilled'
        ? { ok: true, plan: r.value }
        : { ok: false, day: days[i]?.day, error: r.reason?.message }
    );

    // 2) 暫定 itinerary
    const itinerary = results
      .filter(r => r.ok && r.plan && Array.isArray(r.plan.schedule))
      .map(r => r.plan);

    // 3) geocode
    const items = [];
    for (const d of itinerary) {
      for (const s of (d.schedule || [])) {
        items.push({ name: s.activity_name || s.name, area: d.area, day: d.day, time: s.time });
      }
    }
    if (items.length > 0) {
      const geos = await geocodeBatchInternal(destination, items, planId);
      mergeGeocodesIntoItinerary(destination, itinerary, geos);
    }

    // 4) 保存＆Excel再出力
    let saved = null;
    try {
      saved = await persistItineraryAndExport(planId, itinerary, {});
    } catch (e) {
      console.error('persist/export failed:', e);
    }

    res.json({
      results,
      itinerary,
      geocoded: items.length > 0,
      destination,
      saved: !!saved,
      xlsxPath: saved?.xlsxPath || null,
    });
  } catch (error) {
    res.status(500).json({ error: `複数日プラン作成中にエラー: ${error?.message}` });
  }
});

// 5-4) ジオコーディング（Google Maps 優先 + キャッシュ + Nominatim Fallback）
app.post('/api/geocode-batch', async (req, res) => {
  try {
    const { destination, items, planId } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items は配列である必要があります' });
    }
    const results = await geocodeBatchInternal(destination || '', items, planId);
    res.set('X-Geocoder', GOOGLE_MAPS_API_KEY ? 'google+cache(+nominatim-fallback)' : 'cache+nominatim');
    res.json({ results });
  } catch (e) {
    console.error('geocode-batch error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// 6) Excel ログ連携 API
// ─────────────────────────────────────────────
app.post('/api/plan/start', async (req, res) => {
  try {
    const meta = req.body || {};
    const { planId, planPath } = await ExcelLogger.start(meta);

    const logger = new ExcelLogger(planId);
    const kvs = [
      ['origin', meta.origin],
      ['destination', meta.destination],
      ['dates', meta.dates ? JSON.stringify(meta.dates) : ''],
      ['transport', meta.transport],
      ['budget', meta.budget ?? meta.budgetPerDay],
      ['preference', meta.preference ?? meta.preferences],
      ['areas', Array.isArray(meta.areas) ? JSON.stringify(meta.areas) : ''],
    ];
    for (const [field, value] of kvs) {
      if (value !== undefined && value !== null && String(value) !== '') {
        await logger.log('user_input', { field, value });
      }
    }

    res.json({ planId, planPath });
  } catch (e) {
    console.error('plan/start error', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/plan/log-user', async (req, res) => {
  try {
    const { planId, items } = req.body || {};
    const logger = new ExcelLogger(planId);
    for (const it of items || []) {
      await logger.log('user_input', { field: it.field, value: it.value });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/plan/log-llm', async (req, res) => {
  try {
    const { planId, agent, kind, summary, payload } = req.body || {};
    const logger = new ExcelLogger(planId);
    const type = kind === 'input' ? 'llm_input' : 'llm_output';
    await logger.log(type, { agent, summary, payload });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/plan/log-geocode', async (req, res) => {
  try {
    const { planId, results } = req.body || {};
    const logger = new ExcelLogger(planId);
    for (const r of results || []) {
      await logger.log('geocode', r);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/plan/finalize', async (req, res) => {
  try {
    const { planId, finalPlan } = req.body || {};
    const logger = new ExcelLogger(planId);
    await logger.writeJson('finalPlan', finalPlan);
    const filePath = await logger.exportXlsx(finalPlan);
    await ExcelLogger.updateStatus(planId, 'Done');
    res.json({ ok: true, filePath });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/plans', async (_req, res) => {
  try {
    const list = await ExcelLogger.list();
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/plans/download', async (req, res) => {
  try {
    const { planId } = req.query || {};
    if (!planId) return res.status(400).json({ error: 'planId is required' });
    const logger = new ExcelLogger(String(planId));
    const abs = logger.planXlsx;
    await fs.access(abs);
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(abs)}"`);
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.sendFile(abs);
  } catch (e) {
    res.status(404).json({ error: 'file not found' });
  }
});

app.get('/api/plan/state', async (req, res) => {
  try {
    const { planId } = req.query || {};
    if (!planId) return res.status(400).json({ error: 'planId is required' });
    const { meta, logs, finalPlan } = await ExcelLogger.readState(String(planId));
    res.json({ ok: true, meta, logs, finalPlan });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// 7) 起動
// ─────────────────────────────────────────────
app
  .listen(PORT, async () => {
    // Cache ディレクトリ作成（先回り）
    try { await fs.mkdir(CACHE_DIR, { recursive: true }); } catch {}

    console.log('\x1b[32m%s\x1b[0m', `Backend server listening at http://localhost:${PORT}`);
    console.log('OPENAI key exists?', !!process.env.OPENAI_API_KEY);
    console.log('GOOGLE_MAPS_API_KEY exists?', !!GOOGLE_MAPS_API_KEY);
    console.log('CACHE_DIR:', CACHE_DIR);
    console.log('CORS origins:', origins.join(', '));
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('\x1b[31m%s\x1b[0m', `FATAL ERROR: Port ${PORT} is already in use.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
