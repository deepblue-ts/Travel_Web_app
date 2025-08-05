// src/components/BudgetInput.jsx

import React from 'react';
import styled from 'styled-components';

// --- スタイル定義 ---
const colors = {
  primary: '#00A8A0',
  text: '#2D3748',
  border: '#E2E8F0',
};

const Wrapper = styled.div``;

const BudgetContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
`;

const InputGroup = styled.div`
  position: relative;
  flex-shrink: 0;

  span {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #a0aec0;
    font-weight: 500;
  }
`;

const StyledInput = styled.input`
  font-size: 16px;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  padding: 10px 32px 10px 16px;
  width: 150px;
  font-weight: 600;
  text-align: right;

  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 2px ${colors.primary}40;
  }
`;

const RangeSlider = styled.input`
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  outline: none;

  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 20px;
    height: 20px;
    background: ${colors.primary};
    cursor: pointer;
    border-radius: 50%;
  }

  &::-moz-range-thumb {
    width: 20px;
    height: 20px;
    background: ${colors.primary};
    cursor: pointer;
    border-radius: 50%;
  }
`;


export default function BudgetInput({ value, setValue }) {
  
  const handleBudgetChange = (e) => {
    // 入力値が空でも0として扱えるようにする
    const budgetValue = parseInt(e.target.value, 10) || 0;
    setValue(p => ({ ...p, budget: budgetValue }));
  };

  return (
    <Wrapper>
      <BudgetContainer>
        <InputGroup>
          {/* ★★★ エラー修正の核心部分 ★★★ */}
          {/* value.budgetがundefinedの場合に備えて `|| ''` を追加 */}
          <StyledInput 
            type="number"
            step="1000"
            value={value.budget || ''} 
            onChange={handleBudgetChange}
          />
          <span>円</span>
        </InputGroup>
        <RangeSlider 
          type="range"
          min="10000"
          max="200000"
          step="5000"
          value={value.budget || 0}
          onChange={handleBudgetChange}
        />
      </BudgetContainer>
    </Wrapper>
  );
}