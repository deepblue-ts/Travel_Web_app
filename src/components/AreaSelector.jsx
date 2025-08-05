// src/components/AreaSelector.jsx

import React from 'react';
import styled from 'styled-components';

// --- スタイル定義 (デザイン統一のため) ---
const colors = {
  primary: '#00A8A0',
  text: '#2D3748',
  textLight: '#667085',
  border: '#E2E8F0',
  backgroundLight: '#F7FAFC',
  primaryLight: '#E6FFFA'
};

const AreaContainer = styled.div`
  padding: 16px;
  border: 1px solid ${colors.border};
  border-radius: 8px;
  margin-top: 20px;
  background-color: ${colors.backgroundLight};
`;

const Label = styled.p`
  font-weight: 600;
  font-size: 16px;
  color: ${colors.text};
  margin-top: 0;
  margin-bottom: 12px;
`;

const TagContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const AreaTag = styled.button`
  font-size: 14px; /* 少し小さくして上品に */
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  
  /* $isSelectedに応じてスタイルを変更 */
  background-color: ${props => props.$isSelected ? colors.primaryLight : colors.white};
  color: ${props => props.$isSelected ? colors.primary : colors.text};
  border: 1px solid ${props => props.$isSelected ? colors.primary : colors.border};

  &:hover {
    border-color: ${colors.primary};
  }
`;

const PlaceholderText = styled.p`
  color: ${colors.textLight};
  font-size: 14px;
  margin: 0;
`;

// --- メインコンポーネント ---
export default function AreaSelector({ areaOptions, selectedAreas, onAreaChange }) {
  
  // ★★★ エラー修正の核心部分 ★★★
  // selectedAreasがundefinedでもクラッシュしないように、デフォルト値として空配列[]を指定
  const currentSelectedAreas = selectedAreas || [];

  const handleToggleArea = (areaName) => {
    // ★ 安全な `currentSelectedAreas` を使用
    const isSelected = currentSelectedAreas.includes(areaName);
    let newAreas;

    if (isSelected) {
      newAreas = currentSelectedAreas.filter(a => a !== areaName);
    } else {
      newAreas = [...currentSelectedAreas, areaName];
    }
    onAreaChange(newAreas);
  };

  // areaOptionsも念のため保護する
  const currentAreaOptions = areaOptions || [];

  return (
    <AreaContainer>
      <Label>気になるエリアを選択（複数選択可）</Label>
      {currentAreaOptions.length === 0 ? (
        <PlaceholderText>目的地を入力するとエリア候補が表示されます。</PlaceholderText>
      ) : (
        <TagContainer>
          {currentAreaOptions.map(area => (
            <AreaTag
              key={area}
              // ★ 安全な `currentSelectedAreas` を使用
              $isSelected={currentSelectedAreas.includes(area)}
              onClick={() => handleToggleArea(area)}
            >
              {area}
            </AreaTag>
          ))}
        </TagContainer>
      )}
    </AreaContainer>
  );
}