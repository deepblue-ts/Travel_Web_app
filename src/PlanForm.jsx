// src/PlanForm.jsx
import React, { useState } from "react";
import { fetchTravelPlan } from "./api";
import PlanResult from "./PlanResult";

const defaultForm = {
  origin: "",
  destination: "",
  days: 3,
  budget: 50000
};

export default function PlanForm() {
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const plan = await fetchTravelPlan(form);
      setResult(plan);
    } catch (err) {
      alert("旅行プランの取得に失敗しました");
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 500, margin: "2em auto" }}>
      <h2>旅行プラン自動作成</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>出発地: </label>
          <input name="origin" value={form.origin} onChange={handleChange} required />
        </div>
        <div>
          <label>目的地: </label>
          <input name="destination" value={form.destination} onChange={handleChange} required />
        </div>
        <div>
          <label>日数: </label>
          <input name="days" type="number" min="1" value={form.days} onChange={handleChange} required />
        </div>
        <div>
          <label>予算(円): </label>
          <input name="budget" type="number" min="1" value={form.budget} onChange={handleChange} required />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "生成中..." : "旅行プランを作成"}
        </button>
      </form>
      {result && <PlanResult result={result} />}
    </div>
  );
}
