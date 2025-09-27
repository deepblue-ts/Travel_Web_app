/**
 * server/routes.js — すべての公開APIルート定義（完全版・詳細トレース対応）
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

import {
  traceMark,
  traceStep,
  traceError,
  traceTimed,
  traceSnapshot,
} from './services/trace.js';

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
  app.post('/api/create-day-plans', async (req, res) => {
    const {
      planId,
      constraints,
      finalizeBudget = true,
      targetMinRatio = 0.8,
      targetMaxRatio = 1.0
    } = req.body || {};
    const daysReq = Array.isArray(req.body?.batchInput) ? req.body.batchInput : req.body?.days;

    await traceMark(planId, 'create-day-plans', 'start', {
      bodyKeys: Object.keys(req.body || {})
    });

    if (!Array.isArray(daysReq)) {
      await traceError(planId, 'create-day-plans:validate', new Error('days/batchInput must be array'), { daysReq });
      return res.status(400).json({ error: 'days/batchInput は配列である必要があります' });
    }

    const pickDestination = (arr) => {
      for (const d of arr || []) {
        const dest = d?.planConditions?.destination || d?.destination;
        if (dest) return String(dest);
      }
      return '';
    };
    const pickPlanConditions = (arr) => {
      const first = (arr || []).find(d => d?.planConditions)?.planConditions || {};
      const inferredBudget = Number(first?.budgetPerDay ?? constraints?.budgetPerDay);
      return {
        ...first,
        destination: first?.destination || pickDestination(arr),
        budgetPerDay: Number.isFinite(inferredBudget) ? inferredBudget : undefined,
      };
    };

    const destination = pickDestination(daysReq);
    const planConditions = pickPlanConditions(daysReq);
    await traceSnapshot(planId, 'create-day-plans:context', 'planConditions', planConditions);

    const llmDayPlanner = createLLMHandler(
      openai,
      createDayPlanSystemPrompt,
      'day-planner',
      'gpt-4o',
      { raw: true }
    );

    const createOne = async (dayData) => {
      const body = { ...dayData, constraints: { ...(constraints || {}), ...(dayData.constraints || {}) } };

      // 1) LLM 下書き
      const draft = await traceTimed(
        planId,
        `create-day-plans:llm:call:day${dayData?.day ?? ''}`,
        () => llmDayPlanner.__call({ body, planId }),
        { before: body }
      );

      // 2) 価格正規化
      let plan = await traceTimed(
        planId,
        `create-day-plans:price-normalize:day${dayData?.day ?? ''}`,
        () => Promise.resolve(normalizeDayPlanCosts(draft)),
        { before: { draftSample: (draft?.schedule || []).slice(0, 3) } }
      );

      // 3) 日別予算超過ならリバジェット
      const budgetPerDay = Number(body?.constraints?.budgetPerDay ?? body?.planConditions?.budgetPerDay);
      if (Number.isFinite(budgetPerDay) && budgetPerDay > 0) {
        const total0 = calcDayTotalJPY(plan);
        await traceStep(planId, `create-day-plans:budget-check:day${dayData?.day ?? ''}`, {
          input: { budgetPerDay, total0 },
          output: null
        });

        if (total0 > budgetPerDay) {
          plan = await traceTimed(
            planId,
            `create-day-plans:rebudget:day${dayData?.day ?? ''}`,
            () => rebudgetDayPlanIfOverBudget({
              openai,
              systemPrompt: createDayPlanSystemPrompt,
              userBody: body,
              draftPlan: plan,
              budgetPerDay,
              tries: 2,
            }),
            { before: { totalBefore: total0, budgetPerDay } }
          );
          plan = normalizeDayPlanCosts(plan);
          const total1 = calcDayTotalJPY(plan);
          await traceStep(planId, `create-day-plans:rebudget:result:day${dayData?.day ?? ''}`, {
            input: null,
            output: { totalAfter: total1, budgetPerDay }
          });
        }
      }

      return plan;
    };

    try {
      // 1) 並列生成（各日）
      const settled = await traceTimed(
        planId,
        'create-day-plans:days:generate',
        () => Promise.allSettled(daysReq.map((d) => createOne(d))),
        { before: { daysCount: daysReq.length } }
      );

      const results = settled.map((r, i) =>
        r.status === 'fulfilled'
          ? { ok: true, plan: r.value }
          : { ok: false, day: daysReq[i]?.day, error: r.reason?.message }
      );

      await traceSnapshot(planId, 'create-day-plans:days:results', 'results', results.slice(0, 3));

      // 2) 暫定 itinerary
      let itinerary = results
        .filter((r) => r.ok && r.plan && Array.isArray(r.plan.schedule))
        .map((r) => r.plan);

      await traceStep(planId, 'create-day-plans:itinerary:assemble', {
        input: null,
        output: { days: itinerary.map(d => ({ day: d.day, total_cost: d.total_cost })) }
      });

      // 3) geocode（初回）
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
        const geos = await traceTimed(
          planId,
          'create-day-plans:geocode:stage1',
          () => geocodeBatchInternal({
            destination,
            items: items1,
            planId,
            GEOCODE_CACHE_FILE,
            GOOGLE_MAPS_API_KEY,
            GOOGLE_MAPS_LANG,
            GOOGLE_MAPS_REGION,
          }),
          { before: { items: items1.slice(0, 5) } }
        );
        mergeGeocodesIntoItinerary(destination, itinerary, geos);
        await traceMark(planId, 'create-day-plans:geocode:stage1', 'end', { merged: true });
      }

      // 4) 旅行全体の最終予算調整（80〜100%）
      let finalReport = null;
      if (finalizeBudget) {
        const { itinerary: fin, tripTotal } = await traceTimed(
          planId,
          'create-day-plans:budget:finalize',
          () => finalizeTripBudgetIfNeeded({
            openai,
            itinerary,
            planConditions,
            targetMinRatio,
            targetMaxRatio,
          }),
          {
            before: {
              planConditions,
              targetMinRatio,
              targetMaxRatio,
              totalsBefore: itinerary.map(d => ({ day: d.day, total_cost: d.total_cost }))
            }
          }
        );
        itinerary = fin;

        // geocode 再実行（名称差替え対策）
        const items2 = collectItems(itinerary);
        if (items2.length > 0) {
          const geos2 = await traceTimed(
            planId,
            'create-day-plans:geocode:stage2',
            () => geocodeBatchInternal({
              destination,
              items: items2,
              planId,
              GEOCODE_CACHE_FILE,
              GOOGLE_MAPS_API_KEY,
              GOOGLE_MAPS_LANG,
              GOOGLE_MAPS_REGION,
            }),
            { before: { items: items2.slice(0, 5) } }
          );
          mergeGeocodesIntoItinerary(destination, itinerary, geos2);
        }

        const budgetPerDay = Number(planConditions?.budgetPerDay);
        const totalBudget = Number.isFinite(budgetPerDay) ? budgetPerDay * itinerary.length : null;
        finalReport = {
          tripTotal,
          totalBudget,
          minTarget: Number.isFinite(totalBudget) ? Math.floor(totalBudget * targetMinRatio) : null,
          maxTarget: Number.isFinite(totalBudget) ? Math.floor(totalBudget * targetMaxRatio) : null,
        };
        await traceStep(planId, 'create-day-plans:budget:final-report', {
          output: finalReport
        });
      }

      // 5) 保存（Excel/JSON）
      let saved = null;
      try {
        saved = await persistItineraryAndExport(planId, itinerary, {});
        await traceMark(planId, 'create-day-plans:persist', 'end', { ok: !!saved, xlsxPath: saved?.xlsxPath || null });
      } catch (e) {
        await traceError(planId, 'create-day-plans:persist', e);
      }

      // 6) 予算サマリー
      const budgetSummaries = itinerary.map(d => {
        const total = calcDayTotalJPY(d);
        const budgetPerDay = Number(
          d?.budgetPerDay ??
          d?.constraints?.budgetPerDay ??
          planConditions?.budgetPerDay
        );
        return {
          day: d.day,
          date: d.date,
          total_cost_jpy: total,
          budgetPerDay: Number.isFinite(budgetPerDay) ? budgetPerDay : null,
          under_budget: Number.isFinite(budgetPerDay) ? total <= budgetPerDay : null,
        };
      });

      await traceSnapshot(planId, 'create-day-plans:budget:summaries', 'budgetSummaries', budgetSummaries);

      await traceMark(planId, 'create-day-plans', 'end', { days: itinerary.length });

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
      await traceError(planId, 'create-day-plans:catch', error);
      res.status(500).json({ error: `複数日プラン作成中にエラー: ${error?.message}` });
    }
  });

  // ========= 旅行全体の最終調整だけ =========
  app.post('/api/finalize-itinerary', async (req, res) => {
    try {
      const { planId, planConditions = {}, itinerary = [], targetMinRatio = 0.8, targetMaxRatio = 1.0 } = req.body || {};
      if (!Array.isArray(itinerary) || itinerary.length === 0) {
        await traceError(planId, 'finalize-itinerary:validate', new Error('itinerary empty'));
        return res.status(400).json({ error: 'itinerary は配列である必要があります' });
      }

      const destination =
        planConditions?.destination ||
        itinerary?.[0]?.destination ||
        '';

      const norm = itinerary.map(normalizeDayPlanCosts);
      await traceSnapshot(planId, 'finalize-itinerary:normalize', 'totals', norm.map(d => ({ day: d.day, total_cost: d.total_cost })));

      const { itinerary: fin, tripTotal } = await traceTimed(
        planId,
        'finalize-itinerary:budget:finalize',
        () => finalizeTripBudgetIfNeeded({
          openai,
          itinerary: norm,
          planConditions,
          targetMinRatio,
          targetMaxRatio,
        }),
        { before: { planConditions, targetMinRatio, targetMaxRatio } }
      );

      const items = [];
      for (const d of fin || []) {
        for (const s of d.schedule || []) {
          items.push({ name: s.activity_name || s.name, area: d.area, day: d.day, time: s.time });
        }
      }
      if (items.length > 0) {
        const geos = await traceTimed(
          planId,
          'finalize-itinerary:geocode',
          () => geocodeBatchInternal({
            destination,
            items,
            planId,
            GEOCODE_CACHE_FILE,
            GOOGLE_MAPS_API_KEY,
            GOOGLE_MAPS_LANG,
            GOOGLE_MAPS_REGION,
          }),
          { before: { items: items.slice(0, 5) } }
        );
        mergeGeocodesIntoItinerary(destination, fin, geos);
      }

      if (planId) {
        try { await persistItineraryAndExport(planId, fin, {}); } catch (e) { await traceError(planId, 'finalize-itinerary:persist', e); }
      }

      const budgetPerDay = Number(planConditions?.budgetPerDay);
      const totalBudget = Number.isFinite(budgetPerDay) ? budgetPerDay * fin.length : null;

      res.json({
        itinerary: fin,
        tripTotal,
        totalBudget,
        minTarget: Number.isFinite(totalBudget) ? Math.floor(totalBudget * targetMinRatio) : null,
        maxTarget: Number.isFinite(totalBudget) ? Math.floor(totalBudget * targetMaxRatio) : null,
      });
    } catch (e) {
      await traceError(req.body?.planId, 'finalize-itinerary:catch', e);
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

      await traceMark(planId, 'revise-plan', 'start', { instructions });

      const llm = createLLMHandler(
        openai,
        revisePlanSystemPrompt,
        'revise',
        'gpt-4o-mini',
        { raw: true }
      );
      const json = await traceTimed(
        planId,
        'revise-plan:llm',
        () => llm.__call({
          body: { planId, planConditions, itinerary, instructions },
          planId,
        }),
        { before: { planConditions, itinerarySample: itinerary.slice(0, 1) } }
      );

      let revised = json?.revised_itinerary || [];
      if (!Array.isArray(revised) || revised.length === 0) {
        await traceError(planId, 'revise-plan:validate', new Error('empty revised_itinerary'), { raw: json });
        return res.status(500).json({ error: 'empty revised_itinerary', raw: json });
      }

      const budgetPerDay = Number(planConditions?.budgetPerDay);
      revised = await Promise.all(revised.map(async (d) => {
        let norm = normalizeDayPlanCosts(d);
        if (Number.isFinite(budgetPerDay) && budgetPerDay > 0) {
          const total = calcDayTotalJPY(norm);
          if (total > budgetPerDay) {
            norm = await traceTimed(
              planId,
              `revise-plan:rebudget:day${d?.day ?? ''}`,
              () => rebudgetDayPlanIfOverBudget({
                openai,
                systemPrompt: revisePlanSystemPrompt,
                userBody: { planId, planConditions, itinerary, instructions },
                draftPlan: norm,
                budgetPerDay,
                tries: 2,
              }),
              { before: { totalBefore: total, budgetPerDay } }
            );
            norm = normalizeDayPlanCosts(norm);
          }
        }
        return norm;
      }));

      const items = [];
      for (const d of revised) {
        for (const s of d?.schedule || []) {
          items.push({ name: s.activity_name || s.name, area: d.area });
        }
      }
      await traceTimed(
        planId,
        'revise-plan:geocode',
        () => geocodeBatchInternal({
          destination: planConditions?.destination || '',
          items,
          planId,
          GEOCODE_CACHE_FILE,
          GOOGLE_MAPS_API_KEY,
          GOOGLE_MAPS_LANG,
          GOOGLE_MAPS_REGION,
        }),
        { before: { items: items.slice(0, 5) } }
      );

      await traceMark(planId, 'revise-plan', 'end', { days: revised.length });

      res.json({ revised_itinerary: revised });
    } catch (e) {
      await traceError(req.body?.planId, 'revise-plan:catch', e);
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

  // ========= 追加: トレース専用ビュー =========
  // GET /api/plan/trace?planId=...&format=json | jsonl
  app.get('/api/plan/trace', async (req, res) => {
    try {
      const { planId, format = 'json' } = req.query || {};
      if (!planId) return res.status(400).json({ error: 'planId is required' });

      const { logs } = await ExcelLogger.readState(String(planId));
      const traces = (logs || []).filter((x) => x?.type === 'trace').map((x) => x?.payload || x);

      if ((format || '').toLowerCase() === 'jsonl') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(traces.map((o) => JSON.stringify(o)).join('\n'));
        return;
      }
      res.json({ ok: true, planId, count: traces.length, traces });
    } catch (e) {
      res.status(500).json({ error: e?.message || 'trace read failed' });
    }
  });
}
