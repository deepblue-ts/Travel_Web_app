// src/pages/PlanResult.jsx

import React from "react";
import styled, { keyframes } from "styled-components";
import { usePlan } from "../contexts/PlanContext";

// --- スタイル定義 ---
const spin = keyframes`
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
`;
const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;
const LoadingContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  text-align: center;
  color: #00c0b8;
`;
const Spinner = styled.div`
  border: 4px solid rgba(0, 192, 184, 0.2);
  border-top: 4px solid #00c0b8;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: ${spin} 1s linear infinite;
`;
const LoadingMessage = styled.p`
  margin-top: 24px;
  font-size: 18px;
  font-weight: 600;
`;
const ResultContainer = styled.div`
  max-width: 750px;
  margin: 60px auto;
  padding: 40px 48px;
  background: #fff;
  border-radius: 24px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  animation: ${fadeIn} 0.6s ease-out;
`;
const Header = styled.header`
  text-align: center;
  margin-bottom: 32px;
  border-bottom: 2px solid #f0f2f5;
  padding-bottom: 24px;
`;
const Title = styled.h1`
  font-size: 36px;
  font-weight: 800;
  color: #00c0b8;
  margin: 0;
`;
const SubTitle = styled.p`
  font-size: 16px;
  color: #667085;
  margin-top: 8px;
`;
const PlanContent = styled.div`
  white-space: pre-wrap;
  line-height: 1.8;
  color: #333d4b;
  font-size: 16px;
  background: #f8f9fa;
  padding: 24px;
  border-radius: 12px;
`;
const ErrorMessage = styled(PlanContent)`
  color: #d93025;
  background: #fbeae9;
`;
const BackButton = styled.button`
  background: #00c0b8;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  padding: 12px 24px;
  font-weight: 600;
  cursor: pointer;
  display: block;
  margin: 40px auto 0;
  transition: background 0.2s;
  &:hover { background: #00a39e; }
`;

// --- メインコンポーネント ---
// ★ コンポーネント名を PlanResult に変更
export default function PlanResult({ onBackToTop }) {
  const { planResult, isLoading, error, plan } = usePlan();

  if (isLoading) {
    return (
      <LoadingContainer>
        <Spinner />
        <LoadingMessage>AIが最高の旅行プランを作成中です...</LoadingMessage>
      </LoadingContainer>
    );
  }

  return (
    <ResultContainer>
      <Header>
        <Title>あなただけの旅行プラン</Title>
        <SubTitle>{plan.destination}への旅行</SubTitle>
      </Header>

      {error ? (
        <ErrorMessage>{error}</ErrorMessage>
      ) : (
        <PlanContent>{planResult || "プランの取得に失敗しました。"}</PlanContent>
      )}

      <BackButton onClick={onBackToTop}>最初のページに戻る</BackButton>
    </ResultContainer>
  );
}