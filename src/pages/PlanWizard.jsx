// src/pages/PlanWizard.jsx (修正後)

import React, { useState, useEffect } from "react";
import { usePlan } from "../contexts/PlanContext";
import { fetchAreasForDestination } from "../api/llmService";
// ★ Sparkles アイコンをインポート
import { MapPin, CalendarDays, Wallet, PlaneTakeoff, Sparkles } from 'lucide-react';

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

// ★ Textarea のためのスタイルを追加（PlanWizard.styles.js に定義してもOK）
import styled from 'styled-components';

const StyledTextArea = styled.textarea`
  width: 100%;
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  font-size: 16px;
  line-height: 1.5;
  margin-top: 16px;
  min-height: 100px;
  resize: vertical; /* 縦方向のリサイズを許可 */

  &:focus {
    outline: none;
    border-color: #00A8A0; /* プライマリーカラー */
    box-shadow: 0 0 0 2px rgba(0, 168, 160, 0.2);
  }
`;


export default function PlanWizard({ onBack, onGenerateStart }) {
  const { plan, setPlan, generatePlan } = usePlan();
  const [destinationInput, setDestinationInput] = useState(plan.destination || "");
  const [areaOptions, setAreaOptions] = useState([]);
  const [isAreaLoading, setIsAreaLoading] = useState(false);

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      setPlan(p => ({ ...p, destination: destinationInput }));
    }, 500);
    return () => clearTimeout(debounceTimer);
  }, [destinationInput, setPlan]);

  useEffect(() => {
    if (!plan.destination) {
      setAreaOptions([]);
      return;
    }
    setIsAreaLoading(true);
    setPlan(p => ({ ...p, areas: [] }));
    fetchAreasForDestination(plan.destination).then(areas => {
      setAreaOptions(areas);
      setIsAreaLoading(false);
    });
  }, [plan.destination]);

  const handleSubmit = async () => {
    if(onGenerateStart) onGenerateStart();
    await generatePlan();
  };


  return (
    <WizardContainer>
      {/* --- ヘッダー (変更なし) --- */}
      <Header>
        <Title>AI Travel Planner</Title>
        <SubTitle>いくつかの情報を入力するだけで、あなただけの旅行プランを作成します。</SubTitle>
      </Header>

      {/* --- どこへ行きますか？ (変更なし) --- */}
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
          onChange={e => setPlan(p => ({ ...p, origin: e.target.value }))}
          placeholder="例: 東京駅"
        />
        <LocationInput
          label="目的地 (都道府県・市など)"
          icon={<MapPin size={20} />}
          type="text"
          value={destinationInput}
          onChange={e => setDestinationInput(e.target.value)}
          placeholder="例: 京都"
        />
        {isAreaLoading ? (
            <LoadingText>エリア候補を検索中...</LoadingText>
        ) : (
            (destinationInput || areaOptions.length > 0) && (
                <AreaSelector
                    areaOptions={areaOptions}
                    selectedAreas={plan.areas}
                    onAreaChange={newAreas => setPlan(p => ({ ...p, areas: newAreas }))}
                />
            )
        )}
      </FormSection>

      {/* --- いつ、どうやって行きますか？ (変更なし) --- */}
      <FormSection>
        <SectionTitle>
          <CalendarDays size={22} />
          いつ、どうやって行きますか？
        </SectionTitle>
        <CalendarRangePicker value={plan} setValue={setPlan} />
        <div style={{marginTop: "24px"}}>
            <TransportSelector />
        </div>
      </FormSection>
      
      {/* --- 予算はどのくらいですか？ (変更なし) --- */}
      <FormSection>
        <SectionTitle>
          <Wallet size={22} />
          予算はどのくらいですか？
        </SectionTitle>
        <BudgetInput value={plan} setValue={setPlan} />
      </FormSection>
      
      {/* ★★★ ここから新しいセクションを追加 ★★★ */}
      <FormSection>
        <SectionTitle>
          <Sparkles size={22} />
          こだわり条件はありますか？
        </SectionTitle>
        <StyledTextArea
          value={plan.preferences}
          onChange={e => setPlan(p => ({ ...p, preferences: e.target.value }))}
          placeholder="例：子供が楽しめるアクティビティを入れたい、歴史的な建物を巡るのが好き、海鮮が美味しいお店に行きたい...など"
        />
      </FormSection>
      {/* ★★★ ここまで ★★★ */}
      
      <StepButtons onBack={onBack} onSubmit={handleSubmit} />
    </WizardContainer>
  );
}