// src/contexts/PlanContext.jsx

import { createContext, useContext, useState } from "react";
import moment from "moment";
import {
  createMasterPlan,
  findDiningOptions,
  findAccommodation,
  findActivities,
  createDayPlans,
} from "../api/llmService";

const PlanContext = createContext();

export function PlanProvider({ children }) {
  const [plan, setPlan] = useState({
    origin: "", destination: "", areas: [],
    dates: { start: null, end: null }, transport: "public",
    budget: 50000, preferences: "",
  });

  const [planJsonResult, setPlanJsonResult] = useState(null);
  const [error, setError] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState({ active: false, message: "", progress: 0 });

  const generatePlan = async () => {
    setLoadingStatus({ active: true, message: "プランニング準備中...", progress: 0 });
    setError(null);
    setPlanJsonResult(null);

    try {
      const startDate = moment(plan.dates.start);
      const endDate = moment(plan.dates.end);
      if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
        throw new Error("日程が正しく設定されていません。");
      }
      const duration = endDate.diff(startDate, "days") + 1;

      setLoadingStatus({ active: true, message: "旅行の骨格を組み立て中...", progress: 5 });
      const masterPlanResponse = await createMasterPlan({ ...plan, duration });
      
      // ★★★★★★★ ここを修正 ★★★★★★★
      // バックエンドが返すキー名 `master_plan` に合わせる
      const masterPlan = masterPlanResponse.master_plan || [];
      if (masterPlan.length !== duration) {
        throw new Error("AIによるエリア分割が日数と一致しませんでした。");
      }
      const daysMeta = masterPlan.map((d, idx) => ({
        ...d,
        date: startDate.clone().add(idx, "days").format("YYYY-MM-DD"),
      }));

      setLoadingStatus({ active: true, message: "おすすめスポットを収集中...", progress: 20 });
      const perDayResources = await Promise.all(
        daysMeta.map(async (d) => {
          const conditions = { ...plan, currentArea: d.area };
          const [dining, accommodation, activities] = await Promise.all([
            findDiningOptions(conditions).catch(() => ({ restaurants: [] })),
            findAccommodation(conditions).catch(() => ({ hotels: [] })),
            findActivities(conditions).catch(() => ({ activities: [] })),
          ]);
          return { ...d, availableResources: { restaurants: dining.restaurants, hotels: accommodation.hotels, activities: activities.activities } };
        })
      );

      setLoadingStatus({ active: true, message: "各日の詳細プランを同時生成中...", progress: 60 });
      const batchInput = perDayResources.map((r) => ({
        day: r.day, date: r.date, area: r.area, theme: r.theme,
        planConditions: plan,
        availableResources: r.availableResources,
      }));
      const { results } = await createDayPlans(batchInput);
      const okPlans = results.filter(r => r.ok).map(r => r.plan).sort((a, b) => a.day - b.day);

      if (okPlans.length === 0 && results.length > 0) {
        throw new Error(`全日程のプラン生成に失敗しました。最初の失敗理由: ${results.find(r => !r.ok)?.error}`);
      }

      setLoadingStatus({ active: true, message: "最終仕上げ中...", progress: 95 });
      const totalCost = okPlans.reduce((sum, day) => sum + (parseInt(String(day.total_cost).replace(/[^\d]/g, ""), 10) || 0), 0);
      const finalJson = {
        title: `${plan.destination}への${duration}日間の旅`,
        introduction: "あなただけの特別な旅行プランが完成しました！",
        itinerary: okPlans,
        total_cost_all_days: totalCost.toLocaleString() + "円",
        conclusion: "この旅が、忘れられない素晴らしい思い出になりますように。",
      };

      setPlanJsonResult(finalJson);
      setLoadingStatus({ active: true, message: "完成！", progress: 100 });
    } catch (err) {
      console.error("PlanContextでのエラー:", err);
      setError(err.message || "プラン生成中に不明なエラーが発生しました。");
      setLoadingStatus({ active: false, message: "", progress: 0 });
    }
  };

  const value = { plan, setPlan, planJsonResult, error, loadingStatus, generatePlan };
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  return useContext(PlanContext);
}