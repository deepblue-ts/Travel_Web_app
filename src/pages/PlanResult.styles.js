// src/pages/PlanResult.styles.js

import styled, { keyframes } from "styled-components";

// --- カラーパレット ---
const colors = {
  primary: '#00A8A0',
  text: '#2D3748',
  textSecondary: '#667085',
  border: '#E2E8F0',
  background: '#F7FAFC',
  white: '#FFFFFF',
};

// --- アニメーション ---
export const fadeIn = keyframes`
  from { opacity: 0; transform: translateY(20px); } 
  to { opacity: 1; transform: translateY(0); }
`;

// --- コンポーネントスタイル ---
export const Wrapper = styled.div`
  max-width: 800px;
  margin: 40px auto;
  padding: 24px;
  font-family: 'Noto Sans JP', sans-serif;
  animation: ${fadeIn} 0.5s ease-out;
`;

export const Header = styled.header`
  text-align: center;
  margin-bottom: 48px;
`;

export const Title = styled.h1`
  font-size: 38px;
  font-weight: 800;
  color: ${colors.primary};
  margin: 0;
  line-height: 1.3;
`;

export const Introduction = styled.p`
  font-size: 18px;
  color: ${colors.textSecondary};
  margin-top: 16px;
  line-height: 1.8;
`;

export const ItineraryContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 48px;
`;

export const DayCard = styled.div`
  background: ${colors.white};
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);
  padding: 24px 32px;
  opacity: 0; /* アニメーションの初期状態 */
  animation: ${fadeIn} 0.6s ease-out forwards;
  animation-delay: ${props => props.delay || '0s'};
`;

export const DayHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  border-bottom: 1px solid ${colors.border};
  padding-bottom: 16px;
  margin-bottom: 24px;
`;

export const DayLabel = styled.span`
  background-color: ${colors.primary};
  color: ${colors.white};
  font-weight: 700;
  font-size: 20px;
  padding: 8px 16px;
  border-radius: 8px;
  line-height: 1;
`;

export const DayTheme = styled.h2`
  font-size: 24px;
  color: ${colors.text};
  margin: 0;
  font-weight: 700;
`;

export const Timeline = styled.div`
  position: relative;
  padding-left: 30px;
  border-left: 2px solid ${colors.border};
`;

export const ScheduleItem = styled.div`
  position: relative;
  padding-bottom: 32px;
  
  &:last-child {
    padding-bottom: 0;
  }

  /* タイムラインの丸 */
  &::before {
    content: '';
    position: absolute;
    left: -39px;
    top: 5px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: ${colors.background};
    border: 3px solid ${colors.primary};
  }
`;

export const Time = styled.div`
  font-weight: 700;
  color: ${colors.primary};
  margin-bottom: 8px;
`;

export const ActivityName = styled.h3`
  font-size: 18px;
  color: ${colors.text};
  margin: 0 0 8px 0;
  font-weight: 600;
`;

export const Description = styled.p`
  font-size: 15px;
  color: ${colors.textSecondary};
  line-height: 1.7;
  margin: 0 0 16px 0;
`;

export const MetaInfo = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  font-size: 14px;
  color: #4A5568;
`;

export const MetaItem = styled.span`
  display: flex;
  align-items: center;
  gap: 6px;

  a {
    color: inherit;
    text-decoration: none;
    font-weight: 500;
    &:hover {
      text-decoration: underline;
      color: ${colors.primary};
    }
  }
`;

export const Conclusion = styled(Introduction)`
  text-align: center;
  margin-top: 48px;
  font-weight: 600;
`;

export const BackButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 40px auto 0;
  border: 1px solid ${colors.border};
  background-color: ${colors.white};
  color: ${colors.text};
  border-radius: 8px;
  font-size: 16px;
  padding: 12px 24px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
    border-color: #ccc;
  }
`;