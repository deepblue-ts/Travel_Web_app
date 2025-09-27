/**
 * server/routes.js — すべての公開APIルート定義（完全版）
 * ------------------------------------------------------------
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

import { prisma } from './prisma/client.js';
import { ExcelLogger } from './excelLogger.js';

import {
  createLLMHandler,
  getAreasWithCache,
  geocodeViaGoogle,
  geocodeViaNominatim,
  geocodeBatchInternal,
  mergeGeocodesIntoItinerary,
  persistItineraryAndExport,
  estimateFare,
  normalizeDayPlanCosts,
  rebudgetDayPlanIfOverBudget,
  calcDayTotalJPY,
  finalizeTripBudgetIfNeeded,
} from './services/index.js';

import {
  areaSystemPrompt,
  diningSystemPrompt,
  accommodationSystemPrompt,
  activitySystemPrompt,
  createMasterPlanSystemPrompt,
  createDayPlanSystemPrompt,
  revisePlanSystemPrompt,
} from './prompts.js';

// 共有ユーティリティ（Neon保存API用）
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const makeId = (n) => crypto.randomBytes(n).toString('base64url');

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
  app.post(
    '/api/find-dining',
    createLLMHandler(openai, diningSystemPrompt, 'dining', 'gpt-4o-mini')
  );
  app.post(
    '/api/find-accommodation',
    createLLMHandler(openai, accommodationSystemPrompt, 'hotel', 'gpt-4o-mini')
  );
  app.post(
    '/api/find-activities',
    createLLMHandler(openai, activitySystemPrompt, 'activity', 'gpt-4o-mini')
  );
  app.post(
    '/api/create-master-plan',
    createLLMHandler(openai, createMasterPlanSystemPrompt, 'master', 'gpt-4o')
  );

  // ========= /api/create-day-plans =========
  // days/batchInput → 1日プラン生成 → 日別予算チェック → geocode → 旅行全体を 80〜100% に最終調整
  app.post('/api/create-day-plans', async (req, res) => {
    const {
      planId,
      constraints,
      finalizeBudget = true,
      targetMinRatio = 0.8,
      targetMaxRatio = 1.0,
      // 合計予算（フロントから飛んでくる場合がある）
      budget: requestTotalBudget,
    } = req.body || {};

    const daysReq = Array.isArray(req.body?.batchInput) ? req.body.batchInput : req.body?.days;
    if (!Array.isArray(daysReq)) {
      return res.status(400).json({ error: 'days/batchInput は配列である必要があります' });
    }

    const daysCount = daysReq.length || 1;

    const pickDestination = (arr) => {
      for (const d of arr || []) {
        const dest = d?.planConditions?.destination || d?.destination;
        if (dest) return String(dest);
      }
      return '';
    };

    // 代表の planConditions を構築（budgetPerDay が無い場合は合計予算から自動算出）
    const pickPlanConditions = (arr) => {
      const firstPC = (arr || []).find(d => d?.planConditions)?.planConditions || {};
      const requestLevel = constraints || {};

      const explicitPerDay =
        Number(firstPC?.budgetPerDay ?? requestLevel?.budgetPerDay);

      // 合計予算（リクエスト or day内 or constraints）を拾う
      const totalBudgetCandidate = [
        requestTotalBudget,
        firstPC?.budget,
        requestLevel?.budget,
      ].map((v) => Number(v)).find((n) => Number.isFinite(n) && n > 0);

      let budgetPerDay = Number.isFinite(explicitPerDay) && explicitPerDay > 0
        ? explicitPerDay
        : undefined;

      if (!budgetPerDay && Number.isFinite(totalBudgetCandidate)) {
        budgetPerDay = Math.floor(totalBudgetCandidate / daysCount);
      }

      return {
        ...firstPC,
        destination: firstPC?.destination || pickDestination(arr),
        // ここで必ず budgetPerDay を確定させる（最終仕上げが動く）
        ...(budgetPerDay ? { budgetPerDay } : {}),
      };
    };

    const destination = pickDestination(daysReq);
    const planConditions = pickPlanConditions(daysReq);

    // LLM 呼び出し（raw JSON を受ける）
    const llmDayPlanner = createLLMHandler(
      openai,
      createDayPlanSystemPrompt,
      'day-planner',
      'gpt-4o',
      { raw: true }
    );

    const createOne = async (dayData) => {
      // constraints は day ごと > リクエスト全体 の順で上書き
      const body = {
        ...dayData,
        constraints: { ...(constraints || {}), ...(dayData.constraints || {}) },
      };

      // 1) 下書き生成
      const draft = await llmDayPlanner.__call({ body, planId });

      // 2) 価格正規化＆合計算出
      let plan = normalizeDayPlanCosts(draft);

      // 3) 予算があればチェック→超過時は自動リバジェット（最大2回）
      const budgetPerDay =
        Number(body?.constraints?.budgetPerDay ??
               body?.planConditions?.budgetPerDay ??
               planConditions?.budgetPerDay);

      if (Number.isFinite(budgetPerDay) && budgetPerDay > 0) {
        const total = calcDayTotalJPY(plan);
        if (total > budgetPerDay) {
          plan = await rebudgetDayPlanIfOverBudget({
            openai,
            systemPrompt: createDayPlanSystemPrompt,
            userBody: body,
            draftPlan: plan,
            budgetPerDay,
            tries: 2,
          });
          plan = normalizeDayPlanCosts(plan);
        }
      }
      return plan;
    };

    try {
      // 1) 並列生成
      const settled = await Promise.allSettled(daysReq.map((d) => createOne(d)));
      const results = settled.map((r, i) =>
        r.status === 'fulfilled'
          ? { ok: true, plan: r.value }
          : { ok: false, day: daysReq[i]?.day, error: r.reason?.message }
      );

      // 2) 暫定 itinerary
      let itinerary = results
        .filter((r) => r.ok && r.plan && Array.isArray(r.plan.schedule))
        .map((r) => r.plan);

      // 3) geocode（URL 補完込み／初回）
      const collectItems = (its) => {
        const items = [];
        for (const d of its || []) {
          for (const s of d.schedule || []) {
            items.push({ name: s.activity_name || s.name, area: d.area, day: d.day, time: s.time });
          }
        }
        return items;
      };
      const items1 = collectItems(itinerary);
      if (items1.length > 0) {
        try {
          const geos = await geocodeBatchInternal({
            destination,
            items: items1,
            planId,
            GEOCODE_CACHE_FILE,
            GOOGLE_MAPS_API_KEY,
            GOOGLE_MAPS_LANG,
            GOOGLE_MAPS_REGION,
          });
          mergeGeocodesIntoItinerary(destination, itinerary, geos);
        } catch (e) {
          console.warn('geocodeBatchInternal failed (ignored in create-day-plans stage1):', e.message);
        }
      }

      // 4) 旅行全体の最終予算調整（80〜100%）
      let finalReport = null;
      if (finalizeBudget) {
        try {
          const { itinerary: fin, tripTotal } = await finalizeTripBudgetIfNeeded({
            openai,
            itinerary,
            planConditions, // ← ここで budgetPerDay を“必ず”入れてある
            targetMinRatio,
            targetMaxRatio,
          });
          itinerary = fin;

          // 4.1 最終調整後に geocode をもう一度（URL補完も）
          const items2 = collectItems(itinerary);
          if (items2.length > 0) {
            try {
              const geos2 = await geocodeBatchInternal({
                destination,
                items: items2,
                planId,
                GEOCODE_CACHE_FILE,
                GOOGLE_MAPS_API_KEY,
                GOOGLE_MAPS_LANG,
                GOOGLE_MAPS_REGION,
              });
              mergeGeocodesIntoItinerary(destination, itinerary, geos2);
            } catch (e) {
              console.warn('geocodeBatchInternal failed (ignored in create-day-plans stage2):', e.message);
            }
          }

          const perDay = Number(planConditions?.budgetPerDay);
          const totalBudget = Number.isFinite(perDay) ? perDay * itinerary.length : null;
          finalReport = {
            tripTotal,
            totalBudget,
            minTarget: Number.isFinite(totalBudget) ? Math.floor(totalBudget * targetMinRatio) : null,
            maxTarget: Number.isFinite(totalBudget) ? Math.floor(totalBudget * targetMaxRatio) : null,
          };
        } catch (e) {
          console.warn('finalizeTripBudgetIfNeeded failed (ignored):', e.message);
        }
      }

      // 5) 保存＆Excel再出力（失敗は握りつぶす）
      let saved = null;
      try {
        saved = await persistItineraryAndExport(planId, itinerary, {});
      } catch (e) {
        console.warn('persist/export failed (ignored):', e.message);
      }

      // 6) 予算サマリー
      const budgetSummaries = itinerary.map(d => {
        const total = calcDayTotalJPY(d);
        const budgetPerDay =
          Number(d?.budgetPerDay ??
                 d?.constraints?.budgetPerDay ??
                 planConditions?.budgetPerDay);
        return {
          day: d.day,
          date: d.date,
          total_cost_jpy: total,
          budgetPerDay: Number.isFinite(budgetPerDay) ? budgetPerDay : null,
          under_budget: Number.isFinite(budgetPerDay) ? total <= budgetPerDay : null,
        };
      });

      res.json({
        results,
        itinerary,
        geocoded: (items1.length > 0),
        destination,
        saved: !!saved,
        xlsxPath: saved?.xlsxPath || null,
        budgetSummaries,
        finalReport,
      });
    } catch (error) {
      console.error('create-day-plans error:', error);
      res.status(500).json({ error: `複数日プラン作成中にエラー: ${error?.message}` });
    }
  });

  // ========= 旅行全体の予算最終調整だけを別途呼びたい場合 =========
  app.post('/api/finalize-itinerary', async (req, res) => {
    try {
      const { planId, planConditions = {}, itinerary = [], targetMinRatio = 0.8, targetMaxRatio = 1.0 } = req.body || {};
      if (!Array.isArray(itinerary) || itinerary.length === 0) {
        return res.status(400).json({ error: 'itinerary は配列である必要があります' });
      }

      const destination =
        planConditions?.destination ||
        itinerary?.[0]?.destination ||
        '';

      // budgetPerDay が無ければ合計予算から補完
      const days = itinerary.length || 1;
      if (!Number.isFinite(planConditions?.budgetPerDay)) {
        const totalBudget = Number(req.body?.budget ?? planConditions?.budget);
        if (Number.isFinite(totalBudget) && totalBudget > 0) {
          planConditions.budgetPerDay = Math.floor(totalBudget / days);
        }
      }

      const norm = itinerary.map(normalizeDayPlanCosts);

      const { itinerary: fin, tripTotal } = await finalizeTripBudgetIfNeeded({
        openai,
        itinerary: norm,
        planConditions,
        targetMinRatio,
        targetMaxRatio,
      });

      // geocode & URL 補完
      const items = [];
      for (const d of fin || []) {
        for (const s of d.schedule || []) {
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
          mergeGeocodesIntoItinerary(destination, fin, geos);
        } catch (e) {
          console.warn('geocodeBatchInternal failed (ignored in finalize-itinerary):', e.message);
        }
      }

      // 保存（任意）
      if (planId) {
        try { await persistItineraryAndExport(planId, fin, {}); } catch {}
      }

      const perDay = Number(planConditions?.budgetPerDay);
      const totalBudget = Number.isFinite(perDay) ? perDay * fin.length : null;

      res.json({
        itinerary: fin,
        tripTotal,
        totalBudget,
        minTarget: Number.isFinite(totalBudget) ? Math.floor(totalBudget * targetMinRatio) : null,
        maxTarget: Number.isFinite(totalBudget) ? Math.floor(totalBudget * targetMaxRatio) : null,
      });
    } catch (e) {
      console.error('finalize-itinerary error:', e);
      res.status(500).json({ error: e?.message || 'finalize-itinerary failed' });
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
        origin,
        destination,
        transport,
        GOOGLE_MAPS_API_KEY,
      });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message || 'estimate-fare failed' });
    }
  });

  app.get('/api/estimate-fare', async (req, res) => {
    try {
      const { origin, destination, transport = 'public' } = req.query || {};
      if (!origin || !destination) {
        return res.status(400).json({ error: 'origin/destination required (query)' });
      }
      const out = await estimateFare({
        origin: String(origin),
        destination: String(destination),
        transport: String(transport || 'public'),
        GOOGLE_MAPS_API_KEY,
      });
      res.json(out);
    } catch (e) {
      res.status(500).json({ error: e.message || 'estimate-fare failed (GET)' });
    }
  });

  // ========= /api/revise-plan =========
  app.post('/api/revise-plan', async (req, res) => {
    try {
      const { planId, planConditions, itinerary, instructions } = req.body || {};
      if (!Array.isArray(itinerary) || itinerary.length === 0) {
        return res.status(400).json({ error: 'invalid itinerary' });
      }

      const llm = createLLMHandler(
        openai,
        revisePlanSystemPrompt,
        'revise',
        'gpt-4o-mini',
        { raw: true }
      );
      const json = await llm.__call({
        body: { planId, planConditions, itinerary, instructions },
        planId,
      });

      let revised = json?.revised_itinerary || [];
      if (!Array.isArray(revised) || revised.length === 0) {
        return res.status(500).json({ error: 'empty revised_itinerary', raw: json });
      }

      // 価格正規化＋予算検算（必要なら再調整）
      const budgetPerDay = Number(planConditions?.budgetPerDay);
      revised = await Promise.all(revised.map(async (d) => {
        let norm = normalizeDayPlanCosts(d);
        if (Number.isFinite(budgetPerDay) && budgetPerDay > 0) {
          const total = calcDayTotalJPY(norm);
          if (total > budgetPerDay) {
            norm = await rebudgetDayPlanIfOverBudget({
              openai,
              systemPrompt: revisePlanSystemPrompt,
              userBody: { planId, planConditions, itinerary, instructions },
              draftPlan: norm,
              budgetPerDay,
              tries: 2,
            });
            norm = normalizeDayPlanCosts(norm);
          }
        }
        return norm;
      }));

      // geocode（戻り値はそのまま）
      const items = [];
      for (const d of revised) {
        for (const s of d?.schedule || []) {
          items.push({ name: s.activity_name || s.name, area: d.area });
        }
      }
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
        GOOGLE_MAPS_API_KEY,
        GOOGLE_MAPS_LANG,
        GOOGLE_MAPS_REGION,
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

      res.set(
        'X-Geocoder',
        GOOGLE_MAPS_API_KEY
          ? 'google+cache(+nominatim-fallback)'
          : 'cache+nominatim'
      );
      return res.json({ results, cacheDir: CACHE_DIR });
    } catch (e) {
      console.error('geocode-batch error:', e);
      return res.status(500).json({
        error: e.message || 'geocode-batch failed',
        cacheDir: CACHE_DIR,
      });
    }
  });

  // ========= ★ Neon(Postgres) に“プラン本体”を保存するAPI =========
  app.post('/api/plan-saves', async (req, res) => {
    try {
      const { title, plan, meta } = req.body || {};
      if (!plan) return res.status(400).json({ error: 'plan is required' });

      const readId = makeId(6);
      const editToken = makeId(24);

      await prisma.plan.create({
        data: {
          readId,
          editTokenHash: sha256(editToken),
          title: title ?? '無題プラン',
          planJson: plan,
          meta: meta ?? {},
          isPublic: true,
        }
      });

      res.json({ readId, readUrl: `/p/${readId}`, editToken });
    } catch (e) {
      console.error('plan-saves POST error:', e);
      res.status(500).json({ error: e.message || 'save failed' });
    }
  });

  app.get('/api/plan-saves/:readId', async (req, res) => {
    try {
      const row = await prisma.plan.findUnique({ where: { readId: req.params.readId }});
      if (!row) return res.status(404).json({ error: 'not found' });

      res.json({
        title: row.title,
        plan: row.planJson,
        meta: row.meta,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      });
    } catch (e) {
      res.status(500).json({ error: e.message || 'load failed' });
    }
  });

  app.put('/api/plan-saves/:readId', async (req, res) => {
    try {
      const t = req.header('Edit-Token');
      if (!t) return res.status(401).json({ error: 'missing Edit-Token' });

      const row = await prisma.plan.findUnique({
        where: { readId: req.params.readId },
        select: { id: true, editTokenHash: true }
      });
      if (!row) return res.status(404).json({ error: 'not found' });
      if (sha256(t) !== row.editTokenHash) {
        return res.status(403).json({ error: 'invalid token' });
      }

      const { title, plan, meta } = req.body || {};
      await prisma.plan.update({
        where: { id: row.id },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(plan  !== undefined ? { planJson: plan } : {}),
          ...(meta  !== undefined ? { meta } : {})
        }
      });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message || 'update failed' });
    }
  });

  app.delete('/api/plan-saves/:readId', async (req, res) => {
    try {
      const t = req.header('Edit-Token');
      if (!t) return res.status(401).json({ error: 'missing Edit-Token' });

      const row = await prisma.plan.findUnique({
        where: { readId: req.params.readId },
        select: { id: true, editTokenHash: true }
      });
      if (!row) return res.status(404).json({ error: 'not found' });
      if (sha256(t) !== row.editTokenHash) {
        return res.status(403).json({ error: 'invalid token' });
      }

      await prisma.plan.delete({ where: { id: row.id } });
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message || 'delete failed' });
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
          try {
            await logger.log('user_input', { field, value });
          } catch {}
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
        try {
          await logger.log('user_input', { field: it.field, value: it.value });
        } catch {}
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
      try {
        await logger.log(type, { agent, summary, payload });
      } catch {}
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
        try {
          await logger.log('geocode', r);
        } catch {}
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
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${path.basename(abs)}"`
      );
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
}
