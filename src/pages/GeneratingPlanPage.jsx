// src/pages/GeneratingPlanPage.jsx
import React, { useEffect, useMemo, useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { usePlan } from '../contexts/PlanContext';
import { getPlanState } from '../api/llmService';
import { CheckCircle2, Loader2, MapPin, Utensils, Hotel, Ticket } from 'lucide-react';

// ── styles
const spin = keyframes`from{transform:rotate(0)}to{transform:rotate(360deg)}`;

const Page = styled.div`
  display:grid; grid-template-columns: 4fr 6fr; gap:24px;
  min-height: 100vh; padding: 32px 24px; background:#f8f9fa;
  @media (max-width: 1024px){ grid-template-columns: 1fr; }
`;
const Left = styled.div``;
const Right = styled.div``;

const Card = styled.div`
  background:#fff; border:1px solid #EAECF0; border-radius:16px; padding:16px 18px;
  box-shadow: 0 10px 24px rgba(16,24,40,.06); margin-bottom:16px;
`;

const Row = styled.div`display:flex; align-items:center; gap:12px;`;
const Title = styled.h2`margin:0 0 8px; font-size:20px;`;

const Spinner = styled.div`
  width:60px;height:60px;border:5px solid #E2E8F0;border-top-color:#00A8A0;border-radius:50%;
  animation:${spin} 1s linear infinite; margin: 6px auto 10px;
`;

const Message = styled.p`margin:8px 0 0; font-weight:600; text-align:center;`;

const ProgressBar = styled.div`
  width:100%; height:10px; background:#E2E8F0; border-radius:6px; overflow:hidden; margin-top:14px;
`;
const Progress = styled.div`
  width:${({$pct=0})=>Math.max(0,Math.min(100,Number($pct)||0))}%;
  height:100%; background:#00A8A0; transition:width .4s ease;
`;

const StepList = styled.ul`list-style:none; margin:12px 0 0; padding:0;`;
const StepItem = styled.li`
  display:flex; align-items:center; gap:8px; padding:10px 6px; border-radius:10px;
  background:${p=>p.$done?'#ECFDF3':'#fff'};
  color:${p=>p.$done?'#027A48':'#101828'};
  svg{flex:none;}
`;

// ✅ Loader2 の “回転アイコン” を styled で定義（inline style の keyframes 禁止対策）
const SpinningIcon = styled(Loader2)`
  animation: ${spin} 1s linear infinite;
`;

const ChipRow = styled.div`display:flex; flex-wrap:wrap; gap:8px;`;
const Chip = styled.span`
  background:#EEF2FF; color:#3730A3; border-radius:999px; padding:6px 10px; font-size:13px;
`;

const MiniList = styled.div`display:grid; gap:8px;`;
const MiniItem = styled.div`
  border:1px dashed #E5E7EB; border-radius:12px; padding:10px 12px; background:#FCFCFD;
  display:flex; align-items:center; gap:10px;
`;
const Name = styled.div`font-weight:600;`;
const Sub = styled.div`font-size:12px; color:#667085;`;

// ── helpers to read logs
function pickMasterPlan(logs){
  const mp = (logs?.llm_output||[]).find(x=>x.agent==='master' && x.payload && x.payload.master_plan);
  return mp?.payload?.master_plan || [];
}
function countFound(logs, agent, key){
  const entry = (logs?.llm_output||[]).find(x=>x.agent===agent && x.payload && Array.isArray(x.payload[key]));
  return entry ? entry.payload[key].length : 0;
}
function peekList(logs, agent, key, take=5){
  const entry = (logs?.llm_output||[]).find(x=>x.agent===agent && Array.isArray(x.payload?.[key]));
  const arr = entry?.payload?.[key] || [];
  return arr.slice(0, take);
}
function hasOutput(logs, agent){
  return (logs?.llm_output||[]).some(x=>x.agent===agent);
}
function geocodeCount(logs){
  // 設計により geocode は llm_output 側に kind='geocode' で入っている想定
  return (logs?.llm_output||[]).filter(x=>x.kind==='geocode').length;
}

export default function GeneratingPlanPage(){
  const { loadingStatus, planId, plan } = usePlan();
  const pct = Math.max(0, Math.min(100, Number(loadingStatus?.progress)||0));
  const [state, setState] = useState(null);

  // poll current state
  useEffect(()=>{
    if(!planId) return;
    let alive = true;
    const tick = async ()=>{
      try{
        const s = await getPlanState(planId);
        if(alive) setState(s);
      }catch(e){/* noop */}
      if(alive && loadingStatus?.active) setTimeout(tick, 1200);
    };
    tick();
    return ()=>{ alive = false; };
  }, [planId, loadingStatus?.active]);

  const masterPlan = useMemo(()=>pickMasterPlan(state?.logs), [state]);
  const foundRestaurants = useMemo(()=>countFound(state?.logs,'dining','restaurants'), [state]);
  const foundHotels = useMemo(()=>countFound(state?.logs,'hotel','hotels'), [state]);
  const foundActivities = useMemo(()=>countFound(state?.logs,'activity','activities'), [state]);

  const steps = [
    { key:'master', label:'旅の骨格を作成中（エリア配分）', done: hasOutput(state?.logs,'master') },
    { key:'scout', label:'スポット収集中（食・宿・体験）', done: hasOutput(state?.logs,'dining') && hasOutput(state?.logs,'hotel') && hasOutput(state?.logs,'activity') },
    { key:'day', label:'日次スケジュールを作成中', done: hasOutput(state?.logs,'day-planner') },
    { key:'geo', label:'地図用の座標を作成中', done: geocodeCount(state?.logs) > 0 },
    { key:'final', label:'最終整形 & Excel 書き出し', done: pct === 100 },
  ];

  return (
    <Page>
      {/* 左：プログレス＋ステップ */}
      <Left>
        <Card>
          <Title>旅行プランを生成しています</Title>
          <Spinner />
          <Message>{loadingStatus?.message || '準備中...'}</Message>
          <ProgressBar><Progress $pct={pct} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} /></ProgressBar>
        </Card>

        <Card>
          <Title>いまの進捗</Title>
          <StepList>
            {steps.map(s=>(
              <StepItem key={s.key} $done={s.done}>
                {s.done ? <CheckCircle2 size={18}/> : <SpinningIcon size={18} />}
                <span>{s.label}</span>
              </StepItem>
            ))}
          </StepList>
        </Card>
      </Left>

      {/* 右：ライブプレビュー */}
      <Right>
        <Card>
          <Row><MapPin size={18}/><Title>目的地プレビュー</Title></Row>
          <div style={{color:'#667085', marginBottom:10}}>
            {(state?.meta?.origin || plan.origin) || '—'} → {(state?.meta?.destination || plan.destination) || '—'}
          </div>
          <div style={{marginBottom:12}}>
            <strong>候補エリア</strong>
            <ChipRow style={{marginTop:8}}>
              {masterPlan.length===0 && <Chip>（解析中…）</Chip>}
              {masterPlan.map((d,i)=> <Chip key={i}>{d.area || d.name || '—'}</Chip>)}
            </ChipRow>
          </div>
        </Card>

        <Card>
          <Row><Utensils size={18}/><Title>グルメ候補</Title></Row>
          <Sub>{foundRestaurants}件</Sub>
          <MiniList style={{marginTop:10}}>
            {peekList(state?.logs,'dining','restaurants',5).map((r,i)=>(
              <MiniItem key={i}>
                <Utensils size={16}/>
                <div>
                  <Name>{r.name}</Name>
                  <Sub>{r.type}・{r.price || '-'} {r.url && <a href={r.url} target="_blank" rel="noreferrer">公式</a>}</Sub>
                </div>
              </MiniItem>
            ))}
            {foundRestaurants===0 && <Sub>（解析中…）</Sub>}
          </MiniList>
        </Card>

        <Card>
          <Row><Hotel size={18}/><Title>宿泊候補</Title></Row>
          <Sub>{foundHotels}件</Sub>
          <MiniList style={{marginTop:10}}>
            {peekList(state?.logs,'hotel','hotels',5).map((r,i)=>(
              <MiniItem key={i}>
                <Hotel size={16}/>
                <div>
                  <Name>{r.name}</Name>
                  <Sub>{r.type}・{r.price || '-'} {r.url && <a href={r.url} target="_blank" rel="noreferrer">予約</a>}</Sub>
                </div>
              </MiniItem>
            ))}
            {foundHotels===0 && <Sub>（解析中…）</Sub>}
          </MiniList>
        </Card>

        <Card>
          <Row><Ticket size={18}/><Title>体験候補</Title></Row>
          <Sub>{foundActivities}件</Sub>
          <MiniList style={{marginTop:10}}>
            {peekList(state?.logs,'activity','activities',5).map((r,i)=>(
              <MiniItem key={i}>
                <Ticket size={16}/>
                <div>
                  <Name>{r.name}</Name>
                  <Sub>{r.type}・{r.price || '-'} {r.url && <a href={r.url} target="_blank" rel="noreferrer">詳細</a>}</Sub>
                </div>
              </MiniItem>
            ))}
            {foundActivities===0 && <Sub>（解析中…）</Sub>}
          </MiniList>
        </Card>

        <Card>
          <Title>最新ログ</Title>
          <MiniList>
            {(state?.logs?.llm_output||[]).slice(-6).reverse().map((x,i)=>(
              <MiniItem key={i}>
                <div>
                  <Name>{x.agent || x.kind || 'log'}</Name>
                  <Sub>{new Date(x.ts||Date.now()).toLocaleTimeString()} — {x.summary || '(no summary)'}</Sub>
                </div>
              </MiniItem>
            ))}
            {(!state?.logs || state?.logs?.llm_output?.length===0) && <Sub>（到着待ち…）</Sub>}
          </MiniList>
        </Card>
      </Right>
    </Page>
  );
}
