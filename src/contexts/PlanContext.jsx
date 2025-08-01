// contexts/PlanContext.jsx

import { createContext, useContext, useState } from "react";

const PlanContext = createContext();

export function PlanProvider({ children }) {
  const [plan, setPlan] = useState({
    origin: "",
    destination: "",
    areas: [], // area を areas に変更し、配列にする
    dates: { start: "", end: "" },
    transport: "",
    budget: 50000,
  });
  return (
    <PlanContext.Provider value={{ plan, setPlan }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  return useContext(PlanContext);
}