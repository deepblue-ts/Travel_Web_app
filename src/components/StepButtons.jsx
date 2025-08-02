// src/components/StepButtons.jsx

import React from 'react';
import styled from 'styled-components';

// ボタンのスタイル定義
const ButtonContainer = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 36px;
`;

const BaseButton = styled.button`
  border: none;
  border-radius: 8px;
  font-size: 16px;
  padding: 12px 24px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }
`;

const BackButton = styled(BaseButton)`
  background: #f0f2f5;
  color: #495057;

  &:hover {
    background: #e9ecef;
  }
`;

const SubmitButton = styled(BaseButton)`
  background: #00c0b8;
  color: #fff;

  &:hover {
    background: #00a39e;
  }
`;


export default function StepButtons({ onBack, onSubmit }) {
  return (
    <ButtonContainer>
      {/* 戻るボタン */}
      <BackButton onClick={onBack}>
        ◀ 戻る
      </BackButton>

      {/* 
        onSubmitプロパティが渡された場合のみ、プラン作成ボタンを表示します。
        これにより、このコンポーネントが他の場面でも再利用しやすくなります。
      */}
      {onSubmit && (
         <SubmitButton onClick={onSubmit}>
           プランを作成する 🚀
         </SubmitButton>
      )}
    </ButtonContainer>
  );
}