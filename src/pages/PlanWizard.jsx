// src/pages/PlanWizard.jsx
import React, { useState, useEffect, useMemo } from "react";
import { usePlan } from "../contexts/PlanContext";
import { fetchAreasForDestination } from "../api/llmService";
import { MapPin, CalendarDays, Wallet, PlaneTakeoff, Sparkles } from "lucide-react";

import {
  WizardContainer,
  Header,
  Title,
  SubTitle,
  FormSection,
  SectionTitle,
  LoadingText,
} from "./PlanWizard.styles";

import LocationInput from "../components/LocationInput";
import AreaSelector from "../components/AreaSelector";
import CalendarRangePicker from "../components/CalendarRangePicker";
import BudgetInput from "../components/BudgetInput";
import StepButtons from "../components/StepButtons";
import TransportSelector from "../components/TransportSelector";

import styled from "styled-components";

const StyledTextArea = styled.textarea`
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  font-size: 16px;
  line-height: 1.5;
  margin-top: 16px;
  min-height: 100px;
  resize: vertical;

  &:focus {
    outline: none;
    border-color: #00A8A0;
    box-shadow: 0 0 0 2px rgba(0, 168, 160, 0.2);
  }
`;

export default function PlanWizard({ onBack, onGenerateStart }) {
  const { plan, setPlan, generatePlan } = usePlan();

  // 入力のローカル状態（目的地はデバウンスで plan に反映）
  const [destinationInput, setDestinationInput] = useState(plan.destination || "");

  // エリア候補
  const [areaOptions, setAreaOptions] = useState([]);
  const [isAreaLoading, setIsAreaLoading] = useState(false);

  // 送信連打防止
  const [submitting, setSubmitting] = useState(false);

  // ---- destination のデバウンス反映 ----
  useEffect(() => {
    const t = setTimeout(() => {
      setPlan((p) => ({ ...p, destination: destinationInput }));
    }, 500);
    return () => clearTimeout(t);
  }, [destinationInput, setPlan]);

  // ---- 目的地が変わったらエリア候補を取得（競合対策：aliveフラグ） ----
  useEffect(() => {
    let alive = true;

    (async () => {
      if (!plan.destination) {
        setAreaOptions([]);
        return;
      }
      setIsAreaLoading(true);
      // 目的地が変わったら選択済みエリアはいったんクリア
      setPlan((p) => ({ ...p, areas: [] }));
      try {
        const areas = await fetchAreasForDestination(plan.destination);
        if (alive) setAreaOptions(areas);
      } catch (e) {
        if (alive) setAreaOptions([]);
        console.warn("fetchAreasForDestination failed:", e?.message);
      } finally {
        if (alive) setIsAreaLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [plan.destination, setPlan]);

  // ---- 必須項目の満たし判定 ----
  const canSubmit = useMemo(() => {
    return Boolean(
      plan.origin &&
        destinationInput &&
        plan.dates?.start &&
        plan.dates?.end
    );
  }, [plan.origin, destinationInput, plan.dates?.start, plan.dates?.end]);

  // ---- 送信 ----
  const handleSubmit = async () => {
    if (!canSubmit) {
      alert("出発地・目的地・日付を入力してください。");
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      onGenerateStart?.();      // ローディング画面へ
      await generatePlan();     // PlanContext 側が結果/エラーを管理
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WizardContainer>
      {/* ヘッダー */}
      <Header>
        <Title>AI Travel Planner</Title>
        <SubTitle>いくつかの情報を入力するだけで、あなただけの旅行プランを作成します。</SubTitle>
      </Header>

      {/* どこへ行きますか？ */}
      <FormSection>
        <SectionTitle>
          <MapPin size={22} />
          どこへ行きますか？
        </SectionTitle>

        <LocationInput
          label="出発地"
          icon={<PlaneTakeoff size={20} />}
          type="text"
          value={plan.origin}
          onChange={(e) => setPlan((p) => ({ ...p, origin: e.target.value }))}
          placeholder="例: 東京駅"
        />

        <LocationInput
          label="目的地 (都道府県・市など)"
          icon={<MapPin size={20} />}
          type="text"
          value={destinationInput}
          onChange={(e) => setDestinationInput(e.target.value)}
          placeholder="例: 京都"
        />

        {isAreaLoading ? (
          <LoadingText>エリア候補を検索中...</LoadingText>
        ) : (
          (destinationInput || areaOptions.length > 0) && (
            <AreaSelector
              areaOptions={areaOptions}
              selectedAreas={plan.areas}
              onAreaChange={(newAreas) => setPlan((p) => ({ ...p, areas: newAreas }))}
            />
          )
        )}
      </FormSection>

      {/* いつ、どうやって行きますか？ */}
      <FormSection>
        <SectionTitle>
          <CalendarDays size={22} />
          いつ、どうやって行きますか？
        </SectionTitle>

        <CalendarRangePicker value={plan} setValue={setPlan} />

        <div style={{ marginTop: "24px" }}>
          <TransportSelector />
        </div>
      </FormSection>

      {/* 予算 */}
      <FormSection>
        <SectionTitle>
          <Wallet size={22} />
          予算はどのくらいですか？
        </SectionTitle>

        <BudgetInput value={plan} setValue={setPlan} />
      </FormSection>

      {/* こだわり条件 */}
      <FormSection>
        <SectionTitle>
          <Sparkles size={22} />
          こだわり条件はありますか？
        </SectionTitle>

        <StyledTextArea
          value={plan.preferences}
          onChange={(e) => setPlan((p) => ({ ...p, preferences: e.target.value }))}
          placeholder="例：子供が楽しめるアクティビティを入れたい、歴史的な建物を巡るのが好き、海鮮が美味しいお店に行きたい...など"
        />
      </FormSection>

      {/* 次へ/作成ボタン */}
      <StepButtons
        onBack={onBack}
        onSubmit={handleSubmit}
        // もし StepButtons が disabled を受け取れるなら渡す（任意）
        // submitDisabled={!canSubmit || submitting}
      />
    </WizardContainer>
  );
}
