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


export default function PlanWizard({ onBack, onGenerateStart }) {
  const { plan, setPlan, generatePlan } = usePlan();
  
  // ★ 1. 目的地の入力欄専用のローカルstateを定義
  // これで、入力のたびにグローバルな `plan` stateが更新されるのを防ぐ
  const [destinationInput, setDestinationInput] = useState(plan.destination || "");

  const [areaOptions, setAreaOptions] = useState([]);
  const [isAreaLoading, setIsAreaLoading] = useState(false);

  // ★ 2. デバウンス処理のためのuseEffect
  // destinationInput（入力欄の値）が変更されたら、このeffectが実行される
  useEffect(() => {
    // 500ミリ秒後に実行されるタイマーを設定
    const debounceTimer = setTimeout(() => {
      // 500ミリ秒間、新しい入力がなければ、
      // 入力値をグローバルな `plan.destination` に反映させる
      setPlan(p => ({ ...p, destination: destinationInput }));
    }, 500); // 500ミリ秒（0.5秒）の待機時間を設定

    // クリーンアップ関数
    // このeffectが再実行される前（＝ユーザーが新しい文字を入力した時）に
    // 前回のタイマーを解除する。これにより、最後の入力から500ミリ秒が経過した時だけ
    // タイマーが実行されることになる。
    return () => {
      clearTimeout(debounceTimer);
    };
  }, [destinationInput, setPlan]); // destinationInputが変更されるたびに監視

  
  // ★ 3. APIを呼び出すuseEffect (ここは変更なし)
  // このeffectは `plan.destination` を監視している。
  // `plan.destination` はデバウンス処理によって更新が遅延されるため、
  // 結果的にこのAPI呼び出しもデバウンスされることになる。
  useEffect(() => {
    if (!plan.destination) {
      setAreaOptions([]);
      return;
    }
    setIsAreaLoading(true);
    // 目的地が変わったら、選択済みのエリアをリセットする
    setPlan(p => ({ ...p, areas: [] }));

    fetchAreasForDestination(plan.destination).then(areas => {
      setAreaOptions(areas);
      setIsAreaLoading(false);
    });
  }, [plan.destination]); // 依存配列からsetPlanを削除してもOK


  const handleSubmit = async () => {
    if(onGenerateStart) {
      onGenerateStart();
    }
    await generatePlan();
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
          // ★ 4. valueとonChangeをローカルstateに接続する
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
      
      <StepButtons onBack={onBack} onSubmit={handleSubmit} />
    </WizardContainer>
  );
}