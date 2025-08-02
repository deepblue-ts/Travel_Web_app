// src/contexts/PlanContext.jsx

import { createContext, useContext, useState } from "react";
import { createTravelPlan } from '../api/llmService';

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
  const [planResult, setPlanResult] = useState(null);
  // ローディング状態（プラン生成中かどうか）
  const [isLoading, setIsLoading] = useState(false);
  // エラー情報
  const [error, setError] = useState(null);

  /**
   * インポートしたcreateTravelPlan関数を呼び出し、
   * その状態（ローディング、成功、失敗）を管理する
   */
  const generatePlan = async () => {
    setIsLoading(true);
    setError(null);
    setPlanResult(null);

    try {
      // 外部のAPIサービスを呼び出す
      const result = await createTravelPlan(plan);
      setPlanResult(result);
    } catch (err) {
      console.error("PlanContextでのエラー:", err);
      setError("プランの生成に失敗しました。時間をおいてもう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  };

  // アプリケーション全体で共有したい値と関数をまとめる
  const value = {
    plan,
    setPlan,
    planResult,
    isLoading,
    error,
    generatePlan, // この関数をPlanWizardから呼び出す
  };

  return (
    <PlanContext.Provider value={value}>
      {children}
    </PlanContext.Provider>
  );
}

// コンテキストの値を簡単に利用するためのカスタムフック
export function usePlan() {
  return useContext(PlanContext);
}