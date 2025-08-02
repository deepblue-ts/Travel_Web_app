// src/App.jsx

import { useState } from "react";
import TopPage from "./pages/TopPage";
import PlanWizard from "./pages/PlanWizard";
import PlanResult from "./pages/PlanResult";
import { PlanProvider } from "./contexts/PlanContext";

export default function App() {
  const [step, setStep] = useState(0); // 0: Top, 1: Wizard, 2: Result

  const handleStart = () => {
    setStep(1);
  };

  const handleBackToTop = () => {
    setStep(0);
  };

  const handlePlanGenerated = () => {
    setStep(2);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <PlanWizard
            onBack={handleBackToTop}
            onPlanGenerated={handlePlanGenerated}
          />
        );
      case 2:
        return (
          // ★ 利用するコンポーネント名も PlanResult に変更
          <PlanResult
            onBackToTop={handleBackToTop}
          />
        );
      case 0:
      default:
        return <TopPage onStart={handleStart} />;
    }
  };

  return (
    <PlanProvider>
      <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
        {renderStep()}
      </div>
    </PlanProvider>
  );
}