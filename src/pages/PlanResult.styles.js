// src\pages\PlanResult.styles.js

import styled, { keyframes } from 'styled-components';

// --- アニメーション定義 ---
const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;


// --- 全体を囲むラッパー ---
export const Wrapper = styled.div`
  max-width: 800px;
  margin: 40px auto;
  padding: 0 20px;
  font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', Meiryo, sans-serif;
`;


// --- ページ上部のヘッダー ---
export const Header = styled.header`
  text-align: center;
  margin-bottom: 40px;
`;

export const Title = styled.h1`
  font-size: 2.5rem;
  color: #101828;
  margin-bottom: 8px;
`;

export const Introduction = styled.p`
  font-size: 1.1rem;
  color: #667085;
  max-width: 600px;
  margin: 0 auto;
`;


// --- 日程カード全体をまとめるコンテナ ---
export const ItineraryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px; /* 各DayCardの間のスペース */
`;


// --- 各日のプランを表示するカード ---
export const DayCard = styled.div`
  background: #ffffff;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  border: 1px solid #EAECF0;
  animation: ${fadeIn} 0.6s ease-out forwards;
  opacity: 0;
  animation-delay: ${props => props.delay || '0s'};
`;


// --- 日付、Dayラベルのヘッダー部分 ---
export const DayHeader = styled.div`
  display: flex;
  align-items: center; /* DayLabelと日付を垂直方向の中央に揃える */
  gap: 16px; /* DayLabelと日付の間のスペースを確保 */
  margin-bottom: 24px;
`;

// --- "Day 1" の緑色のラベル ---
export const DayLabel = styled.div`
  background-color: #00A699;
  color: white;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 1.3rem;
  font-weight: 700;
  white-space: nowrap;
`;

// --- 日付 ---
export const DayDate = styled.div`
  display: flex;
  align-items: center;
  color: #667085;
  font-size: 1.3rem;
  gap: 6px;
`;


// --- タイムラインのコンテナ ---
export const Timeline = styled.div`
  border-left: 2px solid #EAECF0;
  padding-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
`;


// --- スケジュール内の各項目 ---
export const ScheduleItem = styled.div`
  position: relative;
  padding-bottom: 8px;

  /* タイムライン上の丸い点 */
  &::before {
    content: '';
    position: absolute;
    left: -34px; /* (padding-left + 線の太さ +点の半径)で調整 */
    top: 5px;
    width: 12px;
    height: 12px;
    background-color: #00A699;
    border-radius: 50%;
    border: 2px solid #FFFFFF;
  }
`;


// --- 時刻・アクティビティ名・詳細 ---
export const Time = styled.div`
  font-weight: 600;
  font-size: 1rem;
  color: #101828;
`;

export const ActivityName = styled.h4`
  font-size: 1.1rem;
  font-weight: 600;
  color: #344054;
  margin: 4px 0;
`;

export const Description = styled.p`
  font-size: 0.95rem;
  color: #667085;
  margin: 4px 0;
  line-height: 1.6;
`;


// --- 価格やリンクのメタ情報 ---
export const MetaInfo = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
`;

export const MetaItem = styled.div`
  display: flex;
  align-items: center;
  color: #475467;
  font-size: 0.9rem;
  gap: 6px;

  a {
    color: #00A699;
    text-decoration: none;
    font-weight: 500;
    &:hover {
      text-decoration: underline;
    }
  }
`;


// --- 結びの言葉 ---
export const Conclusion = styled.p`
  text-align: center;
  font-size: 1.1rem;
  color: #475467;
  margin: 40px 0;
  line-height: 1.8;
`;


// --- 戻るボタン ---
export const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background-color: #FFFFFF;
  color: #344054;
  border: 1px solid #D0D5DD;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s, box-shadow 0.2s;

  &:hover {
    background-color: #F9FAFB;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  }
`;