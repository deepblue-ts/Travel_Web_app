// src/components/StepButtons.jsx

import React from 'react';
import styled from 'styled-components';
// ★ 戻るアイコンと、魔法の杖（作成）アイコンをインポート
import { ArrowLeft, Wand2 } from 'lucide-react';

// --- スタイル定義 (ここから) ---

const colors = {
  primary: '#00A8A0',
  primaryHover: '#008F88',
  text: '#2D3748',
  border: '#E2E8F0',
  borderHover: '#DDE2E8',
  white: '#FFFFFF',
};

// ★ 上部に区切り線を追加して、セクションの終わりを明確にする
const ButtonContainer = styled.div`
  display: flex;
  justify-content: space-between;
  margin-top: 48px;
  border-top: 1px solid ${colors.border};
  padding-top: 24px;
`;

// ★ アイコンとテキストをきれいに並べるためにflexbox関連のスタイルを追加
const BaseButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px; /* アイコンとテキストの間隔 */
  border: none;
  border-radius: 8px;
  font-size: 16px;
  padding: 12px 24px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); /* 影をより柔らかく */
  }

  svg {
    stroke-width: 2.5; /* アイコンの線を少し太くして見やすくする */
  }
`;

// ★ BackButtonは「目立たないが、そこにある」デザインに
const BackButton = styled(BaseButton)`
  background-color: ${colors.white};
  color: ${colors.text};
  border: 1px solid ${colors.border};

  &:hover {
    background-color: #F7FAFC; /* ほんのり色を変える */
    border-color: ${colors.borderHover};
  }
`;

// ★ SubmitButtonはメインのアクションであることが明確なデザインに
const SubmitButton = styled(BaseButton)`
  background: ${colors.primary};
  color: ${colors.white};

  &:hover {
    background: ${colors.primaryHover};
  }
`;

// --- スタイル定義 (ここまで) ---

export default function StepButtons({ onBack, onSubmit }) {
  return (
    <ButtonContainer>
      {/* 戻るボタン */}
      <BackButton onClick={onBack}>
        {/* ★ lucide-reactのアイコンを使用 */}
        <ArrowLeft size={18} />
        戻る
      </BackButton>

      {/* プラン作成ボタン */}
      {onSubmit && (
         <SubmitButton onClick={onSubmit}>
           プランを作成する
           {/* ★ lucide-reactのアイコンを使用 */}
           <Wand2 size={18} />
         </SubmitButton>
      )}
    </ButtonContainer>
  );
}