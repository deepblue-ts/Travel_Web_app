import { useState } from "react";
import TopPage from "./pages/TopPage";
import PlanWizard from "./pages/PlanWizard";

export default function App() {
  const [step, setStep] = useState(0);

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8" }}>
      {step === 0 ? (
        <TopPage onStart={() => setStep(1)} />
      ) : (
        <PlanWizard onBack={() => setStep(0)} />
      )}
    </div>
  );
}
