// src/components/LocationInput.jsx

import React from 'react';
import styled from 'styled-components';

// --- スタイル定義 (ここから) ---

const colors = {
  primary: '#00A8A0',
  textSecondary: '#667085',
  border: '#E2E8F0',
  borderFocus: '#00A8A0',
};

const InputWrapper = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  font-weight: 600;
  display: block;
  margin-bottom: 8px;
  font-size: 16px;
`;

const InputContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

// ★ 絵文字ではなく、アイコンコンポーネントを配置するためのスタイルに変更
const IconContainer = styled.div`
  position: absolute;
  left: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${colors.textSecondary};
`;

const StyledInput = styled.input`
  font-size: 16px;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  /* ★ アイコンコンポーネント用にパディングを調整 */
  padding: 12px 16px 12px 48px; 
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;

  &::placeholder {
    color: #A0AEC0;
  }

  /* ★ フォーカス時のスタイルをより洗練させる */
  &:focus {
    outline: none;
    border-color: ${colors.borderFocus};
    box-shadow: 0 0 0 2px ${colors.primary}40;
  }
`;

// --- スタイル定義 (ここまで) ---

export default function LocationInput({ label, icon, value, ...props }) {
  return (
    <InputWrapper>
      <Label>{label}</Label>
      <InputContainer>
        {icon && <IconContainer>{icon}</IconContainer>}
        {/* valueがnullやundefinedの場合に備えて `|| ''` を追加 */}
        <StyledInput value={value || ''} {...props} />
      </InputContainer>
    </InputWrapper>
  );
}