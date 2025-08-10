// src/pages/GeneratingPlanPage.jsx
import React from 'react';
import styled, { keyframes } from 'styled-components';
import { usePlan } from '../contexts/PlanContext';

// --- スタイル定義 ---
const rotate = keyframes`
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
`;
const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  background-color: #f8f9fa;
  color: #2D3748;
`;
const Spinner = styled.div`
  width: 60px;
  height: 60px;
  border: 5px solid #E2E8F0;
  border-top-color: #00A8A0;
  border-radius: 50%;
  animation: ${rotate} 1s linear infinite;
`;
const Message = styled.p`
  margin-top: 24px;
  font-size: 20px;
  font-weight: 600;
  max-width: 80%;
  text-align: center;
`;
const ProgressBar = styled.div`
  width: 300px;
  height: 8px;
  background-color: #E2E8F0;
  border-radius: 4px;
  margin-top: 16px;
  overflow: hidden;
`;
const Progress = styled.div`
  width: ${({ $progress = 0 }) =>
    Math.max(0, Math.min(100, Number($progress) || 0))}%;
  height: 100%;
  background-color: #00A8A0;
  transition: width 0.5s ease;
`;

// --- メインコンポーネント ---
export default function GeneratingPlanPage() {
  const { loadingStatus } = usePlan();
  const pct = Math.max(
    0,
    Math.min(100, Number(loadingStatus?.progress) || 0)
  );

  return (
    <Container>
      <Spinner />
      <Message>{loadingStatus?.message || '準備中...'}</Message>
      <ProgressBar>
        <Progress
          $progress={pct}                 // ← transient prop
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </ProgressBar>
    </Container>
  );
}
