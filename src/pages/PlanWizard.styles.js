// src/pages/PlanWizard.styles.js

import styled, { keyframes } from "styled-components";

// --- カラーパレットを定義 ---
const colors = {
  primary: '#00A8A0', // 少し落ち着いたメインカラー
  primaryHover: '#008F88',
  text: '#2D3748',          // メインテキスト (濃いグレー)
  textSecondary: '#667085', // サブテキスト (薄いグレー)
  border: '#E2E8F0',         // 境界線 (非常に薄いグレー)
  background: '#F8F9FA',     // 背景色
  white: '#FFFFFF'
};

export const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
`;

export const WizardContainer = styled.div`
  max-width: 600px;
  margin: 60px auto;
  background: ${colors.white};
  padding: 40px 48px;
  border-radius: 24px;
  /* 影をより柔らかく */
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  animation: ${fadeIn} 0.6s ease-out;
`;

export const Header = styled.header`
  text-align: center;
  margin-bottom: 48px;
`;

export const Title = styled.h1`
  font-size: 38px; /* 少しサイズを調整 */
  font-weight: 700; /* 太すぎないように調整 */
  color: ${colors.primary};
  margin: 0;
  line-height: 1.2;
`;

export const SubTitle = styled.p`
  font-size: 16px;
  color: ${colors.textSecondary};
  margin-top: 8px;
`;

export const FormSection = styled.section`
  margin-bottom: 40px;
`;

export const SectionTitle = styled.h2`
  font-size: 20px;
  font-weight: 600; /* 少し細くして上品に */
  color: ${colors.text};
  margin-bottom: 20px; /* 余白を調整 */
  padding-bottom: 12px;
  border-bottom: 1px solid ${colors.border}; /* 境界線を細く、薄く */
  display: flex;
  align-items: center; /* アイコンとテキストを中央揃えに */
  
  /* アイコン自体のスタイル */
  svg {
    margin-right: 12px;
    color: ${colors.primary};
  }
`;

export const LoadingText = styled.p`
  text-align: center;
  color: ${colors.textSecondary};
  padding: 20px;
`;