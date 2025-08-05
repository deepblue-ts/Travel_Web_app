// src/contexts/PlanContext.jsx

import { createContext, useContext, useState } from "react";
import moment from 'moment'; // 日数計算のためにmoment.jsをインポート
import { 
  findDiningOptions, 
  findAccommodation, 
  findActivities,
  createDayPlan 
} from '../api/llmService';

const PlanContext = createContext();

export function PlanProvider({ children }) {
  // ユーザーがウィザードで入力するプランの情報
  const [plan, setPlan] = useState({
    origin: "",
    destination: "",
    areas: [],
    dates: { start: null, end: null },
    transport: "public",
    budget: 50000,
  });

  // LLMが生成したプランの結果
  const [planJsonResult, setPlanJsonResult] = useState(null);
  
  // エラー情報
  const [error, setError] = useState(null);
  
  // ローディング状態（進捗メッセージと進捗率）
  const [loadingStatus, setLoadingStatus] = useState({
    active: false,
    message: "",
    progress: 0,
  });

  const generatePlan = async () => {
    setLoadingStatus({ active: true, message: "プランニングの準備をしています...", progress: 0 });
    setError(null);
    setPlanJsonResult(null); // 前回の結果をクリア

    try {
      // --- フェーズ1: リソース確保 (並列) ---
      setLoadingStatus({ active: true, message: "使える手札（食事・宿・アクティビティ）を集めています...", progress: 10 });
      const availableResources = await Promise.all([
        findDiningOptions(plan),
        findAccommodation(plan),
        findActivities(plan)
      ]).then(([dining, accommodation, activities]) => ({ dining, accommodation, activities }));

      // --- フェーズ2: 日毎プランニング (逐次リレー) ---
      const startDate = moment(plan.dates.start);
      const endDate = moment(plan.dates.end);
      
      // 日数が無効な場合はエラー処理
      if (!startDate.isValid() || !endDate.isValid() || endDate.isBefore(startDate)) {
        throw new Error("旅行の日程が正しく設定されていません。");
      }
      
      const duration = endDate.diff(startDate, 'days') + 1;
      
      let finalItinerary = [];
      let previousItinerary = null; // 前日の旅程を保持する変数

      for (let i = 0; i < duration; i++) {
        const currentDay = i + 1;
        // プログレスバーの進捗を計算
        const progress = 10 + Math.round((80 / duration) * (i + 1));
        setLoadingStatus({ active: true, message: `${currentDay}日目のプランを作成中...`, progress });

        // バックエンドに送信するリクエストデータ
        const dayPlanRequest = {
          day: currentDay,
          planConditions: plan,
          availableResources,
          previousItinerary
        };

        const dayPlanData = await createDayPlan(dayPlanRequest);

        finalItinerary.push(dayPlanData);
        previousItinerary = finalItinerary; // 次の日のために、これまでの全旅程を渡す
      }
      
      // --- フェーズ3: 最終化 ---
      setLoadingStatus({ active: true, message: "最終仕上げをしています...", progress: 95 });

      const finalJson = {
        title: `${plan.destination}への${duration}日間の旅`,
        introduction: "あなただけの特別な旅行プランが完成しました！最高の旅を楽しんできてくださいね。",
        itinerary: finalItinerary,
        conclusion: "この旅が、あなたにとって忘れられない素晴らしい思い出になりますように。"
      };
      
      setPlanJsonResult(finalJson);
      setLoadingStatus({ active: true, message: "完成！", progress: 100 });

    } catch (err) {
      console.error("PlanContextでのエラー:", err);
      setError(err.message || "プランの生成中に不明なエラーが発生しました。");
      setLoadingStatus({ active: false, message: "", progress: 0 });
    }
  };

  const value = {
    plan,
    setPlan,
    planJsonResult,
    error,
    loadingStatus,
    generatePlan,
  };

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  return useContext(PlanContext);
}