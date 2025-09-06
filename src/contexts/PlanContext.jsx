// src/contexts/PlanContext.jsx
import { createContext, useContext, useState } from "react";
import moment from "moment";
import {
  // LLM agents (+ planId を必ず付与)
  createMasterPlan,
  findDiningOptions,
  findAccommodation,
  findActivities,
  createDayPlans,
  // Excel logging lifecycle
  startPlanSession,
  logUser,
  finalizePlan,
  // Geocoding (Excel にも保存される)
  geocodeItinerary,
} from "../api/llmService";

const PlanContext = createContext();

export function PlanProvider({ children }) {
  const [plan, setPlan] = useState({
    origin: "",
    destination: "",
    areas: [],
    dates: { start: null, end: null },
    transport: "public",
    budget: 50000,
    preferences: "",
  });

  const [planId, setPlanId] = useState(null);
  const [planJsonResult, setPlanJsonResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState({
    active: false,
    message: "",
    progress: 0,
  });

  // 進捗ユーティリティ
  const step = (message, progress) =>
    setLoadingStatus({ active: true, message, progress });

  const done = () =>
    setLoadingStatus({ active: true, message: "完成！", progress: 100 });

  // 価格文字列 → number
  const yen = (v) => {
    const n = parseInt(String(v ?? "").replace(/[^\d]/g, ""), 10);
    return Number.isFinite(n) ? n : 0;
  };

  // Excel用の軽量オブジェクト（places/days/estimates）を構築
  function buildFinalPlanForExcel(itinerary, geoResults) {
    // query → geocode の辞書
    const geoMap = new Map();
    for (const g of geoResults || []) {
      if (g?.query) geoMap.set(g.query, g);
    }

    // name+area でユニーク化
    const placeKey = (name, area) =>
      `${(name || "").trim()}__${(area || "").trim()}`;
    const placeIndex = new Map();
    const places = [];
    let idx = 1;

    for (const day of itinerary || []) {
      for (const s of day.schedule || []) {
        const key = placeKey(s.activity_name, day.area);
        if (!placeIndex.has(key)) {
          const query = [s.activity_name, day.area, "日本"]
            .filter(Boolean)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          const g = geoMap.get(query);
          const id = `p${idx++}`;
          placeIndex.set(key, id);
          places.push({
            id,
            name: s.activity_name || "",
            type: "poi",
            area: day.area || "",
            priceYen: yen(s.price),
            url: s.url || "",
            lat: g?.lat ?? "",
            lon: g?.lon ?? "",
          });
        }
      }
    }

    const days = (itinerary || []).map((d) => ({
      day: d.day,
      date: d.date || "",
      stops: (d.schedule || []).map((s) => ({
        time: s.time || "",
        placeId: placeIndex.get(placeKey(s.activity_name, d.area)),
        note: (s.description || "").slice(0, 120),
        costYen: yen(s.price),
      })),
    }));

    const estimates = {
      totalCostYen: days.reduce(
        (sum, day) =>
          sum + day.stops.reduce((s2, st) => s2 + (st.costYen || 0), 0),
        0
      ),
    };

    return { places, days, estimates };
  }

  const generatePlan = async () => {
    setError(null);
    setPlanJsonResult(null);
    step("プランニング準備中...", 0);

    try {
      const startDate = moment(plan.dates.start);
      const endDate = moment(plan.dates.end);
      if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
        throw new Error("日程が正しく設定されていません。");
      }
      const duration = endDate.diff(startDate, "days") + 1;

      // ① セッション開始（Index.xlsx に追記 & planId 取得）
      const session = await startPlanSession({
        origin: plan.origin,
        destination: plan.destination,
        dates: plan.dates,
        duration,
        budgetPerDay: plan.budget,
        transport: plan.transport,
      });
      setPlanId(session.planId);

      // ② ユーザー入力ログ（軽量）
      await logUser(session.planId, [
        { field: "origin", value: plan.origin },
        { field: "destination", value: plan.destination },
        { field: "dates", value: JSON.stringify(plan.dates) },
        { field: "transport", value: plan.transport },
        { field: "budget", value: String(plan.budget) },
        { field: "preferences", value: plan.preferences || "" },
        { field: "areas", value: JSON.stringify(plan.areas || []) },
      ]);

      // ③ マスタープラン
      step("旅行の骨格を組み立て中...", 5);
      const masterPlanResponse = await createMasterPlan(
        { ...plan, duration },
        session.planId
      );

      const masterPlan = masterPlanResponse.master_plan || [];
      if (masterPlan.length !== duration) {
        throw new Error("AIによるエリア分割が日数と一致しませんでした。");
      }

      const daysMeta = masterPlan.map((d, idx) => ({
        ...d,
        date: startDate.clone().add(idx, "days").format("YYYY-MM-DD"),
      }));

      // ④ 各エージェント（食・宿・体験）
      step("おすすめスポットを収集中...", 20);
      const perDayResources = await Promise.all(
        (daysMeta || []).map(async (d) => {
          const conditions = { ...plan, currentArea: d.area };

          const [dining, accommodation, activities] = await Promise.all([
            findDiningOptions(conditions, session.planId).catch(() => ({
              restaurants: [],
            })),
            findAccommodation(conditions, session.planId).catch(() => ({
              hotels: [],
            })),
            findActivities(conditions, session.planId).catch(() => ({
              activities: [],
            })),
          ]);

          return {
            ...d,
            availableResources: {
              restaurants: dining.restaurants || [],
              hotels: accommodation.hotels || [],
              activities: activities.activities || [],
            },
          };
        })
      );

      // ⑤ 各日の詳細プラン
      step("各日の詳細プランを生成中...", 60);
      const batchInput = perDayResources.map((r) => ({
        day: r.day,
        date: r.date,
        area: r.area,
        theme: r.theme,
        planConditions: plan,
        availableResources: r.availableResources,
      }));

      const { results } = await createDayPlans(batchInput, session.planId);
      const okPlans = results
        .filter((r) => r.ok)
        .map((r) => r.plan)
        .sort((a, b) => a.day - b.day);

      if (okPlans.length === 0 && results.length > 0) {
        throw new Error(
          `全日程のプラン生成に失敗しました。最初の失敗理由: ${
            results.find((r) => !r.ok)?.error
          }`
        );
      }

      // ⑥ ジオコーディング（Excelにも自動で保存）
      step("地図データを作成中...", 80);
      const geo = await geocodeItinerary(plan.destination, okPlans, session.planId);

      // ⑦ 画面表示用の最終JSON
      step("最終仕上げ中...", 90);
      const totalCost = okPlans.reduce(
        (sum, day) => sum + (yen(day.total_cost) || 0),
        0
      );
      const finalJson = {
        title: `${plan.destination}への${duration}日間の旅`,
        introduction: "あなただけの特別な旅行プランが完成しました！",
        itinerary: okPlans,
        total_cost_all_days: totalCost.toLocaleString() + "円",
        conclusion: "この旅が、忘れられない素晴らしい思い出になりますように。",
        geocode_results: geo?.results || [],
      };
      setPlanJsonResult(finalJson);

      // ⑧ Excel出力用の軽量フォーマットを作って確定
      const finalPlanForExcel = buildFinalPlanForExcel(
        okPlans,
        finalJson.geocode_results
      );
      // Overview の title/合計コストを見せたいので少しだけ付与
      finalPlanForExcel.title = finalJson.title;
      finalPlanForExcel.estimates = finalPlanForExcel.estimates || {};
      finalPlanForExcel.estimates.totalCostYen =
        finalPlanForExcel.estimates.totalCostYen ||
        okPlans.reduce((s, d) => s + yen(d.total_cost), 0);

      await finalizePlan(session.planId, finalPlanForExcel);

      // ⑨ 完了
      done();
      // ローディングの余韻を少し見せる
      setTimeout(
        () => setLoadingStatus({ active: false, message: "", progress: 0 }),
        400
      );
    } catch (err) {
      console.error("PlanContextでのエラー:", err);
      setError(err.message || "プラン生成中に不明なエラーが発生しました。");
      setLoadingStatus({ active: false, message: "", progress: 0 });
    }
  };

  const value = {
    plan,
    setPlan,
    planId,
    planJsonResult,
    error,
    loadingStatus,
    generatePlan,
  };

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  return useContext(PlanContext);
}
