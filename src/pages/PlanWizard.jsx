import React, { useState, useEffect } from "react";
import styled, { keyframes } from "styled-components";
import { usePlan } from "../contexts/PlanContext";

// 各コンポーネントのインポート
import LocationInput from "../components/LocationInput";
import AreaSelector from "../components/AreaSelector";
import CalendarRangePicker from "../components/CalendarRangePicker";
import BudgetInput from "../components/BudgetInput";
import StepButtons from "../components/StepButtons";
import TransportSelector from "../components/TransportSelector";

// --- スタイル定義 (styled-components) ---

// ふわっと表示されるアニメーション
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

// フォーム全体を囲むコンテナ
const WizardContainer = styled.div`
  max-width: 600px; /* 少し幅を広げます */
  margin: 60px auto;
  background: #ffffff;
  padding: 40px 48px;
  border-radius: 24px;
  box-shadow: 0 10px 40px rgba(0, 192, 184, 0.15);
  animation: ${fadeIn} 0.6s ease-out;
`;

// ヘッダーセクション
const Header = styled.header`
  text-align: center;
  margin-bottom: 48px;
`;

// メインタイトル（ご要望通り、大きく、指定の色に）
const Title = styled.h1`
  font-size: 42px; /* 大幅にサイズアップ */
  font-weight: 800; /* 太くしてインパクトを */
  color: #00c0b8;
  margin: 0;
  line-height: 1.2;
`;

// サブタイトル（ユーザーへの案内を追加）
const SubTitle = styled.p`
  font-size: 16px;
  color: #667085; /* 少し柔らかい色に */
  margin-top: 8px;
`;

// 各入力セクションを囲むコンポーネント
const FormSection = styled.section`
  margin-bottom: 40px;
`;

// 各セクションのタイトル（STEP 1, STEP 2...）
const SectionTitle = styled.h2`
  font-size: 20px;
  font-weight: 700;
  color: #333d4b;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 2px solid #f0f2f5; /* 下線で区切りを明確に */
  display: flex;
  align-items: center;
  
  /* アイコン用のスタイル */
  span {
    margin-right: 12px;
    font-size: 24px;
  }
`;

const LoadingText = styled.p`
  text-align: center;
  color: #888;
  padding: 20px;
`;

// --- 擬似的なAPI（前回と同様） ---
const fetchAreasForDestination = async (destination) => {
  // （この部分は変更なし）
  console.log(`「${destination}」のエリアを検索中...`);
  return new Promise(resolve => {
    setTimeout(() => {
      const areaDatabase = {
        "京都": ["祇園・清水寺", "嵐山・嵯峨野", "金閣寺周辺", "京都駅周辺"],
        "箱根": ["箱根湯本", "強羅", "仙石原", "芦ノ湖・元箱根"],
        "沖縄": ["那覇市内", "恩納村", "美ら海水族館周辺", "石垣島"],
        "札幌": ["大通公園", "すすきの", "札幌駅周辺", "定山渓温泉"],
      };
      resolve(areaDatabase[destination] || []);
    }, 1000);
  });
};

// --- メインコンポーネント ---

export default function PlanWizard({ onBack }) {
  const { plan, setPlan } = usePlan();
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

  return (
    <WizardContainer>
      <Header>
        <Title>AI Travel Planner</Title>
        <SubTitle>いくつかの情報を入力するだけで、あなただけの旅行プランを作成します。</SubTitle>
      </Header>

      {/* --- STEP 1: 場所の選択 --- */}
      <FormSection>
        <SectionTitle>
          <span role="img" aria-label="map-icon">🗺️</span>
          どこへ行きますか？
        </SectionTitle>
        <LocationInput
          label="出発地"
          icon="🛫"
          type="text"
          value={plan.origin}
          onChange={e => setPlan(p => ({ ...p, origin: e.target.value }))}
          placeholder="例: 東京駅"
        />
        <LocationInput
          label="目的地 (都道府県・市など)"
          icon="📍"
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

      {/* --- STEP 2: 日程と移動手段 --- */}
      <FormSection>
        <SectionTitle>
          <span role="img" aria-label="calendar-icon">🗓️</span>
          いつ、どうやって行きますか？
        </SectionTitle>
        <CalendarRangePicker value={plan} setValue={setPlan} />
        <div style={{marginTop: "24px"}}>
            <TransportSelector />
        </div>
      </FormSection>

      {/* --- STEP 3: 予算 --- */}
      <FormSection>
        <SectionTitle>
          <span role="img" aria-label="money-icon">💰</span>
          予算はどのくらいですか？
        </SectionTitle>
        <BudgetInput value={plan} setValue={setPlan} />
      </FormSection>

      {/* --- ナビゲーションボタン --- */}
      <StepButtons onBack={onBack} />
    </WizardContainer>
  );
}