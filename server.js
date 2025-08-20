// server.js (ESM)

import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ExcelLogger } from './server/excelLogger.js';

// ─────────────────────────────────────────────
// 0) パス解決
// ─────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3001;

const AREA_CACHE_FILE = path.join(__dirname, 'cache', 'area-cache.json');
const GEOCODE_CACHE_FILE = path.join(__dirname, 'cache', 'geocode-cache.json');

// ─────────────────────────────────────────────
// 1) サーバー初期化
// ─────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));

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
  const strip1 = noSpace.replace(/[都道府県市区町村]$/u, '');
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
  await logger.writeJson('finalPlan', finalPlan);
  const xlsxPath = await logger.exportXlsx(finalPlan);
  return { finalPlan, xlsxPath };
}

// ─────────────────────────────────────────────
// 内部ジオコーディング（Nominatim, APIキー不要）
// ─────────────────────────────────────────────
function buildGeocodeQuery(it, destination) {
  return [
    it?.name || it?.activity_name || '',
    it?.area || it?.areaName || '',
    destination || '',
    '日本',
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

async function geocodeBatchInternal(destination, items, planId) {
  const cache = await readJsonFile(GEOCODE_CACHE_FILE);
  const results = [];

  for (const it of items || []) {
    const query = buildGeocodeQuery(it, destination);
    if (!query) continue;

    if (cache[query]) {
      results.push({ query, ...cache[query], source: 'cache' });
      continue;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=1&accept-language=ja&q=${encodeURIComponent(query)}`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'webapp-travel/1.0 (contact: you@example.com)' },
    });
    let arr = [];
    try { arr = await resp.json(); } catch {}
    if (Array.isArray(arr) && arr.length > 0) {
      const top = arr[0];
      const entry = { lat: Number(top.lat), lon: Number(top.lon), display_name: top.display_name };
      cache[query] = entry;
      results.push({ query, ...entry, source: 'nominatim' });
      await writeJsonFile(GEOCODE_CACHE_FILE, cache);
    } else {
      results.push({ query, lat: null, lon: null, error: 'not_found' });
    }
    await sleep(1100); // Nominatim のレート制限配慮
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
// 3) LLM 共通プロンプト
// ─────────────────────────────────────────────
const areaSystemPrompt = `
あなたは日本の地理と観光に非常に精通した、正確性を最重視する地理情報のエキスパートです。
# あなたのタスク
ユーザーから提示された目的地に基づき、観光客に人気のある代表的なエリアや地域を最大5つ提案してください。
# 厳守すべきルール
1.  **地理的関連性の徹底**: 提案するエリアは、必ずユーザーが提示した目的地 **の内部にある地域** に限定してください。
2.  **無関係なエリアの排除**: 絶対に、提示された目的地と地理的に全く関係のない都道府県や市のエリアを含めないでください。
# 出力形式
- 各エリアについて、その特徴を表す代表的な観光スポットを2〜3つ挙げてください。
- JSON以外の文字列は一切含めず、必ず以下のJSON形式で出力してください: 
{ "areas": [ { "name": "エリア名1", "spots": ["代表的な観光スポットA", "代表的な観光スポットB"] } ] }
`;

const diningSystemPrompt = `あなたは食事の専門家です。提示された旅行条件に基づき、おすすめのレストランを3つ提案してください。**各レストランについて、具体的な「概算料金（price）」と「公式サイトや参考URL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"restaurants": [{"name": "店名", "type": "ジャンル", "price": "1,000円〜2,000円", "url": "https://example.com"}]}`;

const accommodationSystemPrompt = `あなたは宿泊施設の専門家です。提示された旅行条件に基づき、おすすめのホテルや旅館を2つ提案してください。**各施設について、具体的な「一泊あたりの概算料金（price）」と「公式サイトや予約サイトのURL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"hotels": [{"name": "施設名", "type": "種別", "price": "15,000円〜", "url": "https://example.com"}]}`;

const activitySystemPrompt = `あなたは観光アクティビティの専門家です。提示された旅行条件に基づき、おすすめのアクティビティを3つ提案してください。**各アクティビティについて、具体的な「入場料や参加費（price）」と「公式サイトや参考URL（url）」を必ず含めてください。**出力は必ず以下のJSON形式にしてください: {"activities": [{"name": "アクティビティ名", "type": "種別", "price": "無料", "url": "https://example.com"}]}`;

// 4o用：骨格（Day→Area）を決める
const createMasterPlanSystemPrompt = `
あなたは旅行の戦略家です。提示された条件に基づき、旅行全体の骨格となる
「エリア分割計画（day→area, theme）」をJSON形式で出力してください。

# 入力
- planConditions: 出発地/目的地/日付範囲/交通手段/予算など
- areas: 候補エリアの配列（この中から選ぶ）
- constraints:
  - dayStart, dayEnd: "HH:MM"
  - maxStops, minMealStops, maxLegMinutes, maxTotalWalkKm（数値）
  - areaLocked: true（原則1日1エリア）
  - mealWindows: [["11:30","14:00"],["18:00","20:00"]]
  - budgetPerDay（円）

# 厳守
- 出力はJSONのみ: { "master_plan": [ { "day": 1, "area": "...", "theme": "..." } ] }
- areaは必ず\`areas\`内から選択。飛び地（連続性のない移動）は不可。
- 連泊が最も自然になるよう、前日との地理的連続性を重視する。
- 到着初日/最終日に長距離移動を挟まない（観光時間を確保）。
- テーマは具体的に（例:「下町グルメと寺社」「近代建築と夜景」）。

# 出力形式（例）
{ "master_plan": [ { "day": 1, "area": "新宿", "theme": "近代建築と夜景" } ] }
`;

// 4o用：1日の並びを作る
const createDayPlanSystemPrompt = `
あなたは旅程作成のプロです。確定済みの day/date/area/theme と候補リストから、
現実的な1日スケジュールをJSONで構築します。

# 入力
- day, date, area, theme（これらは変更禁止）
- planConditions（transport, budgetPerDay など）
- availableResources: activities/dining/hotels（各 {name,type,url,price,lat,lon}）
- constraints:
  - dayStart, dayEnd
  - budgetPerDay
  - maxStops, minMealStops
  - maxLegMinutes（1区間の最大移動分数）
  - maxTotalWalkKm（徒歩合計上限）
  - areaLocked（trueなら area外への移動禁止）
  - mealWindows（例: ["11:30","14:00"],["18:00","20:00"]）

# 厳守
- JSONのみで出力: 
  {
    "day": 1, "date": "YYYY-MM-DD", "area": "...", "theme": "...",
    "schedule": [
      { "time": "10:30", "activity_name": "...", "type": "activity|meal|hotel",
        "description": "...", "price": "1500円", "url": "...", "lat": 35.68, "lon": 139.76 }
    ],
    "total_cost": 4500
  }
- 候補に無い施設名を新規作成しない。url/lat/lonが不明な候補は選ばない。
- areaLocked=true の場合、当日の行程は area 内に限定。
- 区間移動は \`constraints.maxLegMinutes\` を超えない順序にする（無理なら候補数を減らす）。
- 食事は \`minMealStops\` 回以上、mealWindowsの時間帯に配置。
- 予算超過は不可。price は合計して数値の "total_cost" として出力。
- 充足できない制約がある場合は、行程を短くして返す（捏造や空のURLは禁止）。
`;

// ─────────────────────────────────────────────
// 4) LLM呼び出しヘルパ
// ─────────────────────────────────────────────
async function callLLMJson({ systemPrompt, userBody, model = 'gpt-4o-mini', planId, agent }) {
  // planId は LLM へ渡さない
  const filtered = { ...(userBody || {}) };
  delete filtered.planId;

  // 送信メッセージ（ユーザー側は human-readable に）
  const userPrompt = `提供された情報: ${JSON.stringify(filtered)}`;
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  // 入力ログ
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

  // 実呼び出し
  const chat = await openai.chat.completions.create({
    messages,
    model,
    response_format: { type: 'json_object' },
  });

  // 応答解析
  const raw = chat?.choices?.[0]?.message?.content ?? '';
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    const extracted = extractJsonFromString(raw);
    if (!extracted) throw new Error('AI応答がJSONで返りませんでした');
    json = JSON.parse(extracted);
  }

  // 出力ログ
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

// 5-1) エリア（キャッシュ対応）
app.post('/api/get-areas', async (req, res) => {
  try {
    const { destination } = req.body || {};
    if (!destination || typeof destination !== 'string') {
      return res.status(400).json({ error: 'destination は必須です（string）' });
    }

    const cacheObj = await readJsonFile(AREA_CACHE_FILE);
    const hitKey = findCacheKey(cacheObj, destination);

    if (hitKey && cacheObj[hitKey]?.areas) {
      return res.json({
        areas: cacheObj[hitKey].areas,
        source: 'cache',
        cache_key: hitKey,
        updatedAt: cacheObj[hitKey].updatedAt || null,
      });
    }

    const areas = await callLLMForAreas(req.body);
    const saveKey = String(destination).trim();
    const updated = { ...(cacheObj || {}), [saveKey]: { areas, updatedAt: new Date().toISOString() } };
    await writeJsonFile(AREA_CACHE_FILE, updated);

    res.json({
      areas,
      source: 'ai',
      cache_key: saveKey,
      updatedAt: updated[saveKey].updatedAt,
    });
  } catch (error) {
    const status = error?.status || error?.response?.status || 500;
    const detail = error?.response?.data || null;
    console.error('get-areas Error:', error?.message, detail);
    res.status(status).json({ error: error?.message || 'Unknown server error', detail });
  }
});

// 5-2) LLM系（ログ自動）
// 低コストの収集系は 4o-mini
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
      model: 'gpt-4o',          // ★ 合成は 4o
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

    // 2) 成功分で暫定 itinerary を構築
    const itinerary = results
      .filter(r => r.ok && r.plan && Array.isArray(r.plan.schedule))
      .map(r => r.plan);

    // 3) geocode して lat/lon を付与
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

// 5-5) ジオコーディング（キャッシュ + Nominatim）: 内部ヘルパー共通化
app.post('/api/geocode-batch', async (req, res) => {
  try {
    const { destination, items, planId } = req.body || {};
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items は配列である必要があります' });
    }
    const results = await geocodeBatchInternal(destination || '', items, planId);
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

    // start直後に初期条件をUserInputへ自動記録
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

// 任意：クライアント側から明示的に LLM ログを送りたい場合に使用
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
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
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
  .listen(PORT, () => {
    console.log('\x1b[32m%s\x1b[0m', `Backend server listening at http://localhost:${PORT}`);
    console.log('OPENAI key exists?', !!process.env.OPENAI_API_KEY);
  })
  .on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error('\x1b[31m%s\x1b[0m', `FATAL ERROR: Port ${PORT} is already in use.`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
