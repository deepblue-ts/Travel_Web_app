import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { PlusCircle } from 'lucide-react';

// --- スタイル定義 ---
const colors = {
  primary: '#00A8A0',
  text: '#2D3748',
  textLight: '#667085',
  textSubtle: '#A0AEC0',
  border: '#E2E8F0',
  backgroundLight: '#F7FAFC',
  primaryLight: '#E6FFFA',
  white: '#FFFFFF',
};

// ... AreaContainer, Label, TagContainerのスタイルは変更なし ...
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


// ★★★ ここからが改善の核心部分 ★★★
const AreaTag = styled.button`
  text-align: left;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 14px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  
  /* 最小の高さを指定して、全タグの高さを揃える */
  min-height: 62px;
  
  /* propsとして渡される $hasSpots の値に応じて、垂直方向の配置を切り替える */
  justify-content: ${props => props.$hasSpots ? 'flex-start' : 'center'};

  background-color: ${props => props.$isSelected ? colors.primaryLight : colors.white};
  color: ${props => props.$isSelected ? colors.primary : colors.text};
  border: 1px solid ${props => props.$isSelected ? colors.primary : colors.border};

  &:hover {
    border-color: ${colors.primary};
  }
`;
// ★★★ ここまでが改善の核心部分 ★★★


const SpotInfo = styled.span`
  font-size: 12px;
  font-weight: 400;
  color: ${props => props.$isSelected ? colors.primary : colors.textSubtle};
  margin-top: 2px;
`;

// ... PlaceholderText, CustomInputSection, Input, AddButton のスタイルは変更なし ...
const PlaceholderText = styled.p`
  color: ${colors.textLight};
  font-size: 14px;
  margin: 0;
`;

const CustomInputSection = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid ${colors.border};
`;

const Input = styled.input`
  flex-grow: 1;
  padding: 8px 12px;
  border: 1px solid ${colors.border};
  border-radius: 6px;
  font-size: 14px;
  color: ${colors.text};
  &:focus {
    outline: none;
    border-color: ${colors.primary};
    box-shadow: 0 0 0 2px ${colors.primaryLight};
  }
`;

const AddButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  background-color: ${colors.primary};
  color: white;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: #008f88;
  }
  
  &:disabled {
    background-color: #a0aec0;
    cursor: not-allowed;
  }
`;

// --- メインコンポーネント ---
export default function AreaSelector({ areaOptions, selectedAreas, onAreaChange }) {
  const [customArea, setCustomArea] = useState('');
  const currentSelectedAreas = selectedAreas || [];

  const displayOptions = useMemo(() => {
    const options = [...(areaOptions || [])];
    const optionNames = options.map(opt => opt.name);

    currentSelectedAreas.forEach(areaName => {
      if (!optionNames.includes(areaName)) {
        options.push({ name: areaName, spots: [] });
      }
    });
    
    return options;
  }, [areaOptions, currentSelectedAreas]);

  const handleToggleArea = (areaName) => {
    const isSelected = currentSelectedAreas.includes(areaName);
    const newAreas = isSelected
      ? currentSelectedAreas.filter(a => a !== areaName)
      : [...currentSelectedAreas, areaName];
    onAreaChange(newAreas);
  };

  const handleAddCustomArea = () => {
    if (customArea && !currentSelectedAreas.includes(customArea)) {
      onAreaChange([...currentSelectedAreas, customArea]);
      setCustomArea('');
    }
  };
  
  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCustomArea();
    }
  };

  return (
    <AreaContainer>
      <Label>気になるエリアを選択（複数選択可）</Label>
      {displayOptions.length === 0 ? (
        <PlaceholderText>目的地を入力するとエリア候補が表示されます。</PlaceholderText>
      ) : (
        <TagContainer>
          {displayOptions.map(option => {
            // ★ spots（観光地情報）を持っているかどうかを判定
            const hasSpots = option.spots && option.spots.length > 0;
            return (
              <AreaTag
                key={option.name}
                $isSelected={currentSelectedAreas.includes(option.name)}
                onClick={() => handleToggleArea(option.name)}
                // ★ 判定結果をpropsとしてAreaTagコンポーネントに渡す
                $hasSpots={hasSpots}
              >
                {option.name}
                {/* ★ hasSpotsがtrueの場合のみSpotInfoを表示 */}
                {hasSpots && (
                  <SpotInfo $isSelected={currentSelectedAreas.includes(option.name)}>
                    例: {option.spots.join('、')}
                  </SpotInfo>
                )}
              </AreaTag>
            );
          })}
        </TagContainer>
      )}

      <CustomInputSection>
        <Input
          type="text"
          value={customArea}
          onChange={e => setCustomArea(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="その他のエリアを自由入力..."
        />
        <AddButton onClick={handleAddCustomArea} disabled={!customArea}>
          <PlusCircle size={16} />
          追加
        </AddButton>
      </CustomInputSection>
    </AreaContainer>
  );
}