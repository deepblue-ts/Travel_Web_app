// src/pages/PlanWizard.jsx

import React, { useState, useEffect } from "react";
import { usePlan } from "../contexts/PlanContext";
import { fetchAreasForDestination } from "../api/llmService";
import { MapPin, CalendarDays, Wallet, PlaneTakeoff } from 'lucide-react';

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

// ★ Props名を onGenerateStart に変更
export default function PlanWizard({ onBack, onGenerateStart }) {
  const { plan, setPlan, generatePlan } = usePlan();
  const [areaOptions, setAreaOptions] = useState([]);
  const [isAreaLoading, setIsAreaLoading] = useState(false);

  useEffect(() => {
    if (!plan.destination) {
      setAreaOptions([]);
      return;
    }
    setIsAreaLoading(true);
    fetchAreasForDestination(plan.destination).then(areas => {
      setAreaOptions(areas);
      setIsAreaLoading(false);
      setPlan(p => ({ ...p, areas: [] }));
    });
  }, [plan.destination, setPlan]);

  // ★ handleSubmitの処理を修正
  const handleSubmit = async () => {
    // 1. ローディングページへの遷移を開始するようApp.jsxに通知
    if(onGenerateStart) {
      onGenerateStart();
    }
    
    // 2. プラン生成の非同期処理を開始 (完了を待つ)
    await generatePlan();
    
    // 3. この後のページ遷移はApp.jsxのuseEffectが担当する
  };

  return (
    <WizardContainer>
      <Header>
        <Title>AI Travel Planner</Title>
        <SubTitle>いくつかの情報を入力するだけで、あなただけの旅行プランを作成します。</SubTitle>
      </Header>

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
          value={plan.destination}
          onChange={e => setPlan(p => ({ ...p, destination: e.target.value }))}
          placeholder="例: 京都"
        />
        {isAreaLoading ? (
            <LoadingText>エリア候補を検索中...</LoadingText>
        ) : (
            (plan.destination || areaOptions.length > 0) && (
                <AreaSelector
                    areaOptions={areaOptions}
                    selectedAreas={plan.areas}
                    onAreaChange={newAreas => setPlan(p => ({ ...p, areas: newAreas }))}
                />
            )
        )}
      </FormSection>

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

      <FormSection>
        <SectionTitle>
          <Wallet size={22} />
          予算はどのくらいですか？
        </SectionTitle>
        <BudgetInput value={plan} setValue={setPlan} />
      </FormSection>
      
      {/* ★ onSubmitに関数を渡す */}
      <StepButtons onBack={onBack} onSubmit={handleSubmit} />
    </WizardContainer>
  );
}