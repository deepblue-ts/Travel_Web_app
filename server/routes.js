/**
 * server/routes.js — すべての公開APIルート定義
 * ------------------------------------------------------------
 * 役割:
 *  - 既存の API パスを変更せずに Express へルーティングを一括登録
 *  - 実処理は services 層に委譲（LLM呼び出し / ジオコーディング / 運賃見積もり など）
 *  - ExcelLogger を使ったログ連携系エンドポイントもここに集約
 *
 * 外部からは registerRoutes(app, config) を呼び出すだけでOK。
 * config には openai / 各種キー・キャッシュパスを渡す（server.js 参照）。
 */

import fs from 'fs/promises';
import path from 'path';
import {
  // 汎用ユーティリティ & LLM/Geocode/URL 補完ロジック
  createLLMHandler,
  getAreasWithCache,
  geocodeViaGoogle,
  geocodeViaNominatim,
  geocodeBatchInternal,
  mergeGeocodesIntoItinerary,
  persistItineraryAndExport,
  estimateFare,
  buildGeocodeQuery,
} from './services.js';

import {
  areaSystemPrompt,
  diningSystemPrompt,
  accommodationSystemPrompt,
  activitySystemPrompt,
  createMasterPlanSystemPrompt,
  createDayPlanSystemPrompt,
  revisePlanSystemPrompt,
} from './prompts.js';

import { ExcelLogger } from './excelLogger.js';

export async function registerRoutes(app, cfg) {
  const {
    openai,
    CACHE_DIR,
    AREA_CACHE_FILE,
    GEOCODE_CACHE_FILE,
    GOOGLE_MAPS_API_KEY,
    GOOGLE_MAPS_REGION,
    GOOGLE_MAPS_LANG,
  } = cfg;

  // ========= /api/get-areas =========
  async function handleGetAreas(destination, res) {
    const { payload, cache, cacheControl } = await getAreasWithCache({
      destination,
      openai,
      AREA_CACHE_FILE,
    });

    if (cache) res.set('X-Cache', cache);
    if (cacheControl) res.set('Cache-Control', cacheControl);
    res.json(payload);
  }

  app.post('/api/get-areas', async (req, res) => {
    try {
      await handleGetAreas(req.body?.destination, res);
    } catch (e) {
      const status = e?.status || e?.response?.status || 500;
      res.status(status).json({ error: e?.message || 'Unknown server error' });
    }
  });
  app.get('/api/get-areas', async (req, res) => {
    try {
      await handleGetAreas(req.query?.destination, res);
    } catch (e) {
      const status = e?.status || e?.response?.status || 500;
      res.status(status).json({ error: e?.message || 'Unknown server error' });
    }
  });

  // ========= LLM 単発系 =========
  app.post('/api/find-dining',        createLLMHandler(openai, diningSystemPrompt,        'dining',  'gpt-4o-mini'));
  app.post('/api/find-accommodation', createLLMHandler(openai, accommodationSystemPrompt, 'hotel',   'gpt-4o-mini'));
  app.post('/api/find-activities',    createLLMHandler(openai, activitySystemPrompt,      'activity','gpt-4o-mini'));
  app.post('/api/create-master-plan', createLLMHandler(openai, createMasterPlanSystemPrompt, 'master', 'gpt-4o'));

  // ========= /api/create-day-plans =========
  app.post('/api/create-day-plans', async (req, res) => {
    const { planId, constraints } = req.body || {};
    const days = Array.isArray(req.body?.batchInput) ? req.body.batchInput : req.body?.days;
    if (!Array.isArray(days)) return res.status(400).json({ error: 'days/batchInput は配列である必要があります' });

    const pickDestination = (arr) => {
      for (const d of arr || []) {
        const dest = d?.planConditions?.destination || d?.destination;
        if (dest) return String(dest);
      }
      return '';
    };
    const destination = pickDestination(days);

    const callLLMJson = createLLMHandler(openai, createDayPlanSystemPrompt, 'day-planner', 'gpt-4o', { raw: true });

    const createOne = async (dayData) => {
      const body = { ...dayData, constraints: dayData.constraints || constraints || {} };
      const json = await callLLMJson.__call({ body, planId });
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

      // 3) geocode（URL 補完込み）
      const items = [];
      for (const d of itinerary) {
        for (const s of (d.schedule || [])) {
          items.push({ name: s.activity_name || s.name, area: d.area, day: d.day, time: s.time });
        }
      }
      if (items.length > 0) {
        try {
          const geos = await geocodeBatchInternal({
            destination,
            items,
            planId,
            GEOCODE_CACHE_FILE,
            GOOGLE_MAPS_API_KEY,
            GOOGLE_MAPS_LANG,
            GOOGLE_MAPS_REGION,
          });
          mergeGeocodesIntoItinerary(destination, itinerary, geos);
        } catch (e) {
          console.warn('geocodeBatchInternal failed (ignored in create-day-plans):', e.message);
        }
      }

      // 4) 保存＆Excel再出力（失敗は握りつぶす）
      let saved = null;
      try {
        saved = await persistItineraryAndExport(planId, itinerary, {});
      } catch (e) {
        console.warn('persist/export failed (ignored):', e.message);
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
      console.error('create-day-plans error:', error);
      res.status(500).json({ error: `複数日プラン作成中にエラー: ${error?.message}` });
    }
  });

  // ========= /api/estimate-fare =========
  app.post('/api/estimate-fare', async (req, res) => {
    try {
      const { origin, destination, transport = 'public' } = req.body || {};
      if (!origin || !destination) {
        return res.status(400).json({ error: 'origin/destination required' });
      }
      const out = await estimateFare({
        origin, destination, transport, GOOGLE_MAPS_API_KEY,
      });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message || 'estimate-fare failed' });
    }
  });

  // ========= /api/revise-plan =========
  app.post('/api/revise-plan', async (req, res) => {
    try {
      const { planId, planConditions, itinerary, instructions } = req.body || {};
      if (!Array.isArray(itinerary) || itinerary.length === 0) {
        return res.status(400).json({ error: 'invalid itinerary' });
      }

      const llm = createLLMHandler(openai, revisePlanSystemPrompt, 'revise', 'gpt-4o-mini', { raw: true });
      const json = await llm.__call({
        body: { planId, planConditions, itinerary, instructions },
        planId,
      });

      const revised = json?.revised_itinerary || [];
      if (!Array.isArray(revised) || revised.length === 0) {
        return res.status(500).json({ error: 'empty revised_itinerary', raw: json });
      }

      // 必要なら geocode してもOK（今回は戻り値はそのまま）
      const items = [];
      for (const d of revised) for (const s of d?.schedule || []) items.push({ name: s.activity_name, area: d.area });
      await geocodeBatchInternal({
        destination: planConditions?.destination || '',
        items,
        planId,
        GEOCODE_CACHE_FILE,
        GOOGLE_MAPS_API_KEY,
        GOOGLE_MAPS_LANG,
        GOOGLE_MAPS_REGION,
      });

      res.json({ revised_itinerary: revised });
    } catch (e) {
      console.error('revise-plan error', e);
      res.status(500).json({ error: e?.message || 'revise-plan failed' });
    }
  });

  // ========= ジオコーディング系 =========
  app.post('/api/geocode-place', async (req, res) => {
    try {
      const { query } = req.body || {};
      if (!query) return res.status(400).json({ error: 'query required' });

      let hit = await geocodeViaGoogle(query, {
        GOOGLE_MAPS_API_KEY, GOOGLE_MAPS_LANG, GOOGLE_MAPS_REGION,
      });
      if (!hit) hit = await geocodeViaNominatim(query);

      res.json({
        query,
        lat: hit?.lat ?? '',
        lon: hit?.lon ?? '',
        display_name: hit?.display_name ?? '',
        source: hit?.source ?? 'none',
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'geocode-place failed' });
    }
  });

  app.post('/api/geocode-itinerary', async (req, res) => {
    try {
      const { destination = '', itinerary = [], planId } = req.body || {};
      const items = [];
      for (const d of itinerary) {
        for (const s of d?.schedule || []) {
          items.push({ name: s.activity_name || s.name, area: d.area });
        }
      }
      const results = await geocodeBatchInternal({
        destination,
        items,
        planId,
        GEOCODE_CACHE_FILE,
        GOOGLE_MAPS_API_KEY,
        GOOGLE_MAPS_LANG,
        GOOGLE_MAPS_REGION,
      });
      res.json({ results });
    } catch (e) {
      res.status(500).json({ error: e.message || 'geocode-itinerary failed' });
    }
  });

  app.post('/api/geocode-batch', async (req, res) => {
    try {
      const { destination, items, planId } = req.body || {};
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'items は配列である必要があります' });
      }

      const results = await geocodeBatchInternal({
        destination: destination || '',
        items,
        planId,
        GEOCODE_CACHE_FILE,
        GOOGLE_MAPS_API_KEY,
        GOOGLE_MAPS_LANG,
        GOOGLE_MAPS_REGION,
      });

      res.set('X-Geocoder', GOOGLE_MAPS_API_KEY ? 'google+cache(+nominatim-fallback)' : 'cache+nominatim');
      return res.json({ results, cacheDir: CACHE_DIR });
    } catch (e) {
      console.error('geocode-batch error:', e);
      return res.status(500).json({ error: e.message || 'geocode-batch failed', cacheDir: CACHE_DIR });
    }
  });

  // ========= Excel ログ連携 =========
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
          try { await logger.log('user_input', { field, value }); } catch {}
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
        try { await logger.log('user_input', { field: it.field, value: it.value }); } catch {}
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
      try { await logger.log(type, { agent, summary, payload }); } catch {}
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
        try { await logger.log('geocode', r); } catch {}
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
      try { await logger.writeJson('finalPlan', finalPlan); } catch {}
      let filePath = null;
      try { filePath = await logger.exportXlsx(finalPlan); } catch {}
      try { await ExcelLogger.updateStatus(planId, 'Done'); } catch {}
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
}
