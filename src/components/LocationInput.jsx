// components/LocationInput.jsx

import React from 'react';
import styled from 'styled-components';

const InputWrapper = styled.div`
  margin-bottom: 20px;
`;

const Label = styled.label`
  font-weight: 600;
  display: block;
  margin-bottom: 8px;
`;

const InputContainer = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

const Icon = styled.span`
  position: absolute;
  left: 12px;
  font-size: 20px;
  color: #888;
`;

const StyledInput = styled.input`
  font-size: 18px;
  border: 1px solid #ccc;
  border-radius: 7px;
  padding: 12px 12px 12px 40px; /* アイコン分のスペースを確保 */
  width: 100%;
  box-sizing: border-box;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: #00C0B8;
  }
`;

export default function LocationInput({ label, icon, ...props }) {
  return (
    <InputWrapper>
      <Label>{label}</Label>
      <InputContainer>
        <Icon>{icon}</Icon>
        <StyledInput {...props} />
      </InputContainer>
    </InputWrapper>
  );
}