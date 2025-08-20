// server/excelLogger.js
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PLANS_ROOT = path.join(__dirname, 'plans');
const INDEX_JSON  = path.join(PLANS_ROOT, 'Index.json');
const INDEX_XLSX  = path.join(PLANS_ROOT, 'Index.xlsx');

async function ensureDir(p){ await fs.mkdir(p, { recursive: true }); }
async function readJson(p, fallback=null){
  try{ const raw=await fs.readFile(p,'utf8'); return raw.trim()? JSON.parse(raw): fallback; }
  catch{ return fallback; }
}
async function writeJson(p, data){
  await ensureDir(path.dirname(p));
  await fs.writeFile(p, JSON.stringify(data,null,2)+'\n','utf8');
}
const nowISO = ()=> new Date().toISOString();

function makePlanId(meta={}){
  const d=new Date();
  const ts=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(d.getHours()).padStart(2,'0')}${String(d.getMinutes()).padStart(2,'0')}${String(d.getSeconds()).padStart(2,'0')}`;
  const rnd=Math.random().toString(36).slice(2,8);
  const dst=(meta.destination||'trip').toString().replace(/[^\p{L}\p{N}]+/gu,'_').slice(0,24);
  return `${ts}-${dst}-${rnd}`;
}
function clampStr(s,max=32000){ if(s==null) return ''; const t=String(s); return t.length>max? t.slice(0,max)+' …(truncated)': t; }
function aoa(headers,rows){ return [headers, ...rows.map(r=>headers.map(h=>r[h]))]; }
function appendSheet(wb,name,headers,rows){ const ws=XLSX.utils.aoa_to_sheet(aoa(headers,rows)); XLSX.utils.book_append_sheet(wb,ws,name.slice(0,31)); }
function rowsSum(rows,key){ let s=0; for(const r of rows){ const n=parseInt(String(r[key]??'').replace(/[^\d]/g,''),10); if(Number.isFinite(n)) s+=n; } return s; }
const parseYen = (v)=>{ const n=parseInt(String(v??'').replace(/[^\d]/g,''),10); return Number.isFinite(n)?n:0; };

// ── 位置/距離のユーティリティ ─────────────────
const toRad = (d)=>(d*Math.PI)/180;
const toNum = (v)=>{ const n=Number(v); return Number.isFinite(n)? n: null; };

function haversineKm(a,b){
  const aLat=toNum(a?.lat), aLon=toNum(a?.lon), bLat=toNum(b?.lat), bLon=toNum(b?.lon);
  if(aLat==null || aLon==null || bLat==null || bLon==null) return null;
  const R=6371, dLat=toRad(bLat-aLat), dLon=toRad(bLon-aLon);
  const lat1=toRad(aLat), lat2=toRad(bLat);
  const x=Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function estimateMinutes(km, mode='public'){
  if(km==null) return null;
  if(km<=0.6) return Math.ceil((km/4)*60);          // 徒歩
  if(mode==='public') return Math.ceil((km/18)*60+8);// 公共交通ざっくり
  return Math.ceil((km/25)*60+5);                    // 車
}

// ── Index.xlsx ────────────────────────────────
function makeIndexWorkbook(list){
  const wb=XLSX.utils.book_new();
  const headers=['planId','createdAt','status','origin','destination','dates','duration','budgetPerDay','transport','planPath'];
  const rows=(list||[]).map(r=>({
    planId:r.planId, createdAt:r.createdAt, status:r.status,
    origin:r.meta?.origin||'', destination:r.meta?.destination||'',
    dates:r.meta?.dates? JSON.stringify(r.meta.dates): '',
    duration:r.meta?.duration??'', budgetPerDay:r.meta?.budgetPerDay??'',
    transport:r.meta?.transport||'', planPath:r.planPath||'',
  }));
  appendSheet(wb,'Index',headers,rows);
  return wb;
}

// ── FinalPlan 整形出力 ───────────────────────
function toFinalRows(finalPlan={}){
  const rows=[];
  if(Array.isArray(finalPlan.itinerary)){
    for(const d of finalPlan.itinerary){
      for(const s of (d.schedule||[])){
        rows.push({
          day:d.day??'', date:d.date||'', area:d.area||'', theme:d.theme||'',
          time:s.time||'', name:s.activity_name||s.name||'',
          note:clampStr(s.description||'',4000),
          priceYen: parseYen(s.price),
          url:s.url||'',
          lat: toNum(s.lat) ?? '',         // 数字として保存（無効なら空）
          lon: toNum(s.lon) ?? '',
        });
      }
    }
  }
  return rows;
}

// ── Quality 指標 ─────────────────────────────
function computeDayMetrics(finalPlan={}, meta={}){
  const out=[]; if(!Array.isArray(finalPlan.itinerary)) return out;
  const mode = meta.transport || 'public';
  for(const d of finalPlan.itinerary){
    const sch = Array.isArray(d.schedule)? d.schedule: [];
    let stops=sch.length, meals=0, totalCost=0, maxLegMin=0, walkKmTotal=0;
    for(let i=0;i<sch.length;i++){
      const s=sch[i]; totalCost+=parseYen(s.price);
      if((s.type||'').toLowerCase()==='meal') meals++;
      if(i>0){
        const prev=sch[i-1];
        const km=haversineKm(
          {lat:prev.lat,lon:prev.lon},
          {lat:s.lat,lon:s.lon}
        );
        if(km!=null){
          const m=estimateMinutes(km,mode)||0;
          if(m>maxLegMin) maxLegMin=m;
          if(km<0.8) walkKmTotal+=km; // 徒歩近似
        }
      }
    }
    out.push({
      day:d.day??'', date:d.date||'', area:d.area||'',
      stops, meals, total_cost:Number.isFinite(d.total_cost)?d.total_cost:totalCost,
      max_leg_min:Math.round(maxLegMin), walk_km_total:Math.round(walkKmTotal*10)/10
    });
  }
  return out;
}

// ── ログから最終プランを復元（finalize忘れ対策） ─────
function extractJsonFromText(txt){
  try{ return JSON.parse(txt); }catch{}
  const s=txt.indexOf('{'); const e=txt.lastIndexOf('}');
  if(s>=0 && e>=s){ try{ return JSON.parse(txt.slice(s,e+1)); }catch{} }
  return null;
}
function buildFinalFromLogs(logs){
  const days=[];
  for(const x of (logs?.llm_output||[])){
    const a=(x.agent||'').toLowerCase();
    if(!(a.includes('day-planner') || a.includes('v2-day'))) continue;
    let j = x.parsed_json || (x.raw_text? extractJsonFromText(x.raw_text): null);
    if(!j || !Array.isArray(j.schedule)) continue;
    days.push({
      day:j.day??'', date:j.date||'', area:j.area||'', theme:j.theme||'',
      schedule:j.schedule, total_cost:j.total_cost
    });
  }
  days.sort((p,q)=> (p.day||0)-(q.day||0));
  return days.length? { itinerary: days } : null;
}

// ── ブック生成 ───────────────────────────────
function makePlanWorkbook(meta, logs, finalPlan){
  const wb=XLSX.utils.book_new();

  // UserInput
  appendSheet(wb,'UserInput',
    ['ts','field','value'],
    (logs.user_input||[]).map(x=>({ ts:x.ts||'', field:x.field||'', value:clampStr(x.value??'',16000) }))
  );

  // LLM_Input
  appendSheet(wb,'LLM_Input',
    ['ts','agent','system_prompt','user_prompt','variables_json'],
    (logs.llm_input||[]).map(x=>({
      ts:x.ts||'', agent:x.agent||'',
      system_prompt:clampStr(x.system_prompt||'',32000),
      user_prompt:clampStr(x.user_prompt||'',32000),
      variables_json:clampStr(JSON.stringify(x.variables_json??null),32000),
    }))
  );

  // LLM_Output
  appendSheet(wb,'LLM_Output',
    ['ts','agent','raw_text','parsed_json'],
    (logs.llm_output||[]).map(x=>({
      ts:x.ts||'', agent:x.agent||'',
      raw_text:clampStr(x.raw_text||'',32000),
      parsed_json:clampStr(JSON.stringify(x.parsed_json??null),32000),
    }))
  );

  // Geocode（デバッグ用）
  appendSheet(wb,'Geocode',
    ['ts','query','lat','lon','display_name','source'],
    (logs.geocode||[]).map(x=>({
      ts:x.ts||'', query:x.query||'',
      lat: toNum(x.lat) ?? '', lon: toNum(x.lon) ?? '',
      display_name:clampStr(x.display_name||'',16000),
      source:x.source||'',
    }))
  );

  // FinalPlan
  appendSheet(wb,'FinalPlan',
    ['day','date','area','theme','time','name','note','priceYen','url','lat','lon'],
    toFinalRows(finalPlan)
  );

  // Quality
  appendSheet(wb,'Quality',
    ['day','date','area','stops','meals','total_cost','max_leg_min','walk_km_total'],
    computeDayMetrics(finalPlan, meta)
  );

  // Overview
  const total = finalPlan.estimates?.totalCostYen ?? rowsSum(toFinalRows(finalPlan),'priceYen');
  appendSheet(wb,'Overview',
    ['planId','createdAt','status','origin','destination','dates','duration','budgetPerDay','transport','title','totalCostYen'],
    [{
      planId:meta.planId||'', createdAt:meta.createdAt||'', status:meta.status||'In Progress',
      origin:meta.origin||'', destination:meta.destination||'',
      dates:meta.dates? JSON.stringify(meta.dates): '', duration:meta.duration??'',
      budgetPerDay:meta.budgetPerDay??'', transport:meta.transport||'',
      title: finalPlan.title||'', totalCostYen: total||0
    }]
  );

  return wb;
}

export class ExcelLogger {
  constructor(planId){
    this.planId=String(planId);
    this.planDir=path.join(PLANS_ROOT,this.planId);
    this.metaPath=path.join(this.planDir,'meta.json');
    this.logsPath=path.join(this.planDir,'logs.json');
    this.finalJsonPath=path.join(this.planDir,'finalPlan.json');
    this.planXlsx=path.join(this.planDir,'plan.xlsx');
  }

  static async start(meta={}){
    await ensureDir(PLANS_ROOT);
    const planId=makePlanId(meta);
    const planDir=path.join(PLANS_ROOT,planId);
    await ensureDir(planDir);
    const createdAt=nowISO();
    const safeMeta={
      planId, createdAt, status:'In Progress',
      origin:meta.origin||'', destination:meta.destination||'',
      dates:meta.dates||null, duration:meta.duration??null,
      budgetPerDay:meta.budgetPerDay??null, transport:meta.transport||'',
    };
    await writeJson(path.join(planDir,'meta.json'), safeMeta);
    // ★ geocode 配列を初期化
    await writeJson(path.join(planDir,'logs.json'), { user_input:[], llm_input:[], llm_output:[], geocode:[] });

    const index=(await readJson(INDEX_JSON,[]))||[];
    index.unshift({ planId, createdAt, status:safeMeta.status, planPath:path.relative(PLANS_ROOT,path.join(planDir,'plan.xlsx')), meta:safeMeta });
    await writeJson(INDEX_JSON,index);
    const wb=makeIndexWorkbook(index);
    XLSX.writeFile(wb, INDEX_XLSX, { bookType:'xlsx' });

    return { planId, planPath: planDir };
  }

  async _readLogs(){
    // ★ geocode をデフォルト化
    return (await readJson(this.logsPath,null)) || { user_input:[], llm_input:[], llm_output:[], geocode:[] };
  }

  async log(type,payload){
    await ensureDir(this.planDir);
    const logs=await this._readLogs();
    const entry={ ts:nowISO(), ...(payload||{}) };
    if(type==='user_input') logs.user_input.push(entry);
    else if(type==='llm_input') logs.llm_input.push(entry);
    else if(type==='llm_output') logs.llm_output.push(entry);
    else if(type==='geocode') logs.geocode.push(entry);  // ★ 正しく振り分け
    else logs.llm_output.push(entry);
    await writeJson(this.logsPath, logs);
  }

  async writeJson(name,data){ await writeJson(path.join(this.planDir,`${name}.json`), data); }

  async exportXlsx(finalPlanArg){
    await ensureDir(this.planDir);
    const meta  = (await readJson(this.metaPath, {})) || {};
    const logs  = await this._readLogs();
    const saved = (await readJson(this.finalJsonPath, {})) || {};
    // ★ 最終プランの決定：引数 > 保存済み > ログ復元
    let finalPlan = finalPlanArg && Object.keys(finalPlanArg||{}).length? finalPlanArg :
                    Object.keys(saved||{}).length? saved :
                    buildFinalFromLogs(logs) || {};
    const wb = makePlanWorkbook(meta, logs, finalPlan);
    XLSX.writeFile(wb, this.planXlsx, { bookType:'xlsx' });
    return this.planXlsx;
  }

  static async list(){ return (await readJson(INDEX_JSON,[])) || []; }

  static async updateStatus(planId,status='Done'){
    await ensureDir(PLANS_ROOT);
    const index=(await readJson(INDEX_JSON,[]))||[];
    const i=index.findIndex(r=>r.planId===planId);
    if(i>=0){
      index[i].status=status;
      await writeJson(INDEX_JSON,index);
      const wb=makeIndexWorkbook(index);
      XLSX.writeFile(wb, INDEX_XLSX, { bookType:'xlsx' });
    }
    const planDir=path.join(PLANS_ROOT,String(planId));
    const metaPath=path.join(planDir,'meta.json');
    const meta=(await readJson(metaPath,{}))||{};
    meta.status=status;
    await writeJson(metaPath, meta);
  }

  async readState(){
    const meta = await readJson(this.metaPath, {});
    const logs = await readJson(this.logsPath, { user_input:[], llm_input:[], llm_output:[], geocode:[] });
    const finalPlan = await readJson(this.finalJsonPath, null);
    return { meta, logs, finalPlan };
  }

  static async readState(planId){ return new ExcelLogger(String(planId)).readState(); }
}
