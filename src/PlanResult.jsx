// src/PlanResult.jsx
import React from "react";

export default function PlanResult({ result }) {
  if (!result) return null;
  return (
    <div style={{ marginTop: "2em", padding: "1em", border: "1px solid #ddd" }}>
      <h3>旅行プラン</h3>
      <div>{result.summary}</div>
      <ul>
        {result.plan.map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
