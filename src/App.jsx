// src/App.jsx
// ページの切り替え（ルーター役）
import { useState, useEffect } from "react";
import TopPage from "./pages/TopPage";
import PlanWizard from "./pages/PlanWizard";
import GeneratingPlanPage from "./pages/GeneratingPlanPage"; // ★ インポート
import PlanResult from "./pages/PlanResult";
import { usePlan } from "./contexts/PlanContext"; // ★ usePlanをインポート

export default function App() {
  // 0: Top, 1: Wizard, 2: Generating, 3: Result
  const [step, setStep] = useState(0);
  const { loadingStatus, error } = usePlan(); // ★ Contextから状態を取得

  // ★ プラン生成が完了したら自動で結果ページへ遷移させる
  useEffect(() => {
    // 実行中で、かつ100%に達したら結果ページへ
    if (loadingStatus.active && loadingStatus.progress === 100) {
      // 少し待ってから遷移することで「完成！」のメッセージを見せる
      const timer = setTimeout(() => {
        setStep(3);
      }, 1000);
      return () => clearTimeout(timer);
    }
    // 実行中でなくなった場合（エラーなど）はWizardに戻す
    if (!loadingStatus.active && step === 2) {
      // エラーがあればアラートなども出せる
      if(error) alert(error);
      setStep(1); 
    }
  }, [loadingStatus, error, step]);

  const handleStart = () => setStep(1);
  const handleBackToTop = () => setStep(0);
  
  // ★ プラン生成"開始"時にローディングページへ遷移させる
  const handlePlanGenerationStart = () => {
    setStep(2);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <PlanWizard onBack={handleBackToTop} onGenerateStart={handlePlanGenerationStart} />;
      case 2:
        return <GeneratingPlanPage />; // ★ ローディングページ
      case 3:
        return <PlanResult onBackToTop={handleBackToTop} />;
      default:
        return <TopPage onStart={handleStart} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      {renderStep()}
    </div>
  );
}