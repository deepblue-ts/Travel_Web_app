// src/components/TransportSelector.jsx

import React from "react";
import styled from "styled-components";
import { usePlan } from "../contexts/PlanContext";
import { Train, Car } from "lucide-react";

// --- スタイル定義 (ここから) ---

const colors = {
  primary: '#00A8A0',
  text: '#2D3748',
  textSecondary: '#667085',
  border: '#E2E8F0',
  white: '#FFFFFF',
  primaryLight: '#E6FFFA'
};

const Wrapper = styled.div``;

const Label = styled.label`
  font-weight: 600;
  font-size: 16px;
  color: ${colors.text};
  margin-bottom: 12px;
  display: block;
`;

const OptionsContainer = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
`;

const OptionButton = styled.button`
  display: flex;
  /* flex-direction はデフォルトの 'row' (横並び) のため、記述は不要です */
  align-items: center;      /* ★ 上下中央揃え */
  justify-content: center;  /* ★ 左右中央揃え */
  gap: 10px;                /* ★ アイコンとテキストの間隔を指定 */
  padding: 16px; /* パディングを少し調整 */
  border-radius: 12px;
  border: 1px solid ${props => (props.$active ? colors.primary : colors.border)};
  background-color: ${props => (props.$active ? colors.primaryLight : colors.white)};
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  
  svg {
    color: ${props => (props.$active ? colors.primary : colors.textSecondary)};
    /* margin-bottom は不要なため削除 */
    transition: color 0.2s;
    flex-shrink: 0; /* アイコンが縮まないようにする */
  }

  &:hover {
    border-color: ${colors.primary};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 2px ${colors.primary}40;
  }
`;

const ButtonLabel = styled.span`
  font-size: 15px;
  font-weight: 600;
  color: ${props => (props.$active ? colors.primary : colors.text)};
  transition: color 0.2s;
`;

// --- スタイル定義 (ここまで) ---

export default function TransportSelector() {
  const { plan, setPlan } = usePlan();

  const transportOptions = [
    { value: "public", label: "公共交通機関", icon: <Train size={24} /> },
    { value: "car", label: "自動車", icon: <Car size={24} /> }
  ];

  return (
    <Wrapper>
      <Label>主な移動手段</Label>
      <OptionsContainer>
        {transportOptions.map(option => (
          <OptionButton
            key={option.value}
            $active={plan.transport === option.value}
            onClick={() => setPlan(p => ({ ...p, transport: option.value }))}
          >
            {option.icon}
            <ButtonLabel $active={plan.transport === option.value}>
              {option.label}
            </ButtonLabel>
          </OptionButton>
        ))}
      </OptionsContainer>
    </Wrapper>
  );
}