// components/AreaSelector.jsx

import React from 'react';
import styled from 'styled-components';

const AreaContainer = styled.div`
  padding: 16px;
  border: 1px solid #eee;
  border-radius: 8px;
  margin-top: 10px;
`;

const Label = styled.p`
  font-weight: 600;
  margin-top: 0;
  margin-bottom: 12px;
`;

const TagContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
`;

const AreaTag = styled.button`
  font-size: 15px;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  
  /* props.isSelectedに応じてスタイルを変更 */
  background-color: ${props => props.isSelected ? '#00C0B8' : '#f0f0f0'};
  color: ${props => props.isSelected ? '#fff' : '#333'};
  border: 1px solid ${props => props.isSelected ? '#00C0B8' : '#ddd'};

  &:hover {
    opacity: 0.8;
  }
`;

// propsでエリア候補、選択済みエリア、変更用関数を受け取る
export default function AreaSelector({ areaOptions, selectedAreas, onAreaChange }) {
  const handleToggleArea = (areaName) => {
    // すでに選択されているか？
    if (selectedAreas.includes(areaName)) {
      // 選択されていれば、配列から除外する
      onAreaChange(selectedAreas.filter(a => a !== areaName));
    } else {
      // 選択されていなければ、配列に追加する
      onAreaChange([...selectedAreas, areaName]);
    }
  };

  return (
    <AreaContainer>
      <Label>気になるエリアを選択してください（複数選択可）</Label>
      {areaOptions.length === 0 ? (
        <p style={{color: "#888"}}>目的地を入力するとエリア候補が表示されます。</p>
      ) : (
        <TagContainer>
          {areaOptions.map(area => (
            <AreaTag
              key={area}
              isSelected={selectedAreas.includes(area)}
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