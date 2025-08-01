import React from "react";
import styled from "styled-components";
import { usePlan } from "../contexts/PlanContext";

// --- スタイル定義 (ここから) ---
// styled-components を使って、このコンポーネント内で使う部品を定義します

const Wrapper = styled.div`
  /* コンポーネント全体を囲む */
`;

const Label = styled.label`
  font-weight: 600;
  margin-bottom: 12px;
  display: block;
`;

// ↓↓↓【エラーの原因】この定義がファイルに存在しないか、間違っています ↓↓↓
const OptionsContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
`;

const OptionButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 16px;
  border-radius: 12px;
  border: 2px solid;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  border-color: ${props => (props.active ? "#00C0B8" : "#ddd")};
  background-color: ${props => (props.active ? "#eaf4ff" : "#fff")};

  &:hover {
    border-color: ${props => (props.active ? "#00C0B8" : "#bbb")};
    background-color: ${props => (props.active ? "#dcecff" : "#f7f7f7")};
  }
`;

const Icon = styled.span`
  font-size: 32px;
  margin-bottom: 8px;
`;

const ButtonLabel = styled.span`
  font-size: 16px;
  font-weight: 600;
  color: ${props => (props.active ? "#00C0B8" : "#333")};
`;

// --- スタイル定義 (ここまで) ---


export default function TransportSelector() {
  const { plan, setPlan } = usePlan();

  const transportOptions = [
    { value: "public", label: "公共交通機関＋徒歩", icon: "🚆" },
    { value: "car", label: "車", icon: "🚗" }
  ];

  return (
    <Wrapper>
      <Label>主な移動手段</Label>
      {/* ↓↓↓【エラーの発生場所】ここで定義された OptionsContainer を使います ↓↓↓ */}
      <OptionsContainer>
        {transportOptions.map(option => (
          <OptionButton
            key={option.value}
            active={plan.transport === option.value}
            onClick={() => setPlan(p => ({ ...p, transport: option.value }))}
          >
            <Icon>{option.icon}</Icon>
            <ButtonLabel active={plan.transport === option.value}>
              {option.label}
            </ButtonLabel>
          </OptionButton>
        ))}
      </OptionsContainer>
    </Wrapper>
  );
}