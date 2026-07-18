import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import {
  LayoutDashboard, KanbanSquare, Contact2, Building2, DollarSign, Settings,
  Menu, Plus, X, Phone, Mail, Globe, Flag, Search, Trash2, Download, Upload,
  MessageSquare, PhoneCall, CalendarClock, StickyNote, Mailbox, Lock, Repeat,
  CheckCircle2, Circle, AlertTriangle, ArrowUpDown, Percent, Target, Award, Rocket, UserCheck,
  Image as ImageIcon, GripVertical, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, List, SlidersHorizontal,
  Layers, FileText, Tag, LogOut, Receipt, Printer, Send, Bell, Sparkles,
  BookText, Wallet, ArrowDownLeft, ArrowUpRight, Paperclip, FileDown, Loader2, ListTodo,
  Users, Link2, UserPlus
} from 'lucide-react';
import JSZip from 'jszip';
import { auth, db, configured } from './lib/supabase';
import { BRAND } from './lib/brand';

/* ===================== brand ===================== */
const COBALT=BRAND.colors.cobalt, INDIGO=BRAND.colors.indigo, INK=BRAND.colors.ink, GOLD=BRAND.colors.gold, GREEN=BRAND.colors.green, RED=BRAND.colors.red;
const PIE=[COBALT,INDIGO,GOLD,'#5C76EE','#8E86C9',GREEN,'#D98A3D','#7AA0F0'];
const STAGE_COLORS=['#6B73C9',COBALT,'#7A5CC8',GOLD,GREEN,'#B0606A','#D98A3D','#2BA7A0'];

/* ===================== editable defaults ===================== */
const DEFAULT_OPTIONS={
  businessType:['—','Real Estate','Lending','Restaurant','Retail','Law Firm','Construction','Professional Services','Other'],
  source:['Referral',...BRAND.team,'Cold Outreach','Instagram','Networking','Walk-in','Website','Other'],
  service:['Web Design','AI Integration','Both','Unknown','Missed-Call Text-Back','AI Receptionist','Booking / Scheduling','CRM Setup','Full Front Office'],
  nextAction:['Schedule Coffee','Schedule Sit Down','Text in 1 Week','Visit and Introduce','Send Proposal','Follow Up Call','Close','—'],
  owner:[...BRAND.team,BRAND.pool],
};
const DEFAULT_STAGES=[
  {key:'new',      label:'New Lead',      color:'#6B73C9', prob:0.10, open:true,  won:false, lost:false},
  {key:'contacted',label:'Contacted',     color:COBALT,    prob:0.25, open:true,  won:false, lost:false},
  {key:'meeting',  label:'Meeting Set',   color:'#7A5CC8', prob:0.50, open:true,  won:false, lost:false},
  {key:'proposal', label:'Proposal Sent', color:GOLD,      prob:0.75, open:true,  won:false, lost:false},
  {key:'won',      label:'Closed Won',    color:GREEN,     prob:1.00, open:false, won:true,  lost:false},
  {key:'lost',     label:'Closed Lost',   color:'#B0606A', prob:0.00, open:false, won:false, lost:true},
];
const PRIORITIES={high:{label:'High',color:'#E0662B',bg:'rgba(224,102,43,.12)',rank:0},medium:{label:'Medium',color:COBALT,bg:'rgba(43,77,224,.10)',rank:1},low:{label:'Low',color:'#8E89A8',bg:'#F0F1F7',rank:2}};
const OWNERS=[...BRAND.team,BRAND.pool];
/* ---- team scoping: everyone sees their own leads; "ProyTech" is the shared pool ---- */
const POOL_OWNER=BRAND.pool;
const DEFAULT_TEAM=BRAND.team.map(name=>({name,access:'all'}));
const teamAccess=(settings,name)=>{ const t=(settings?.team||[]).find(x=>x.name===name); return t?t.access:'all'; };
const scopeLeads=(list,view,me)=>{
  if(view==='mine') return list.filter(l=>l.owner===me);
  if(view==='pool') return list.filter(l=>l.owner===POOL_OWNER);
  return list;
};
function ScopeSeg({view,setView,counts,canAll}){
  return (<div className="seg scope-seg">
    <button className={view==='mine'?'on':''} onClick={()=>setView('mine')}>Mine<i>{counts.mine}</i></button>
    <button className={view==='pool'?'on':''} onClick={()=>setView('pool')}>Pool<i>{counts.pool}</i></button>
    {canAll&&<button className={view==='all'?'on':''} onClick={()=>setView('all')}>All<i>{counts.all}</i></button>}
  </div>);
}
const ACT_TYPES=[{key:'Note',icon:StickyNote},{key:'Call',icon:PhoneCall},{key:'Text',icon:MessageSquare},{key:'Meeting',icon:CalendarClock},{key:'Email',icon:Mailbox}];
const fmtCustom=(v,type)=>{if(v===undefined||v==='')return '—';if(type==='checkbox')return v?'✓':'—';return String(v);};
const DEFAULT_LEAD_COLS=[
  {key:'businessType',visible:true},{key:'stage',visible:true},{key:'source',visible:true},
  {key:'nextAction',visible:true},{key:'lastContacted',visible:true},{key:'followUp',visible:true},
  {key:'priority',visible:true},{key:'dealValue',visible:true},{key:'owner',visible:true},
  {key:'serviceInterest',visible:false},{key:'nextSteps',visible:false},{key:'phone',visible:false},{key:'email',visible:false},{key:'sponsor',visible:false},
];

/* ===================== data + auth live in ./lib/supabase ===================== */

/* ===================== helpers ===================== */
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const cap=s=>s?s.charAt(0).toUpperCase()+s.slice(1):s;
const num=v=>{const n=Number(v);return isNaN(n)?0:n;};
const usd=v=>(num(v)<0?'-$':'$')+Math.abs(Math.round(num(v))).toLocaleString();
const usdK=v=>{v=num(v);return Math.abs(v)>=1000?'$'+(v/1000).toFixed(v%1000===0?0:1)+'k':'$'+Math.round(v);};
const pct=v=>(num(v)*100).toFixed(0)+'%';
const todayISO=()=>new Date().toISOString().slice(0,10);
const fmtDate=iso=>{if(!iso)return '';const d=new Date(iso+(iso.length<=10?'T00:00:00':''));return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});};
const fmtStamp=ts=>{const d=new Date(ts);return d.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})+' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});};
const daysUntil=iso=>{if(!iso)return null;const a=new Date(iso+'T00:00:00'),b=new Date(todayISO()+'T00:00:00');return Math.round((a-b)/86400000);};
const lastContact=l=>{const ts=(l.activities||[]).map(a=>a.ts).sort().pop();return ts||l.createdAt;};
const daysSince=ts=>Math.floor((Date.now()-new Date(ts))/86400000);
const monthKey=d=>{d=new Date(d);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};
const monthLabel=k=>{const[y,m]=k.split('-');return new Date(+y,+m-1,1).toLocaleString('en-US',{month:'short'});};
const lastNMonths=n=>{const out=[];const d=new Date();d.setDate(1);for(let i=n-1;i>=0;i--){const x=new Date(d);x.setMonth(d.getMonth()-i);out.push(monthKey(x));}return out;};
const sOf=(k,stages)=>stages.find(s=>s.key===k)||stages[0];
const sIdx=(k,stages)=>{const i=stages.findIndex(s=>s.key===k);return i<0?0:i;};
function leadColumnDefs(stages,customFields){
  const d={
    businessType:{label:'Type',render:l=><span className="subcell">{l.businessType}</span>},
    company:{label:'Company',render:l=><span className="subcell">{l.company}</span>},
    stage:{label:'Stage',render:l=><StageBadge k={l.stage} stages={stages}/>},
    source:{label:'Source',render:l=><span className="subcell">{l.source||'—'}</span>},
    serviceInterest:{label:'Service',render:l=><span className="subcell">{(l.serviceInterest||[]).join(', ')||'—'}</span>},
    nextAction:{label:'Next Action',render:l=><span className="subcell">{l.nextAction}</span>},
    nextSteps:{label:'Next Steps',render:l=><span className="subcell">{l.nextSteps||'—'}</span>},
    lastContacted:{label:'Last Contact',render:l=>{const ds=daysSince(lastContact(l));return <span className="subcell" style={ds>=14?{color:RED,fontWeight:600}:undefined}>{ds===0?'Today':ds+'d ago'}</span>;}},
    followUp:{label:'Follow-up',render:l=><Due iso={l.followUp}/>},
    priority:{label:'Priority',render:l=><PriBadge p={l.priority}/>},
    dealValue:{label:'Deal',render:l=><span style={{fontWeight:600,color:INK}}>{l.dealValue>0?usd(l.dealValue):'—'}</span>},
    owner:{label:'Owner',render:l=><span className="subcell">{l.owner}</span>},
    phone:{label:'Phone',render:l=><span className="subcell">{l.phone||'—'}</span>},
    email:{label:'Email',render:l=><span className="subcell">{l.email||'—'}</span>},
    sponsor:{label:'Sponsor',render:l=>l.pastSponsor?<span className="spon-badge past">Past{l.sponsorAmount>0?' · '+usd(l.sponsorAmount):''}</span>:l.potentialSponsor?<span className="spon-badge">Potential{l.sponsorAmount>0?' · '+usd(l.sponsorAmount):''}</span>:<span className="subcell">—</span>},
  };
  (customFields||[]).forEach(f=>{d['cf:'+f.id]={label:f.label,render:l=><span className="subcell">{fmtCustom(l.custom?.[f.id],f.type)}</span>};});
  return d;
}
function mergeLeadCols(saved,customFields){
  const base=Array.isArray(saved)&&saved.length?saved.slice():DEFAULT_LEAD_COLS.slice();
  const valid=new Set(DEFAULT_LEAD_COLS.map(c=>c.key).concat((customFields||[]).map(f=>'cf:'+f.id)));
  let cols=base.filter(c=>valid.has(c.key));
  DEFAULT_LEAD_COLS.forEach(dd=>{if(!cols.find(c=>c.key===dd.key))cols.push({...dd});});
  (customFields||[]).forEach(f=>{const k='cf:'+f.id;if(!cols.find(c=>c.key===k))cols.push({key:k,visible:false});});
  return cols;
}

/* ===================== delivery (post-sale fulfillment) ===================== */
const DEFAULT_DELIVERY_TRACKS=[
  { key:'website', label:'Website', services:['Web Design','Website','Both','Full Front Office'],
    milestones:['Discovery call complete','Website dev pending','Website V1 sent','Revisions','Final proof sent','Website approved by client'] },
  { key:'ai', label:'AI / Integrations', services:['AI Integration','AI Receptionist','Missed-Call Text-Back','Booking / Scheduling','CRM Setup','Both','Full Front Office'],
    milestones:['Discovery & scoping','Integrations started','Build & configuration','Testing','Integrations delivered'] },
];
const activeTracks=(lead,tracks)=>{ const svc=lead.serviceInterest||[]; const m=(tracks||[]).filter(tr=>(tr.services||[]).some(s=>svc.includes(s))); return m.length?m:(tracks||[]); };

/* ---- introduction network: who introduced whom ---- */
/* returns [root, ..., directIntroducer] for a contact — cycle-safe */
function introChain(lead,all){
  if(!lead) return [];
  const byId={}; (all||[]).forEach(x=>byId[x.id]=x);
  const chain=[]; const seen=new Set([lead.id]); let cur=lead;
  while(cur&&cur.introducedBy){
    const p=byId[cur.introducedBy];
    if(!p||seen.has(p.id))break;
    seen.add(p.id); chain.unshift(p); cur=p;
  }
  return chain;
}
/* builds the intro forest + a tidy left-to-right layout */
function buildNetwork(contacts){
  const byId={}; contacts.forEach(c=>byId[c.id]=c);
  const parentOf=id=>{const c=byId[id];const p=c&&c.introducedBy;return (p&&p!==id&&byId[p])?p:null;};
  const kids={}; contacts.forEach(c=>{const p=parentOf(c.id); if(p)(kids[p]=kids[p]||[]).push(c.id);});
  Object.values(kids).forEach(a=>a.sort((x,y)=>(byId[x].name||'').localeCompare(byId[y].name||'')));
  const inNet=new Set();
  contacts.forEach(c=>{ if(parentOf(c.id)||(kids[c.id]||[]).length) inNet.add(c.id); });
  const roots=[...inNet].filter(id=>!parentOf(id)).sort((a,b)=>{
    const ca=(kids[a]||[]).length, cb=(kids[b]||[]).length;
    return cb-ca||(byId[a].name||'').localeCompare(byId[b].name||'');
  });
  const nodes=[],links=[]; let leaf=0; const seen=new Set();
  const place=(id,depth)=>{
    if(seen.has(id))return null;
    seen.add(id);
    const ch=(kids[id]||[]).filter(k=>!seen.has(k));
    let y;
    if(!ch.length){ y=leaf; leaf+=1; }
    else{ const ys=ch.map(k=>place(k,depth+1)).filter(v=>v!=null); y=ys.length?(ys[0]+ys[ys.length-1])/2:(leaf++); ch.forEach(k=>links.push([id,k])); }
    nodes.push({id,depth,y,kids:(kids[id]||[]).length});
    return y;
  };
  roots.forEach(r=>place(r,1));
  const depth=nodes.length?Math.max(...nodes.map(n=>n.depth)):0;
  return {byId,kids,roots,nodes,links,inNet,rows:leaf,maxDepth:depth};
}
const normEntry=v=>{ if(!v) return {done:null,due:null}; if(typeof v==='string') return {done:v,due:null}; return {done:v.done||null,due:v.due||null}; };
const trackProgress=(lead,track)=>{ const raw=(lead.delivery&&lead.delivery[track.key])||{}; const ms=track.milestones||[]; const entries={}; let completed=0,overdue=0,nextDue=null;
  ms.forEach(m=>{ const e=normEntry(raw[m]); entries[m]=e; if(e.done) completed++; else if(e.due){ if(daysUntil(e.due)<0) overdue++; if(!nextDue||e.due<nextDue) nextDue=e.due; } });
  const current=ms.find(m=>!entries[m].done)||null;
  return {entries,ms,completedCount:completed,total:ms.length,pct:ms.length?completed/ms.length:0,current,overdue,nextDue}; };
const clientOverall=(lead,tracks)=>{ const ts=activeTracks(lead,tracks); let c=0,t=0,phase='',overdue=0,nextDue=null,lastDone=null; ts.forEach(tr=>{const p=trackProgress(lead,tr);c+=p.completedCount;t+=p.total;overdue+=p.overdue; if(p.nextDue&&(!nextDue||p.nextDue<nextDue))nextDue=p.nextDue; if(p.current&&!phase)phase=`${tr.label}: ${p.current}`; Object.values(p.entries).forEach(e=>{ if(e.done&&(!lastDone||e.done>lastDone)) lastDone=e.done; }); }); const delivered=t>0&&c>=t; return {pct:t?c/t:0,phase:phase||'Delivered',tracks:ts,overdue,nextDue,completed:c,total:t,delivered,doneDate:lastDone}; };

/* ===================== invoicing ===================== */
const DEFAULT_INV_SECTIONS={ headerLeft:{fz:10,lh:1.55}, headerRight:{fz:10,lh:1.4}, billto:{fz:10,lh:1.45}, items:{fz:10.5,lh:1.5}, totals:{fz:10.5,lh:1.5}, pay:{fz:10,lh:1.45}, notes:{fz:9.5,lh:1.5} };
const DEFAULT_INVOICING={ biz:{ name:BRAND.biz.name, address:BRAND.biz.address, email:BRAND.biz.email, phone:BRAND.biz.phone }, prefix:'INV-', seq:1, taxRate:0, terms:14, notes:'Thank you for your business.', paymentLink:'', accent:'#2B4DE0', logoH:46, showNotes:true, showPay:true, showLogo:true, layout:{order:['billto','items','totals','pay','notes'],headerSwap:false}, sections:DEFAULT_INV_SECTIONS };
const invSubtotal=inv=>(inv.items||[]).reduce((a,it)=>a+num(it.qty)*num(it.amount),0);
const invTax=inv=>invSubtotal(inv)*num(inv.taxRate)/100;
const invTotal=inv=>invSubtotal(inv)+invTax(inv);
const invState=inv=>{ if(inv.status==='paid') return 'paid'; if(inv.dueDate&&daysUntil(inv.dueDate)<0) return 'overdue'; return inv.status||'draft'; };
const addDays=(iso,n)=>{ const d=new Date((iso||todayISO())+'T00:00:00'); d.setDate(d.getDate()+num(n)); return d.toISOString().slice(0,10); };
function itemsFromLead(l){ const items=[]; const d=(l&&l.deal&&typeof l.deal==='object')?l.deal:null;
  if(d){ if(num(d.setup)) items.push({id:uid(),label:'Setup',qty:1,amount:num(d.setup)}); if(num(d.website)) items.push({id:uid(),label:'Website',qty:1,amount:num(d.website)}); if(num(d.integration)) items.push({id:uid(),label:'AI / Integration',qty:1,amount:num(d.integration)}); (d.extras||[]).forEach(e=>{ if(num(e.amount)) items.push({id:uid(),label:e.label||'Line item',qty:1,amount:num(e.amount)}); }); }
  else if(l&&num(l.dealValue)){ items.push({id:uid(),label:'Project',qty:1,amount:num(l.dealValue)}); }
  if(l&&l.retainerActive&&num(l.retainer)) items.push({id:uid(),label:'Monthly retainer',qty:1,amount:num(l.retainer)});
  if(!items.length) items.push({id:uid(),label:'',qty:1,amount:0});
  return items; }

/* ===================== seed (your real board) ===================== */
function mkLead(o){
  const createdAt=o.createdAt||new Date(Date.now()-((o._ago||0)*36e5)).toISOString();
  const acts=[{id:uid(),ts:createdAt,type:'Note',text:'Lead created.'}];
  if(o.note) acts.unshift({id:uid(),ts:createdAt,type:'Note',text:o.note});
  const {note,_ago,...rest}=o;
  return {id:uid(),name:'',company:'',businessType:'—',phone:'',email:'',website:'',
    stage:'new',priority:'medium',source:'',nextAction:'Follow Up Call',nextSteps:'',
    followUp:'',expectedClose:'',serviceInterest:[],owner:BRAND.team[0]||'',dealValue:0,retainer:0,
    potentialSponsor:false,pastSponsor:false,sponsorTier:'',sponsorAmount:0,
    isRelationship:false,introducedBy:'',relNote:'',
    retainerActive:false,retainerStart:'',closedAt:'',custom:{},createdAt,activities:acts,...rest};
}
/* Demo seed. A fresh client install starts EMPTY on purpose — never ship real
   pipeline data into someone else's CRM. Set VITE_SEED_DEMO=true on a demo
   deploy to populate these obviously-fake sample leads instead. */
const DEMO_SEED=(import.meta.env.VITE_SEED_DEMO||'').toString().toLowerCase()==='true';
function seed(){
  if(!DEMO_SEED) return [];
  const A=BRAND.team[0]||'Owner', B=BRAND.team[1]||A;
  return [
  mkLead({_ago:8,name:'Sample Client',company:'Northside Realty',businessType:'Real Estate',stage:'contacted',priority:'high',source:'Referral',owner:A,nextAction:'Follow up',dealValue:1200}),
  mkLead({_ago:6,name:'Demo Prospect',company:'Meridian Lending',businessType:'Lending',stage:'meeting',priority:'medium',source:'Networking',owner:B,nextAction:'Send proposal',dealValue:1499}),
  mkLead({_ago:4,name:'Example Lead',company:'Bright Path Insurance',businessType:'Professional Services',stage:'new',priority:'low',source:'Website',owner:BRAND.pool,nextAction:'Intro call'}),
  mkLead({_ago:2,name:'Test Contact',company:'Harbor Group',businessType:'Real Estate',stage:'proposal',priority:'high',source:'Referral',owner:A,nextAction:'Close',dealValue:2400}),
];}

/* ===================== CSS ===================== */
const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap');
*{box-sizing:border-box}
.pt{font-family:'Inter',system-ui,sans-serif;color:#221f3d;display:flex;min-height:100vh;background:#F4F6FB}
.pt h1,.pt h2,.pt h3,.pt h4,.disp{font-family:'Space Grotesk',sans-serif;letter-spacing:-.01em}
.gate{min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,#211d44,${INK})}
.gate-card{background:#fff;border-radius:20px;padding:38px 34px;width:340px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);text-align:center}
.gate-card h2{font-size:20px;color:${INK};margin:14px 0 4px}.gate-card p{font-size:13px;color:#8E89A8;margin-bottom:20px}
.gate-card input{width:100%;padding:12px 14px;border:1px solid #DEDFEA;border-radius:10px;font-size:15px;text-align:center;letter-spacing:.04em;margin-bottom:12px}
.gate-card input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.gate-err{color:${RED};font-size:12.5px;font-weight:600;margin-bottom:10px}
.sb{width:236px;flex:none;background:linear-gradient(180deg,#211d44,${INK});color:#fff;display:flex;flex-direction:column;position:sticky;top:0;height:100vh;padding:20px 14px;z-index:30}
.sb-brand{display:flex;align-items:center;gap:11px;padding:6px 8px 20px;border-bottom:1px solid rgba(255,255,255,.09);margin-bottom:14px}
.sb-brand img{max-height:34px;max-width:150px;object-fit:contain}
.nucleus{width:14px;height:14px;border-radius:50%;background:${COBALT};box-shadow:0 0 0 4px rgba(43,77,224,.25),0 0 14px 2px rgba(92,118,238,.6);flex:none}
.sb-brand b{font-family:'Space Grotesk';font-size:16px;font-weight:600}
.sb-brand span{display:block;font-size:11px;color:#A9A4CC;font-weight:400;letter-spacing:.04em}
.nav-i{display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:10px;color:#C7C3E6;font-size:14px;font-weight:500;cursor:pointer;transition:.16s;border:none;background:none;width:100%;text-align:left;margin-bottom:2px}
.nav-i:hover{background:rgba(255,255,255,.06);color:#fff}.nav-i.on{background:${COBALT};color:#fff;box-shadow:0 6px 18px -8px rgba(43,77,224,.9)}
.nav-i svg{flex:none}
.sb-foot{margin-top:auto;font-size:11px;color:#888;padding:12px 8px 2px;border-top:1px solid rgba(255,255,255,.08);line-height:1.5}.sb-foot b{color:#B9B5D8;font-weight:600}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:18px 30px;background:#fff;border-bottom:1px solid #E8E9F2;position:sticky;top:0;z-index:20}
.top h1{font-size:21px;font-weight:600}.top .sub{font-size:13px;color:#777296;margin-top:2px}
.body{padding:26px 30px 60px;width:100%;max-width:1320px}
.hamb{display:none;background:none;border:none;color:${INDIGO};cursor:pointer}
.kgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(176px,1fr));gap:16px;margin-bottom:22px}
.kpi{background:#fff;border:1px solid #E8E9F2;border-radius:16px;padding:18px;box-shadow:0 12px 30px -26px rgba(24,21,48,.5)}
.kpi .kl{font-size:11.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#8E89A8;display:flex;align-items:center;gap:7px}
.kpi .kv{font-family:'Space Grotesk';font-size:26px;font-weight:600;margin-top:9px;color:${INK};line-height:1}
.kpi .kd{font-size:12.5px;font-weight:600;margin-top:8px;color:#8E89A8}
.kpi.accent{background:linear-gradient(135deg,${COBALT},#2540c0);border:none}.kpi.accent .kl,.kpi.accent .kd{color:#D5DCFB}.kpi.accent .kv{color:#fff}
.kpi.gold{background:linear-gradient(135deg,${GOLD},#B0862F);border:none}.kpi.gold .kl,.kpi.gold .kd{color:#fff5e0}.kpi.gold .kv{color:#fff}
.kpi.green{background:linear-gradient(135deg,${GREEN},#178047);border:none}.kpi.green .kl,.kpi.green .kd{color:#dafce8}.kpi.green .kv{color:#fff}
.row{display:grid;gap:18px;margin-bottom:18px}.r2{grid-template-columns:1fr 1fr}.r3{grid-template-columns:2fr 1fr}
@media(max-width:900px){.r2,.r3{grid-template-columns:1fr}}
.card{background:#fff;border:1px solid #E8E9F2;border-radius:16px;padding:20px;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
.card h3{font-size:15px;font-weight:600;color:${INK};margin-bottom:3px}.card .ch-sub{font-size:12.5px;color:#8E89A8;margin-bottom:14px}
.chart-h{height:250px}.chart-sm{height:210px}
.sec-title{font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#928DAD;margin:6px 0 14px;display:flex;align-items:center;gap:8px}
.empty{padding:26px;text-align:center;color:#A6A2BC;font-size:13.5px}
.btn{font-family:'Inter';font-size:14px;font-weight:600;padding:10px 18px;border-radius:10px;border:none;cursor:pointer;transition:.16s;display:inline-flex;align-items:center;gap:8px}
.btn-p{background:${COBALT};color:#fff;box-shadow:0 8px 20px -10px rgba(43,77,224,.8)}.btn-p:hover{background:#2340bd}
.btn-g{background:#F0F1F7;color:#56527a}.btn-g:hover{background:#E6E7F1}
.btn-d{background:#fff;color:${RED};border:1px solid #F0CACA}.btn-d:hover{background:#FCEDED}
.btn-sm{padding:7px 12px;font-size:12.5px;border-radius:8px}
.pill{font-size:11px;font-weight:700;padding:4px 10px;border-radius:20px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;flex:none}
.tag{font-size:10.5px;font-weight:600;padding:3px 8px;border-radius:6px;background:#EEF0FA;color:#5A5680;white-space:nowrap}
/* table */
.tbl-wrap{background:#fff;border:1px solid #E8E9F2;border-radius:16px;overflow:auto;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
.tbl{width:100%;border-collapse:collapse;font-size:13.5px}
.colmenu-wrap{position:relative}
.cm-back{position:fixed;inset:0;z-index:39}
.colmenu{position:absolute;top:46px;right:0;z-index:40;background:#fff;border:1px solid #E8E9F2;border-radius:14px;box-shadow:0 20px 50px -20px rgba(24,21,48,.5);padding:8px;width:252px;max-height:380px;overflow-y:auto}
.colmenu .cm-row{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px}
.colmenu .cm-row:hover{background:#FAFAFD}
.colmenu .cm-name{flex:1;font-size:13px;color:#3a3658}
.colmenu .cm-lock{font-size:10.5px;color:#B6B2CC;text-transform:uppercase;letter-spacing:.04em}
.colmenu input[type=checkbox]{width:15px;height:15px;accent-color:${COBALT};cursor:pointer}
.tbl th{text-align:left;font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#9C98B4;font-weight:500;padding:13px 14px;border-bottom:1px solid #E8E9F2;background:#FBFBFE;cursor:pointer;user-select:none;white-space:nowrap;position:sticky;top:0}
.tbl th .ar{opacity:.4;margin-left:4px}.tbl th.sorted{color:${COBALT}}.tbl th.sorted .ar{opacity:1}
.tbl td{padding:13px 14px;border-bottom:1px solid #F0F0F6;color:#3a3658;white-space:nowrap}
.tbl tbody tr{cursor:pointer}.tbl tbody tr:hover td{background:#FAFAFD}.tbl tr:last-child td{border-bottom:none}
.namecell{font-weight:600;color:${INK}}.subcell{font-size:12px;color:#928DAD}
.due{font-weight:600}.due.over{color:${RED}}.due.today{color:${GOLD}}.due.soon{color:${COBALT}}.due.far{color:#8E89A8}
.toolbar{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.searchbox{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #DEDFEA;border-radius:10px;padding:8px 12px;flex:1;min-width:200px}
.searchbox input{border:none;outline:none;font-size:14px;width:100%;font-family:'Inter';color:${INK}}
.selctl{padding:9px 12px;border:1px solid #DEDFEA;border-radius:10px;font-size:13.5px;font-family:'Inter';background:#fff;color:#56527a;cursor:pointer}
/* kanban (cleaner) */
.kanban{display:flex;gap:14px;overflow-x:auto;padding-bottom:10px;align-items:stretch}
.kcol{background:#fff;border:1px solid #E8E9F2;border-radius:16px;display:flex;flex-direction:column;min-height:140px;overflow:hidden;box-shadow:0 12px 30px -28px rgba(24,21,48,.5);flex:1 0 260px;min-width:260px}
.kcol.drag{outline:2px dashed ${COBALT};outline-offset:-2px}
.kbar{height:4px;width:100%}
.kcol-h{display:flex;align-items:center;justify-content:space-between;padding:13px 14px 4px}
.kcol-h .kt{font-family:'Space Grotesk';font-weight:600;font-size:14px;color:${INK}}
.kcol-h .kc{font-size:11px;font-weight:700;color:#928DAD;background:#F1F2F8;border-radius:20px;padding:2px 9px}
.kcol-v{font-size:11.5px;color:#928DAD;padding:0 14px 10px;font-weight:600}
.kcol-body{padding:6px 10px 12px;flex:1;overflow-y:auto}
.kcard{background:#fff;border:1px solid #E8E9F2;border-radius:12px;padding:12px;margin-bottom:9px;cursor:pointer;box-shadow:0 4px 12px -10px rgba(24,21,48,.5);transition:.14s}
.kcard:hover{box-shadow:0 14px 28px -16px rgba(24,21,48,.5);transform:translateY(-1px);border-color:#D9DBEC}
.kcard .kn{font-weight:600;font-size:14px;color:${INK};display:flex;align-items:center;gap:6px}
.kcard .kco{font-size:12px;color:#777296;margin:2px 0 9px}
.kcard .ktags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px}
.kcard .kmeta{display:flex;align-items:center;justify-content:space-between;gap:6px}
.kdrop{font-size:12px;color:#B6B2CC;text-align:center;padding:16px 0;border:1.5px dashed #E4E5F0;border-radius:10px;margin:2px 4px 8px}
.kcol.drag{outline:2px dashed ${COBALT};outline-offset:-3px;box-shadow:0 0 0 4px rgba(43,77,224,.1),0 12px 30px -22px ${COBALT}}
.kcard.dragging{opacity:.55;transform:rotate(2deg) scale(.98);box-shadow:0 18px 36px -14px rgba(24,21,48,.6)}
.kcard.od{border-left:3px solid ${RED}}
.kcard-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.kown{flex:none;width:22px;height:22px;border-radius:50%;background:${INDIGO};color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:'Space Grotesk'}
.kvals{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.kdv{font-size:12.5px;font-weight:700;color:${INK}}
.kmrr{font-size:10.5px;font-weight:700;color:${GREEN};background:rgba(31,157,85,.1);padding:2px 7px;border-radius:20px}
.kstale{display:inline-flex;align-items:center;gap:4px;margin-top:8px;font-size:10.5px;font-weight:700;color:#A9732B;background:rgba(200,135,40,.12);padding:3px 8px;border-radius:20px}
.kmove{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:10px;padding-top:9px;border-top:1px solid #F1F1F7}
.kmv{flex:none;width:30px;height:28px;border-radius:8px;border:1px solid #E4E5F0;background:#fff;color:${COBALT};display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.13s}
.kmv:hover:not(:disabled){background:${COBALT};color:#fff;border-color:${COBALT}}
.kmv:disabled{color:#D2D2DE;cursor:default}
.kmv-s{flex:1;text-align:center;font-size:10px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#A6A2BC;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kwtd{color:#B6B2CC;font-weight:600}
.kcoll-x{border:none;background:#F1F2F8;color:#928DAD;width:22px;height:22px;border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center}.kcoll-x:hover{background:#E4E5F0}
.kcollapsed{flex:0 0 58px;min-width:58px;max-width:58px;cursor:pointer;align-items:stretch}
.kcollapsed:hover{border-color:#D9DBEC;box-shadow:0 12px 30px -20px rgba(24,21,48,.5)}
.kcoll-body{flex:1;display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px 0}
.kcoll-exp{color:#B6B2CC}
.kcoll-label{writing-mode:vertical-rl;transform:rotate(180deg);font-family:'Space Grotesk';font-weight:600;font-size:13px;color:${INK};letter-spacing:.02em}
/* modal */
.scrim2{position:fixed;inset:0;background:rgba(24,21,48,.5);z-index:50;display:flex;align-items:center;justify-content:center;padding:24px}
.modal{width:960px;max-width:96vw;max-height:90vh;background:#F4F6FB;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 40px 100px -30px rgba(0,0,0,.6);animation:pop .18s ease}
@keyframes pop{from{transform:scale(.97);opacity:.5}to{transform:none;opacity:1}}
.m-head{background:#fff;border-bottom:1px solid #E8E9F2;padding:18px 24px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.m-head h2{font-size:21px;color:${INK}}.m-head .co{font-size:16px;font-weight:500;color:#5A5680;margin-top:4px}
.m-head .meta{font-size:11.5px;color:#A6A2BC;margin-top:6px}
.m-head .qa{display:flex;gap:8px;margin-top:11px;flex-wrap:wrap}
.qbtn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:${COBALT};background:rgba(43,77,224,.08);border:none;border-radius:8px;padding:6px 10px;cursor:pointer;text-decoration:none}
.qbtn:hover{background:rgba(43,77,224,.15)}
.m-x{background:#F0F1F7;border:none;border-radius:9px;width:34px;height:34px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a;flex:none}.m-x:hover{background:#E6E7F1}.m-x:disabled{opacity:.35;cursor:default}
.m-grid{display:grid;grid-template-columns:1.15fr .85fr;overflow:hidden;flex:1;min-height:0}
.m-left{padding:20px 22px;overflow-y:auto}.m-right{padding:20px 22px;overflow-y:auto;background:#fff;border-left:1px solid #E8E9F2;display:flex;flex-direction:column}
@media(max-width:760px){.m-grid{grid-template-columns:1fr;overflow-y:auto}.m-left,.m-right{overflow:visible}.m-right{border-left:none;border-top:1px solid #E8E9F2}}
.dh{font-size:11.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:${COBALT};margin:2px 0 12px;display:flex;align-items:center;gap:8px}.dh.mt{margin-top:22px}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.field label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD;margin-bottom:5px}
.field input,.field select,.field textarea{width:100%;padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13.5px;font-family:'Inter';color:${INK};background:#fff}
.field textarea{resize:vertical}
.field input:focus,.field select:focus,.field textarea:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.field input:focus,.field select:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.field.full{grid-column:1/-1}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chip{font-size:12px;font-weight:600;padding:7px 11px;border-radius:20px;border:1px solid #DEDFEA;background:#fff;color:#56527a;cursor:pointer;transition:.14s;display:inline-flex;align-items:center;gap:6px}
.chip.on{border-color:${COBALT};background:rgba(43,77,224,.1);color:${COBALT}}
.chip.add{border-style:dashed;color:#928DAD}
.toggle{display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13.5px;color:${INK};font-weight:500;margin-top:11px}
.extras{display:flex;flex-direction:column;gap:8px;margin-top:10px}
.extra-row{display:flex;align-items:center;gap:8px}
.extra-row .ex-label{flex:1;padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13px;font-family:'Inter';color:${INK};background:#fff}
.extra-row .ex-label:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.ex-amt-w{display:flex;align-items:center;gap:4px;border:1px solid #DEDFEA;border-radius:9px;padding:0 10px;background:#fff;width:120px}
.ex-amt-w span{color:#928DAD;font-size:13px}
.ex-amt-w:focus-within{border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.ex-amt{border:none;outline:none;width:100%;padding:9px 0;font-size:13.5px;font-family:'Inter';color:${INK};background:transparent}
.ex-del{border:none;background:#F2F2F8;color:#928DAD;width:34px;height:34px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:none}
.ex-del:hover{background:rgba(209,67,67,.1);color:${RED}}
.addline{margin-top:10px;background:none;border:1px dashed #CFD0E0;color:${COBALT};font-weight:600;font-size:12.5px;padding:8px 12px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
.addline:hover{background:rgba(43,77,224,.05);border-color:${COBALT}}
.deal-total{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:11px 13px;background:#F6F7FB;border-radius:10px}
.deal-total span{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD}
.deal-total b{font-family:'Space Grotesk';font-size:17px;color:${INK}}
.sw{width:42px;height:24px;border-radius:14px;background:#D9DAE6;position:relative;transition:.18s;flex:none}.sw.on{background:${GREEN}}
.sw b{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.18s;box-shadow:0 1px 3px rgba(0,0,0,.2)}.sw.on b{left:21px}
.sw.sm{width:34px;height:20px}.sw.sm b{width:14px;height:14px}.sw.sm.on b{left:17px}
/* activity */
.afilter{display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap}
.afilter button{font-size:11.5px;font-weight:600;padding:5px 10px;border-radius:8px;border:1px solid #E4E5F0;background:#fff;color:#8E89A8;cursor:pointer}
.afilter button.on{border-color:${COBALT};background:rgba(43,77,224,.08);color:${COBALT}}
.spon-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:2px}
.spon-tog{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border:1px solid #E1E2EC;border-radius:10px;font-size:13px;font-weight:600;color:#56527a;cursor:pointer;background:#fff}
.spon-tog input{accent-color:${COBALT};width:15px;height:15px;cursor:pointer}
.spon-tog.on{border-color:${COBALT};background:rgba(43,77,224,.08);color:${COBALT}}
.spon-tog.past input{accent-color:${GOLD}}
.spon-tog.past.on{border-color:${GOLD};background:rgba(200,162,74,.12);color:#8a6a1f}
.spon-badge{display:inline-block;font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:rgba(43,77,224,.1);color:${COBALT}}
.spon-badge.past{background:rgba(200,162,74,.16);color:#8a6a1f}
.spon-tog.rel input{accent-color:#7A5CC8}
.spon-tog.rel.on{border-color:#7A5CC8;background:rgba(122,92,200,.1);color:#5b3fa6}
.rel-hint{font-size:11.5px;color:#8b88a0;margin-top:7px;line-height:1.45}
.rel-from{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:7px 11px;border-radius:9px;background:rgba(122,92,200,.08);border:1px solid rgba(122,92,200,.22);color:#5b3fa6;font-size:12.5px;cursor:pointer}
.rel-from:hover{background:rgba(122,92,200,.15)}
.rel-gave{display:flex;align-items:center;gap:7px;margin-top:10px;padding:8px 11px;border-radius:9px;background:#F4F5FA;border:1px solid #E5E6F0;color:#56527a;font-size:12.5px}
.rel-chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;padding:3px 9px;border-radius:20px;background:rgba(122,92,200,.1);color:#5b3fa6}
.rel-ghead{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.rel-gname{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:800;color:#5b3fa6;cursor:pointer}
.rel-gname:hover{text-decoration:underline}
.rel-gname.plain{color:#8b88a0;cursor:default}
.rel-gname.plain:hover{text-decoration:none}
.rel-gcount{font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:#EEF0F7;color:#56527a}
/* collapsible modal sections */
.msecs{margin-top:18px;border-top:1px solid #F0F0F6}
.msec{border-bottom:1px solid #F0F0F6}
.msec-h{display:flex;align-items:center;gap:9px;padding:13px 2px;cursor:pointer;user-select:none}
.msec-h:hover .msec-t{color:${COBALT}}
.msec-t{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${INK};transition:.12s}
.msec-s{margin-left:auto;font-size:12px;color:#9b98ad;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52%}
.msec-ch{color:#c0bdd0;flex:none;transition:transform .16s;margin-left:auto}
.msec-s+.msec-ch{margin-left:6px}
.msec.open .msec-ch{transform:rotate(180deg);color:${COBALT}}
.msec-b{padding:2px 2px 16px}
/* quick add */
.morebtn{display:flex;align-items:center;gap:7px;width:100%;margin-top:16px;padding:11px 12px;border:1px dashed #D6D8E6;border-radius:10px;background:#FAFAFE;color:#56527a;font-size:12.5px;font-weight:700;cursor:pointer}
.morebtn:hover{border-color:${COBALT};color:${COBALT}}
.morebtn i{margin-left:auto;font-style:normal;font-size:11.5px;color:#9b98ad;font-weight:500}
.mb-ch{transition:transform .16s}.mb-ch.on{transform:rotate(180deg)}
.dupe-warn{display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px 12px;border-radius:9px;background:#FFF7ED;border:1px solid #FCD9B6;color:#9a5a16;font-size:12.5px}
.dupe-warn b{cursor:pointer;text-decoration:underline}
/* follow-up block in modal */
.fu-block{background:#FAFAFE;border:1px solid #EDEEF5;border-radius:11px;padding:13px}
.fu-note{width:100%;border:1px solid #E1E2EC;border-radius:9px;padding:9px 11px;font-size:13px;font-family:inherit;color:${INK};resize:vertical;line-height:1.5}
.fu-note:focus{outline:none;border-color:${COBALT}}
.fu-when{margin-top:10px;font-size:11.5px;font-weight:700;color:#1f8a55}
.fu-when.od{color:#b4322e}
.fn-block{background:#FAFAFE;border:1px solid #EDEEF5;border-radius:11px;padding:13px}
.fn-hint{display:flex;align-items:center;gap:5px;margin-top:8px;font-size:11.5px;color:#9b98ad;font-weight:500}
.m-foot{flex:none;background:#fff;border-top:1px solid #E8E9F2;padding:13px 22px;display:flex;align-items:center;gap:10px;box-shadow:0 -6px 20px -12px rgba(0,0,0,.18)}
.m-foot-n{display:flex;align-items:center;gap:5px;margin-left:auto;font-size:12px;color:#8b88a0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
/* follow-up card: plan + next flow */
.fu-plan{display:flex;gap:7px;align-items:flex-start;margin:9px 0 0;padding:8px 10px;background:#FFFDF5;border:1px solid #F0E4C0;border-radius:8px;font-size:12.5px;color:#6a5a2f;line-height:1.45}
.fu-plan svg{flex:none;margin-top:1px;color:#B9932F}
.fu-next{background:#F4F7FF;border:1px solid #D6E0FA;border-radius:10px;padding:11px}
.fu-next-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:${INK};margin-bottom:8px}
.fu-next-h b{color:${COBALT}}
.fu-next-b{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}
.fu-next-note{font-size:11px;color:#9b98ad}
.rel-chain{margin-top:12px;padding:11px 13px;border-radius:10px;background:#F7F8FC;border:1px solid #EDEEF5}
.rc-lbl{font-size:10px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#9b98ad;margin-bottom:7px}
.rc-path{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.rc-node{font-size:12.5px;font-weight:700;color:#5b3fa6;background:rgba(122,92,200,.1);padding:3px 9px;border-radius:20px;cursor:pointer}
.rc-node:hover{background:rgba(122,92,200,.2)}
.rc-node.root{background:rgba(200,162,74,.18);color:#8a6a1f}
.rc-node.self{background:${INK};color:#fff;cursor:default}
.rc-arrow{color:#c7c5d4;flex:none}
.rc-root{margin-top:8px;font-size:12px;color:#8b88a0}
.rc-root b{color:#8a6a1f;cursor:pointer}
.rc-root b:hover{text-decoration:underline}
.web-card{padding:14px}
.web-legend{display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:11.5px;color:#8b88a0;font-weight:600}
.web-legend span{display:inline-flex;align-items:center;gap:5px}
.web-legend i{width:9px;height:9px;border-radius:3px;display:inline-block}
.web-tip{color:#c0bdd0!important;font-weight:500}
.web-trace{font-size:12.5px;color:#56527a;background:#F7F8FC;border:1px solid #EDEEF5;border-radius:9px;padding:8px 12px;margin-bottom:10px;line-height:1.5}
.web-trace b{color:${INK}}
.web-trace span{color:#5b3fa6;font-weight:600;cursor:pointer}
.web-trace span:hover{text-decoration:underline}
.web-scroll{overflow:auto;max-height:66vh;border:1px solid #F0F1F6;border-radius:10px;background:linear-gradient(#FCFCFE,#FCFCFE)}
.web-svg{display:block}
.web-you{fill:${INK}}
.web-youtxt{fill:#fff;font-size:12px;font-weight:700;font-family:'Space Grotesk',sans-serif}
.web-link{fill:none;stroke:#DCDEEA;stroke-width:1.5}
.web-link.you{stroke:#C9CBDA;stroke-dasharray:4 3}
.web-link.on{stroke:${COBALT};stroke-width:2.5}
.web-node{cursor:pointer}
.web-node rect{transition:.12s}
.web-node.dim{opacity:.32}
.web-node:hover rect:first-child{filter:drop-shadow(0 3px 8px rgba(0,0,0,.13))}
.web-name{font-size:12px;font-weight:700;fill:${INK};font-family:'Inter',sans-serif}
.web-co{font-size:9.5px;fill:#9b98ad;font-family:'Inter',sans-serif}
.web-kids{font-size:9.5px;font-weight:700;fill:#56527a}
.scope-seg{flex:none}
.scope-seg button{display:inline-flex;align-items:center;gap:6px}
.scope-seg button i{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border-radius:20px;background:#DFE2EE;color:#56527a;min-width:16px;text-align:center}
.scope-seg button.on i{background:${COBALT};color:#fff}
.claim-btn{display:inline-flex;align-items:center;gap:5px;border:1px solid ${COBALT};background:rgba(43,77,224,.06);color:${COBALT};font-size:11.5px;font-weight:700;padding:5px 11px;border-radius:20px;cursor:pointer;white-space:nowrap}
.claim-btn:hover{background:${COBALT};color:#fff}
.pool-note{display:flex;align-items:center;gap:7px;font-size:12.5px;color:#56527a;background:#F4F5FA;border:1px solid #E5E6F0;border-radius:9px;padding:9px 12px;margin-bottom:12px}
.own-badge{font-size:11px;font-weight:700;padding:2px 9px;border-radius:20px;background:#EEF0F7;color:#4a4763}
.fu-scope{margin-bottom:14px}
.fu-owner{margin-top:8px}
.team-list{display:flex;flex-direction:column;gap:8px}
.team-row{display:flex;align-items:center;gap:11px;padding:10px 12px;border:1px solid #EDEEF5;border-radius:10px;background:#FAFAFE}
.team-av{width:28px;height:28px;border-radius:50%;background:${INK};color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex:none}
.team-name{font-weight:700;color:${INK};font-size:13.5px;flex:1;min-width:0}
.team-seg{flex:none}
.team-seg button{font-size:11.5px;padding:5px 11px}
@media(max-width:640px){.team-row{flex-wrap:wrap}.team-seg{width:100%}.team-seg button{flex:1}}
.imp-sub{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#8b88a0;margin-bottom:8px}
.imp-map{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.imp-row{display:flex;align-items:center;gap:7px;background:#F7F8FC;border:1px solid #EDEEF5;border-radius:9px;padding:7px 10px}
.imp-h{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.imp-row select{border:1px solid #E1E2EC;border-radius:7px;padding:5px 7px;font-size:12px;color:${INK};background:#fff;max-width:130px}
.imp-warn{display:flex;align-items:center;gap:6px;font-size:12px;color:#9a5a16;background:#FFF7ED;border:1px solid #FCD9B6;border-radius:8px;padding:8px 11px;margin-top:10px}
@media(max-width:640px){.imp-map{grid-template-columns:1fr}}
.act-types{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap}
.act-t{font-size:12px;font-weight:600;padding:6px 10px;border-radius:9px;border:1px solid #DEDFEA;background:#fff;color:#56527a;cursor:pointer;display:flex;align-items:center;gap:5px}
.act-t.on{border-color:${COBALT};background:rgba(43,77,224,.08);color:${COBALT}}
.act-input{width:100%;padding:11px 12px;border:1px solid #DEDFEA;border-radius:10px;font-size:13.5px;font-family:'Inter';resize:vertical;min-height:52px}
.act-input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.feed{margin-top:14px;display:flex;flex-direction:column;overflow-y:auto}
.fitem{display:flex;gap:11px;padding:11px 0;border-bottom:1px solid #F0F0F6}.fitem:last-child{border:none}
.fic{width:30px;height:30px;border-radius:8px;background:rgba(43,77,224,.09);color:${COBALT};display:flex;align-items:center;justify-content:center;flex:none}
.fitem.note .fic{background:rgba(200,162,74,.16);color:#9A7B22}
.fitem .ftxt{font-size:13px;color:#3a3658;line-height:1.45}.fitem .fmeta{font-size:11px;color:#A6A2BC;margin-top:3px;font-weight:600}
.fitem .fdel{margin-left:auto;background:none;border:none;color:#C9C5D9;cursor:pointer;padding:3px;flex:none}.fitem .fdel:hover{color:${RED}}
/* settings */
.set-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #F0F0F6}.set-row:last-child{border:none}
.opt-chip{display:inline-flex;align-items:center;gap:7px;background:#F1F2F8;border-radius:8px;padding:6px 8px 6px 11px;font-size:13px;color:#3a3658;margin:0 7px 7px 0}
.opt-chip button{background:none;border:none;color:#A6A2BC;cursor:pointer;display:flex}.opt-chip button:hover{color:${RED}}
.addrow{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.addrow input,.addrow select{padding:9px 11px;border:1px solid #DEDFEA;border-radius:9px;font-size:13.5px;font-family:'Inter'}
.swatch{width:26px;height:26px;border-radius:7px;border:1px solid #E0E0EC;flex:none;cursor:pointer;padding:0}
.logo-drop{border:2px dashed #DEDFEA;border-radius:14px;padding:26px;text-align:center;cursor:pointer;color:#8E89A8;transition:.15s}.logo-drop:hover{border-color:${COBALT};color:${COBALT};background:rgba(43,77,224,.03)}
.logosize{margin-top:14px;max-width:340px}
.logosize-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:7px}
.logosize-h span{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#928DAD}
.logosize-h b{font-family:'Space Grotesk';font-size:13px;color:${INK}}
.logosize input[type=range]{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;background:#E4E5EF;outline:none}
.logosize input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:20px;height:20px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.logosize input[type=range]::-moz-range-thumb{width:20px;height:20px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff}
.note{background:#FBF6E9;border:1px solid #EBDCB5;border-radius:12px;padding:14px 16px;font-size:13px;color:#7a6320;line-height:1.5}.note b{color:#5e4c12}
.convert-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(135deg,rgba(43,77,224,.08),rgba(59,52,112,.08));border:1px solid #D9DCF2;border-radius:14px;padding:14px 16px;margin-bottom:18px}
.convert-banner b{font-family:'Space Grotesk';font-size:15px;color:${INK}}
.deliv{background:#fff;border:1px solid #E8E9F2;border-radius:14px;padding:16px 18px;margin-bottom:18px}
.track{padding:12px 0;border-bottom:1px solid #F0F0F6}.track:last-of-type{border-bottom:none}
.track-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.track-h b{font-family:'Space Grotesk';font-size:14px;color:${INK}}
.track-h .phase{font-size:11.5px;font-weight:600;color:${COBALT};background:rgba(43,77,224,.09);padding:3px 9px;border-radius:20px}
.pbar{height:7px;background:#ECECF4;border-radius:6px;overflow:hidden;margin-bottom:10px}
.pbar>div{height:100%;border-radius:6px;background:linear-gradient(90deg,${COBALT},${GREEN});transition:width .4s}
.mslist{display:flex;flex-direction:column;gap:2px}
.ms{display:flex;align-items:center;gap:9px;padding:7px 6px;border-radius:8px;font-size:13.5px;color:#3a3658}
.ms:hover{background:#FAFAFD}
.ms .mcheck{display:flex;align-items:center;gap:9px;flex:1;cursor:pointer;min-width:0}
.ms .mtxt{flex:1}.ms.on .mtxt{color:#8E89A8;text-decoration:line-through}
.ms.over .mtxt{color:${RED}}
.ms .mdate{font-size:11px;color:#A6A2BC;font-weight:600;white-space:nowrap}
.ms .mdate.done{color:${GREEN}}
.msdue-w{display:flex;align-items:center;gap:6px}
.msdue-l{font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#A6A2BC}
.ms.over .msdue-l{color:${RED}}
.msdue{font-size:11.5px;font-weight:600;color:#56527a;border:1px solid #E0E1EE;border-radius:7px;padding:3px 6px;background:#fff;font-family:inherit;cursor:pointer}
.msdue:hover{border-color:#C9CBE0}
.msdue.over{border-color:${RED};color:${RED};background:rgba(209,67,67,.05)}
.track-h .phase.od{color:${RED};background:rgba(209,67,67,.1)}
.rdot.over{background:${RED};border-color:${RED}}
.od-tag{color:${RED};font-weight:700}.due-tag{color:${COBALT};font-weight:600}
.tbl-cap{padding:14px 16px;border-bottom:1px solid #E8E9F2;font-weight:600;color:${INK};font-family:'Space Grotesk'}
.badge{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:3px 9px;border-radius:20px;white-space:nowrap}
.badge.done{color:${GREEN};background:rgba(31,157,85,.1)}
.badge.over{color:${RED};background:rgba(209,67,67,.1)}
.deliv-done{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(31,157,85,.08);color:#157a41;font-size:12.5px;font-weight:600}
.rtag{display:inline-block;margin-left:8px;font-size:9.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${GREEN};background:rgba(31,157,85,.1);padding:2px 7px;border-radius:20px;vertical-align:middle}
.btn-s{background:#fff;color:${INK};border:1px solid #DEDFEA}.btn-s:hover{background:#F4F5FB;border-color:#CBCDDF}
.inv-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;flex-wrap:wrap}
.seg{display:inline-flex;background:#EEEFF6;border-radius:11px;padding:3px;gap:2px}
.seg-b{border:none;background:none;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:600;color:#56527a;cursor:pointer;font-family:'Inter'}
.seg-b.on{background:#fff;color:${COBALT};box-shadow:0 1px 4px rgba(0,0,0,.08)}
.badge.inv-draft{color:#56527a;background:#EAEBF3}.badge.inv-sent{color:${COBALT};background:rgba(43,77,224,.1)}
.badge.inv-paid{color:${GREEN};background:rgba(31,157,85,.1)}.badge.inv-overdue{color:${RED};background:rgba(209,67,67,.1)}
.inv-modal{width:1080px}
.inv-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.inv-body{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:0;overflow:auto;flex:1}
.inv-edit{padding:20px 22px;overflow:auto;border-right:1px solid #E8E9F2}
.inv-preview-wrap{padding:24px;background:#ECEEF5;overflow:auto;display:flex;flex-direction:column;align-items:center}
.inv-design-stage{border:1px solid #E3E4EE;border-radius:14px;overflow:hidden;margin-top:4px}
.inv-design-stage .inv-preview-wrap{max-height:78vh}
.inv-page-tools{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;width:100%;max-width:660px;margin:0 auto 14px}
.sec-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:#fff;border:1px solid #DEDFEA;border-radius:10px;padding:6px 10px;box-shadow:0 4px 16px -8px rgba(0,0,0,.18)}
.sec-tl{font-size:11px;font-weight:800;color:${INK};letter-spacing:.01em}
.sec-grp{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:700;color:#8b88a0;text-transform:uppercase;letter-spacing:.04em}
.sec-grp .stp{width:22px;height:22px;border-radius:6px;border:1px solid #DEDFEA;background:#F7F8FC;color:${COBALT};font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1}
.sec-grp .stp:hover{background:${COBALT};color:#fff;border-color:${COBALT}}
.sec-grp .val{min-width:30px;text-align:center;font-size:11px;font-weight:700;color:${INK};text-transform:none}
.sec-done{font-size:11px;font-weight:700;color:#fff;background:${COBALT};border:none;border-radius:7px;padding:6px 12px;cursor:pointer}
.sec-hint{font-size:11px;color:#9b98ad;font-weight:500}
.bk-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bk-filters{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 16px}
.bk-chip{padding:7px 14px;border-radius:20px;border:1px solid #E1E2EC;background:#fff;font-size:13px;font-weight:600;color:#56527a;cursor:pointer}
.bk-chip.on{background:${INK};color:#fff;border-color:${INK}}
.bk-yr{margin-left:auto;display:flex;align-items:center;gap:8px}
.bk-yr select{padding:8px 10px;border:1px solid #E1E2EC;border-radius:9px;font-size:13px;font-weight:600;color:${INK};background:#fff}
.tx-type{display:inline-flex;align-items:center;gap:5px;font-weight:600;font-size:12.5px;color:${INK}}
.tx-amt{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;font-size:14px}
.tx-in{color:#1f9d63}.tx-out{color:#b4322e}
.rc-btn{display:inline-flex;align-items:center;gap:4px;color:${COBALT};font-weight:600;font-size:12px;cursor:pointer}
.rc-none{color:#c7c5d4}
.ai-banner{display:flex;align-items:center;gap:8px;border-radius:10px;padding:9px 12px;font-size:12.5px;font-weight:600;margin-bottom:14px}
.ai-reading{background:#EEF2FF;color:#3949c9}
.ai-done{background:#E9F8EF;color:#1f8a55}
.ai-off{background:#FBEFEF;color:#a23b34}
.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.rcfile{display:flex;align-items:center;gap:8px;background:#F4F5FA;border:1px solid #E5E6F0;border-radius:9px;padding:9px 11px;font-size:12.5px;color:${INK};margin-top:10px}
.act-ctrl{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px}
.seg{display:inline-flex;background:#EEF0F7;border-radius:9px;padding:3px}
.seg button{border:none;background:none;padding:6px 13px;border-radius:7px;font-size:12.5px;font-weight:600;color:#56527a;cursor:pointer}
.seg button.on{background:#fff;color:${INK};box-shadow:0 1px 3px rgba(0,0,0,.12)}
.act-nav{display:flex;align-items:center;gap:6px}
.act-nav b{min-width:150px;text-align:center;font-size:13.5px;color:${INK};font-weight:700}
.iconbtn{width:30px;height:30px;border-radius:8px;border:1px solid #E1E2EC;background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a}
.iconbtn:hover{border-color:${COBALT};color:${COBALT}}
.act-feedlist{display:flex;flex-direction:column}
.act-row{display:flex;align-items:flex-start;gap:11px;padding:11px 4px;border-bottom:1px solid #F1F1F6;cursor:pointer}
.act-row:hover{background:#FAFAFE}
.act-ic{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;flex:none}
.act-body{flex:1;min-width:0}
.act-top{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.act-lead{font-weight:700;color:${INK};font-size:13.5px}
.act-txt{color:#56527a;font-size:13px;margin-top:2px;line-height:1.45}
.act-who{font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:#EEF0F7;color:#4a4763}
.act-time{margin-left:auto;font-size:11.5px;color:#9b98ad;white-space:nowrap}
.act-daysep{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#9b98ad;margin:14px 0 4px;padding-top:8px;border-top:1px dashed #E4E5EE}
.act-daysep:first-child{border-top:none;margin-top:0;padding-top:0}
.swapbtn{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#56527a;background:#fff;border:1px solid #DEDFEA;border-radius:8px;padding:6px 11px;cursor:pointer}
.swapbtn:hover{border-color:${COBALT};color:${COBALT}}
.inv-items-edit{display:flex;flex-direction:column;gap:7px}
.iie-h,.iie-row{display:grid;grid-template-columns:1fr 56px 84px 76px 30px;gap:8px;align-items:center}
.iie-h{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#928DAD;padding:0 2px}
.iie-row input{padding:8px 9px;border:1px solid #DEDFEA;border-radius:8px;font-size:13px;font-family:'Inter';color:${INK};background:#fff;width:100%}
.iie-row input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.iie-amt{font-size:13px;font-weight:600;color:${INK};text-align:right}
.inv-preview{background:#fff;border-radius:3px;padding:6.5% 7%;box-shadow:0 14px 50px -16px rgba(0,0,0,.34);color:#3a3850;width:100%;max-width:660px;aspect-ratio:8.5/11;box-sizing:border-box}
.ip-block{position:relative;margin-bottom:20px}
.ip-block:last-child{margin-bottom:0}
.ip-block.dragk{opacity:.4}
.ip-drag{position:absolute;left:-26px;top:1px;width:20px;height:20px;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#C4C1D6;cursor:grab;opacity:0;transition:.13s}
.ip-block:hover .ip-drag{opacity:1}
.ip-drag:hover{color:${COBALT};background:#F1F2F8}
.ip-sec{cursor:pointer;border-radius:5px;transition:box-shadow .12s;outline-offset:3px}
.ip-sec:hover{box-shadow:0 0 0 1px #DCDEEE}
.ip-sec.sel{box-shadow:0 0 0 2px ${COBALT}}
.ip-top{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:14px}
.ip-top .ip-sec{padding:4px 6px;margin:-4px -6px}
.ip-logo{max-height:42px;max-width:190px;object-fit:contain;display:block;margin-bottom:.7em}
.ip-name{font-family:'Space Grotesk';font-size:1.65em;font-weight:600;color:${INK};margin-bottom:.45em;letter-spacing:-.01em}
.ip-bizmeta{font-size:.95em;color:#8b88a0}
.ip-meta{text-align:right;flex:none}
.ip-meta.left{text-align:left}
.ip-title{font-family:'Space Grotesk';font-size:1.4em;font-weight:700;letter-spacing:.16em;color:${COBALT};line-height:1}
.ip-num{font-size:.95em;font-weight:600;color:#8b88a0;margin-top:.3em;letter-spacing:.03em}
.ip-dates{margin-top:.9em;font-size:.95em;color:${INK}}.ip-dates div{display:flex;gap:1.3em;justify-content:flex-end;margin-top:.25em}.ip-meta.left .ip-dates div{justify-content:flex-start}.ip-dates span{color:#aaa6bd;text-transform:uppercase;letter-spacing:.05em;font-size:.82em;font-weight:600}
.ip-stamp{display:inline-block;margin-top:.8em;font-size:.82em;font-weight:700;text-transform:uppercase;letter-spacing:.08em;padding:.25em 1em;border-radius:20px}
.ip-rule{height:1.5px;width:100%;border-radius:2px;margin:0 0 16px;opacity:.9}
.ip-billto{color:#6a6788}
.ip-billto .ip-lbl{font-size:.8em;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#aaa6bd;margin-bottom:.35em}
.ip-billto .ip-btname{font-weight:700;font-size:1.15em;color:${INK};letter-spacing:-.01em}
.ip-table{width:100%;border-collapse:collapse}
.ip-table th{text-align:left;font-size:.78em;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#aaa6bd;border-bottom:1.5px solid ${INK};padding:0 0 .6em}
.ip-table th:nth-child(2),.ip-table th:nth-child(3),.ip-table th:nth-child(4){text-align:right}
.ip-table td{padding:.65em 0;border-bottom:1px solid #F2F2F6;font-variant-numeric:tabular-nums}
.ip-table td:nth-child(2),.ip-table td:nth-child(3),.ip-table td:nth-child(4){text-align:right;white-space:nowrap}
.ip-table td:first-child{padding-right:1.3em;color:${INK}}
.ip-totals{margin-left:auto;width:56%;min-width:200px}
.ip-tr{display:flex;justify-content:space-between;padding:.35em 0;color:#6a6788;font-variant-numeric:tabular-nums}.ip-tr span{color:#9b98ad}.ip-tr b{font-weight:600;color:${INK}}
.ip-grand{border-top:1.5px solid ${INK};margin-top:.45em;padding-top:.7em}.ip-grand span{color:${INK};font-weight:700;font-family:'Space Grotesk';letter-spacing:.01em}.ip-grand b{font-family:'Space Grotesk';font-size:1.32em;color:${COBALT}}
.ip-pay{color:#6a6788;word-break:break-all}.ip-pay a{color:${COBALT};font-weight:600}
.ip-notes{padding-top:12px;border-top:1px solid #F2F2F6;color:#9b98ad;white-space:pre-wrap}
.acc-row{display:flex;gap:8px;align-items:center}
.acc-row input[type=color]{width:42px;height:38px;padding:2px;border:1px solid #DEDFEA;border-radius:9px;background:#fff;cursor:pointer;flex:none}
.acc-row input:not([type=color]){flex:1}
.invrange{width:100%;-webkit-appearance:none;appearance:none;height:6px;border-radius:6px;background:#E4E5EF;outline:none;margin-top:8px}
.invrange::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.2)}
.invrange::-moz-range-thumb{width:18px;height:18px;border-radius:50%;background:${COBALT};cursor:pointer;border:3px solid #fff}
.inv-toggles{display:flex;flex-wrap:wrap;gap:18px;margin-top:14px}
.invtog{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:${INK};cursor:pointer}
.invtog input{width:16px;height:16px;accent-color:${COBALT};cursor:pointer}
@media print{
  body *{visibility:hidden!important}
  #invprint,#invprint *{visibility:visible!important}
  #invprint{position:absolute!important;left:0;top:0;width:100%;box-shadow:none!important;border-radius:0!important;padding:0!important}
  .scrim2{position:static!important;background:none!important;padding:0!important}
  .ip-drag,.inv-page-tools{display:none!important}
  .ip-sec{box-shadow:none!important;cursor:default!important}
  #invprint{box-shadow:none!important;min-height:0!important;padding:0!important}
}
.fu-hero{display:flex;align-items:center;gap:22px;background:linear-gradient(120deg,${INDIGO} 0%,${COBALT} 100%);border-radius:18px;padding:22px 26px;margin-bottom:22px;color:#fff;box-shadow:0 14px 40px -20px ${COBALT}}
.fu-hero-l{flex:none}.fu-hero-n{font-family:'Space Grotesk';font-size:46px;font-weight:600;line-height:1}
.fu-hero-lbl{font-size:13px;color:rgba(255,255,255,.78);margin-top:2px}
.fu-hero-stats{display:flex;flex-wrap:wrap;gap:9px;flex:1}
.fu-stat{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;background:rgba(255,255,255,.14);padding:6px 12px;border-radius:20px;color:#fff}
.fu-stat b{font-weight:700}.fu-stat.od{background:rgba(255,255,255,.16)}.fu-stat.od svg{color:#FFC9C9}.fu-stat.done svg{color:#9DEFC0}
.fu-ring{width:70px;height:70px;border-radius:50%;background:conic-gradient(#fff calc(var(--p,0)*1%),rgba(255,255,255,.22) 0);display:flex;align-items:center;justify-content:center;flex:none}
.fu-ring span{width:54px;height:54px;border-radius:50%;background:${INDIGO};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;font-family:'Space Grotesk';color:#fff}
.fu-band{display:flex;align-items:center;gap:8px;font-family:'Space Grotesk';font-weight:600;font-size:13px;color:${INK};margin:18px 0 12px;text-transform:uppercase;letter-spacing:.04em}
.fu-band.od{color:${RED}}
.fu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.fu-card{background:#fff;border:1px solid #E8E9F2;border-radius:14px;padding:16px;cursor:pointer;transition:transform .18s,box-shadow .18s,opacity .42s,scale .42s;display:flex;flex-direction:column;gap:11px}
.fu-card:hover{transform:translateY(-3px);box-shadow:0 14px 30px -18px rgba(24,21,48,.4);border-color:#D9DBEC}
.fu-card.od{border-left:4px solid ${RED}}
.fu-card.leaving{opacity:0;scale:.88;transform:translateX(60px);pointer-events:none}
.fu-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.fu-name{font-family:'Space Grotesk';font-weight:600;font-size:15px;color:${INK};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fu-meta{font-size:12.5px;color:#6a6788}
.fu-act{display:flex;flex-direction:column;gap:10px;border-top:1px solid #F0F0F6;padding-top:11px}
.fu-quick{display:flex;gap:8px}
.fu-ic{width:34px;height:34px;border-radius:9px;background:#F4F5FB;color:${COBALT};display:flex;align-items:center;justify-content:center;text-decoration:none;transition:.14s}
.fu-ic:hover{background:${COBALT};color:#fff}
.fu-chips{display:flex;flex-wrap:wrap;gap:7px}
.fu-chip{position:relative;border:1px solid #DEDFEA;background:#fff;color:${INK};font-size:12px;font-weight:600;font-family:'Inter';padding:7px 11px;border-radius:9px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:.14s}
.fu-chip:hover{border-color:${COBALT};background:rgba(43,77,224,.06);color:${COBALT}}
.fu-date{padding:7px 10px;color:#56527a}
.fu-date input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.fu-done{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:70px 20px}
.fu-done-burst{position:relative;margin-bottom:10px}
.fu-done-ring{width:108px;height:108px;border-radius:50%;background:rgba(31,157,85,.1);display:flex;align-items:center;justify-content:center}
.fu-done-burst .s1,.fu-done-burst .s2,.fu-done-burst .s3{position:absolute;color:${GOLD};animation:twk 1.8s ease-in-out infinite}
.fu-done-burst .s1{top:-4px;right:6px;animation-delay:0s}.fu-done-burst .s2{bottom:6px;left:-2px;color:${COBALT};animation-delay:.5s}.fu-done-burst .s3{top:18px;right:-8px;color:${GREEN};animation-delay:1s}
@keyframes twk{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.15)}}
.fu-done h2{font-family:'Space Grotesk';font-size:24px;color:${INK};margin:14px 0 6px}
.fu-done p{font-size:14px;color:#6a6788;max-width:420px;line-height:1.5}
.linkbtn{background:none;border:none;color:#A6A2BC;font-size:12px;font-weight:600;cursor:pointer;padding:8px 0 0;margin-top:6px}.linkbtn:hover{color:${RED}}
.cli-prog{display:flex;align-items:center;gap:10px;min-width:160px}
.cli-prog .pbar{flex:1;margin-bottom:0}.cli-prog .pp{font-size:12px;font-weight:600;color:${INK};min-width:34px}
.rmap-board{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(152px,1fr);gap:10px;overflow-x:auto;padding-bottom:6px;margin-bottom:18px}
.rmap-col{background:#F6F7FB;border-radius:12px;padding:8px;min-height:60px}
.rmap-colh{display:flex;justify-content:space-between;font-size:11px;font-weight:700;color:#56527a;padding:4px 6px 10px;text-transform:uppercase;letter-spacing:.04em}
.rmap-colh span{color:#928DAD}
.rmap-card{background:#fff;border:1px solid #E8E9F2;border-radius:10px;padding:10px;margin-bottom:8px;cursor:pointer}
.rmap-card:hover{border-color:#D9DBEC}
.rc-n{font-weight:600;font-size:13px;color:${INK}}.rc-ph{font-size:11px;color:#777296;margin-top:4px}
.rmap-empty{text-align:center;color:#C9C5D9;font-size:12px;padding:6px}
.rmap-rows{border-top:1px solid #F0F0F6}
.rmap-row{display:flex;align-items:center;gap:16px;padding:12px 4px;border-bottom:1px solid #F0F0F6;cursor:pointer}
.rmap-row:last-child{border-bottom:none}.rmap-row:hover{background:#FAFAFD}
.rr-name{width:180px;flex:none}
.rr-tracks{display:flex;gap:22px;flex-wrap:wrap}
.rr-track{display:flex;align-items:center;gap:9px}
.rr-tl{font-size:10.5px;font-weight:700;color:#928DAD;text-transform:uppercase;letter-spacing:.04em;min-width:64px}
.rr-dots{display:flex;gap:6px}
.rdot{width:11px;height:11px;border-radius:50%;background:#E4E4EE;border:1px solid #D2D2E0}
.rdot.on{background:${GREEN};border-color:${GREEN}}
.iconbtn{background:#F1F2F8;border:none;border-radius:7px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:#56527a;flex:none}.iconbtn:hover{background:#E6E7F1}.iconbtn:disabled{opacity:.35;cursor:default}
@media(max-width:820px){
  .sb{position:fixed;left:0;top:0;transform:translateX(-100%);transition:transform .25s;box-shadow:0 0 60px rgba(0,0,0,.4)}.sb.open{transform:none}.hamb{display:block}
  .m-grid{grid-template-columns:1fr;overflow-y:auto}
  .m-left,.m-right{overflow:visible}
  .m-right{border-left:none;border-top:1px solid #E8E9F2}
  .modal{max-height:94vh}
  .m-foot{padding:11px 16px;flex-wrap:wrap}
  .m-foot-n{width:100%;margin-left:0;white-space:normal}
  .scrim{display:block;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:25}.body{padding:18px}.top{padding:14px 18px}.fgrid{grid-template-columns:1fr}
}
`;

/* ===================== small UI ===================== */
const StageBadge=({k,stages})=>{const s=sOf(k,stages);return <span className="pill" style={{background:s.color+'1A',color:s.color}}><span className="dot" style={{background:s.color}}/>{s.label}</span>;};
const PriBadge=({p})=>{const x=PRIORITIES[p]||PRIORITIES.medium;return <span className="pill" style={{background:x.bg,color:x.color}}><Flag size={11}/>{x.label}</span>;};
const Due=({iso})=>{if(!iso)return <span className="subcell">—</span>;const d=daysUntil(iso);let c='far',t=fmtDate(iso);if(d<0){c='over';t='Overdue · '+fmtDate(iso);}else if(d===0){c='today';t='Today';}else if(d<=7){c='soon';t=fmtDate(iso);}return <span className={'due '+c}>{t}</span>;};
const tipStyle={borderRadius:10,border:'1px solid #E8E9F2',fontFamily:'Inter',fontSize:12,boxShadow:'0 8px 24px -12px rgba(0,0,0,.3)'};
const Brand=({logo,sub,size})=>(<div className="sb-brand">{logo?<img src={logo} alt="ProyTech" style={{maxHeight:size||34,maxWidth:(size||34)*5}}/>:<><span className="nucleus"/><div><b>ProyTech</b><span>{sub}</span></div></>}</div>);

/* ===================== login ===================== */
function Login(){
  const [u,setU]=useState('');const [p,setP]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false);
  const go=async()=>{ if(!u||!p){setErr('Enter your username and password.');return;} setBusy(true);setErr(''); try{ const {error}=await auth.login(u,p); if(error)setErr('Wrong username or password.'); }catch(e){ setErr('Could not sign in. Check your connection.'); } setBusy(false); };
  return (<><style>{CSS}</style><div className="gate"><div className="gate-card">
    <span className="nucleus" style={{width:18,height:18,margin:'0 auto 12px',display:'block'}}/>
    <h2>{BRAND.title}</h2><p>Sign in</p>
    <input placeholder="Username" value={u} autoFocus autoCapitalize="none" autoCorrect="off" onChange={e=>{setU(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&go()}/>
    <input type="password" placeholder="Password" value={p} onChange={e=>{setP(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&go()}/>
    {err&&<div className="gate-err">{err}</div>}
    <button className="btn btn-p" style={{width:'100%',justifyContent:'center'}} disabled={busy} onClick={go}><Lock size={15}/>{busy?'Signing in…':'Sign in'}</button>
  </div></div></>);
}

/* ===================== main ===================== */
export default function App(){
  const [session,setSession]=useState(undefined);
  const [bootErr,setBootErr]=useState(false);
  const sessionResolved=React.useRef(false);
  const [loaded,setLoaded]=useState(false);
  const [leads,setLeads]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [txns,setTxns]=useState([]);
  const [tasks,setTasks]=useState([]);
  const [invId,setInvId]=useState(null);
  const [settings,setSettings]=useState({logo:'',logoSize:34,options:DEFAULT_OPTIONS,stages:DEFAULT_STAGES,customFields:[],leadColumns:DEFAULT_LEAD_COLS,deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:DEFAULT_INVOICING,team:DEFAULT_TEAM});
  const [page,setPage]=useState('dash');
  const [sbOpen,setSbOpen]=useState(false);
  const [activeId,setActiveId]=useState(null);
  const [navIds,setNavIds]=useState(null);
  const openLead=(id,order)=>{ setActiveId(id); setNavIds(order&&order.length?order:null); };

  useEffect(()=>{ const ok=s=>{sessionResolved.current=true;setSession(s||null);};
    auth.session().then(ok).catch(()=>ok(null));
    const {data:sub}=auth.onChange(ok);
    const wd=setTimeout(()=>{ if(!sessionResolved.current) setBootErr(true); },8000);
    return ()=>{clearTimeout(wd);sub?.subscription?.unsubscribe?.();}; },[]);

  useEffect(()=>{ if(!session){setLoaded(false);return;} (async()=>{
    try{
      let s=await db.getLeads(); let st=await db.getSettings();
      let iv=[]; try{ if(typeof db.getInvoices==='function') iv=await db.getInvoices(); }catch(err){ console.error('invoices load failed',err); }
      let tx=[]; try{ if(typeof db.getTxns==='function') tx=await db.getTxns(); }catch(err){ console.error('txns load failed',err); }
      let tk=[]; try{ if(typeof db.getTasks==='function') tk=await db.getTasks(); }catch(err){ console.error('tasks load failed',err); }
      if(!s||!s.length){ s=seed(); await db.upsertMany(s); }
      if(!st){ st={logo:'',logoSize:34,options:DEFAULT_OPTIONS,stages:DEFAULT_STAGES,customFields:[],leadColumns:DEFAULT_LEAD_COLS,deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:DEFAULT_INVOICING,team:DEFAULT_TEAM}; await db.saveSettings(st); }
      setLeads(s); setInvoices(Array.isArray(iv)?iv:[]); setTxns(Array.isArray(tx)?tx:[]); setTasks(Array.isArray(tk)?tk:[]);
      setSettings({logo:st.logo||'',logoSize:st.logoSize||34,options:{...DEFAULT_OPTIONS,...(st.options||{})},stages:st.stages?.length?st.stages:DEFAULT_STAGES,customFields:st.customFields||[],team:st.team||DEFAULT_TEAM,leadColumns:st.leadColumns||DEFAULT_LEAD_COLS,deliveryTracks:st.deliveryTracks?.length?st.deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:{...DEFAULT_INVOICING,...(st.invoicing||{}),biz:{...DEFAULT_INVOICING.biz,...((st.invoicing||{}).biz||{})}}});
      setLoaded(true);
    }catch(e){ console.error(e); window.alert('Could not load data: '+(e.message||e)); }
  })(); },[session]);

  const stages=settings.stages?.length?settings.stages:DEFAULT_STAGES;
  const me=cap(auth.username(session))||BRAND.team[0]||'';
  /* relationships are people, not deals — keep them out of the sales views */
  const bizLeads=useMemo(()=>leads.filter(l=>!l.isRelationship),[leads]);
  const saveLeads=async n=>{ setLeads(n); try{ await db.deleteAll(); await db.upsertMany(n); }catch(e){ console.error(e); window.alert('Save failed: '+(e.message||e)); } };
  const settingsTimer=React.useRef(null);
  const saveSettings=n=>{ setSettings(n); if(settingsTimer.current)clearTimeout(settingsTimer.current); settingsTimer.current=setTimeout(()=>{ db.saveSettings(n).catch(console.error); },700); };
  const saveInvoices=n=>{ setInvoices(n); if(typeof db.saveInvoices==='function') db.saveInvoices(n).catch(console.error); };
  const saveTxns=n=>{ setTxns(n); if(typeof db.saveTxns==='function') db.saveTxns(n).catch(console.error); };
  const upsertTxn=t=>{ const exists=txns.some(x=>x.id===t.id); saveTxns(exists?txns.map(x=>x.id===t.id?t:x):[t,...txns]); };
  const deleteTxn=t=>{ saveTxns(txns.filter(x=>x.id!==t.id)); if(t.receipt?.path&&typeof db.removeReceipt==='function') db.removeReceipt(t.receipt.path).catch(console.error); };
  const saveTasks=n=>{ setTasks(n); if(typeof db.saveTasks==='function') db.saveTasks(n).catch(console.error); };
  const upsertTask=t=>{ const exists=tasks.some(x=>x.id===t.id); saveTasks(exists?tasks.map(x=>x.id===t.id?t:x):[t,...tasks]); };
  const deleteTask=id=>{ saveTasks(tasks.filter(x=>x.id!==id)); };
  const upsertInvoice=inv=>{ const exists=invoices.some(x=>x.id===inv.id); saveInvoices(exists?invoices.map(x=>x.id===inv.id?inv:x):[inv,...invoices]); };
  const deleteInvoice=id=>{ saveInvoices(invoices.filter(x=>x.id!==id)); setInvId(null); };
  const newInvoice=(lead)=>{ const ivset=settings.invoicing||DEFAULT_INVOICING; const number=(ivset.prefix||'INV-')+String(ivset.seq||1).padStart(4,'0'); saveSettings({...settings,invoicing:{...ivset,seq:(ivset.seq||1)+1}}); const issue=todayISO(); const inv={ id:uid(), number, clientId:lead?lead.id:'', billTo:lead?{name:lead.name||'',company:lead.company||'',email:lead.email||'',address:''}:{name:'',company:'',email:'',address:''}, issueDate:issue, dueDate:addDays(issue,ivset.terms||14), items:lead?itemsFromLead(lead):[{id:uid(),label:'',qty:1,amount:0}], taxRate:num(ivset.taxRate), notes:ivset.notes||'', paymentLink:ivset.paymentLink||'', status:'draft', paidDate:'', createdAt:new Date().toISOString() }; upsertInvoice(inv); setInvId(inv.id); };
  const addOption=(listKey,val)=>{const v=(val||'').trim();if(!v)return;const cur=settings.options[listKey]||[];if(cur.includes(v))return;saveSettings({...settings,options:{...settings.options,[listKey]:[...cur,v]}});};

  const updateLead=(id,patch)=>{ let updated=null; setLeads(leads.map(l=>{
    if(l.id!==id) return l; const m={...l,...patch};
    if(patch.stage&&patch.stage!==l.stage){
      m.activities=[{id:uid(),ts:new Date().toISOString(),type:'Note',text:`Stage moved: ${sOf(l.stage,stages).label} → ${sOf(patch.stage,stages).label}`},...l.activities];
      if(sOf(patch.stage,stages).won&&!l.closedAt) m.closedAt=todayISO();
    }
    if(patch.retainerActive&&!l.retainerActive&&!l.retainerStart) m.retainerStart=todayISO();
    updated=m; return m;
  })); if(updated) db.upsertLead(updated).catch(console.error); };
  const addActivity=(id,type,text,who)=>{if(!text.trim())return; let updated=null; setLeads(leads.map(l=>{ if(l.id!==id)return l; updated={...l,activities:[{id:uid(),ts:new Date().toISOString(),type,text:text.trim(),who:who||me},...l.activities]}; return updated; })); if(updated) db.upsertLead(updated).catch(console.error); };
  const delActivity=(id,aid)=>{ let updated=null; setLeads(leads.map(l=>{ if(l.id!==id)return l; updated={...l,activities:l.activities.filter(a=>a.id!==aid)}; return updated; })); if(updated) db.upsertLead(updated).catch(console.error); };
  const delLead=id=>{ setLeads(leads.filter(l=>l.id!==id)); db.deleteLead(id).catch(console.error); setActiveId(null); };
  const createNew=lead=>{ setLeads([lead,...leads]); db.upsertLead(lead).catch(console.error); setActiveId(lead.id); };
  const importLeads=arr=>{ if(!arr||!arr.length)return; setLeads([...arr,...leads]); (async()=>{ try{ await db.upsertMany(arr); }catch(e){ console.error(e); window.alert('Some imported leads may not have saved: '+(e.message||e)); } })(); };
  const convertToClient=id=>{ const l=leads.find(x=>x.id===id); if(!l)return; const updated={...l,isClient:true,convertedAt:todayISO(),delivery:l.delivery||{},activities:[{id:uid(),ts:new Date().toISOString(),type:'Note',text:'Converted to client — delivery started.',who:me},...l.activities]}; setLeads(leads.map(x=>x.id===id?updated:x)); db.upsertLead(updated).catch(console.error); };
  const revertClient=id=>{ const l=leads.find(x=>x.id===id); if(!l)return; const updated={...l,isClient:false}; setLeads(leads.map(x=>x.id===id?updated:x)); db.upsertLead(updated).catch(console.error); };
  const toggleMilestone=(id,trackKey,milestone)=>{ const l=leads.find(x=>x.id===id); if(!l)return; const d={...(l.delivery||{})}; const tr={...(d[trackKey]||{})}; const cur=normEntry(tr[milestone]); const next={done:cur.done?null:todayISO(),due:cur.due||null}; if(!next.done&&!next.due) delete tr[milestone]; else tr[milestone]=next; d[trackKey]=tr; const patch={delivery:d}; const o=clientOverall({...l,delivery:d},settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS); const won=(stages||[]).find(s=>s.won); if(o.delivered&&won&&l.stage!==won.key) patch.stage=won.key; updateLead(id,patch); };
  const setMilestoneDue=(id,trackKey,milestone,date)=>{ const l=leads.find(x=>x.id===id); if(!l)return; const d={...(l.delivery||{})}; const tr={...(d[trackKey]||{})}; const cur=normEntry(tr[milestone]); const next={done:cur.done||null,due:date||null}; if(!next.done&&!next.due) delete tr[milestone]; else tr[milestone]=next; d[trackKey]=tr; updateLead(id,{delivery:d}); };
  const active=activeId&&activeId!=='new'?leads.find(l=>l.id===activeId):null;

  if(!configured) return (<><style>{CSS}</style><div className="gate"><div className="gate-card">
    <span className="nucleus" style={{width:18,height:18,margin:'0 auto 10px',display:'block'}}/>
    <h2>{BRAND.title}</h2>
    <p style={{color:'#b4322e',lineHeight:1.5}}>This deployment isn't connected to a database yet. Add <b>VITE_SUPABASE_URL</b> and <b>VITE_SUPABASE_KEY</b> in Vercel → Settings → Environment Variables, then redeploy.</p>
  </div></div></>);
  if(session===undefined) return (<><style>{CSS}</style><div className="gate"><div className="gate-card"><span className="nucleus" style={{width:18,height:18,margin:'0 auto 10px',display:'block'}}/><h2>{BRAND.title}</h2>{bootErr?<><p style={{color:'#b4322e',lineHeight:1.5}}>Can't reach the database. Your Supabase project may be paused — open the Supabase dashboard and restore it, then retry.</p><button className="btn btn-p" style={{width:'100%',justifyContent:'center',marginTop:6}} onClick={()=>window.location.reload()}>Retry</button></>:<p>Loading…</p>}</div></div></>);
  if(!session) return <Login/>;

  const NAV=[['dash','Dashboard',<LayoutDashboard size={18}/>],['followup','Follow-Up',<Bell size={18}/>],['tasks','Tasks',<ListTodo size={18}/>],['activity','Activity',<List size={18}/>],['pipeline','Pipeline',<KanbanSquare size={18}/>],['leads','Leads',<Contact2 size={18}/>],['rels','Relationships',<Users size={18}/>],['clients','Clients',<Building2 size={18}/>],['invoices','Invoices',<Receipt size={18}/>],['books','The Books',<BookText size={18}/>],['money','Money',<DollarSign size={18}/>],['settings','Settings',<Settings size={18}/>]];
  const titles={dash:['Dashboard','The whole board at a glance'],followup:['Follow-Up',"Clear every lead that's due or overdue"],tasks:['Tasks','AI-ranked to-dos for you & Logan'],activity:['Activity','Who did what — calls, texts, meetings & notes'],pipeline:['Pipeline','Drag a card to move a deal'],leads:['Leads','Every contact, every conversation'],rels:['Relationships','The people in your corner — and who introduced them'],clients:['Clients','Closed deals & monthly retainers'],invoices:['Invoices','Create, send & track payments'],books:['The Books','Money in, money out, draws & receipts'],money:['Money','Revenue, MRR, forecast & attribution'],settings:['Settings','Customize the CRM · back up your data']};

  return (<><style>{CSS}</style><div className="pt">
    {sbOpen&&<div className="scrim" onClick={()=>setSbOpen(false)}/>}
    <aside className={'sb '+(sbOpen?'open':'')}>
      <Brand logo={settings.logo} size={settings.logoSize||34} sub="Client CRM"/>
      {NAV.map(([k,l,ic])=><button key={k} className={'nav-i '+(page===k?'on':'')} onClick={()=>{setPage(k);setSbOpen(false);}}>{ic}{l}</button>)}
      <button className="nav-i" style={{marginTop:8,background:'rgba(43,77,224,.16)',color:'#fff'}} onClick={()=>setActiveId('new')}><Plus size={18}/>New Lead</button>
      <button className="nav-i" onClick={()=>auth.logout()}><LogOut size={18}/>Sign out ({me})</button>
      <div className="sb-foot"><b>{BRAND.tagline}</b><br/>{BRAND.taglineSub}</div>
    </aside>
    <div className="main">
      <div className="top">
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <button className="hamb" onClick={()=>setSbOpen(true)}><Menu size={22}/></button>
          <div><h1>{(titles[page]||[page,''])[0]}</h1><div className="sub">{(titles[page]||['',''])[1]}</div></div>
        </div>
        <button className="btn btn-p" onClick={()=>setActiveId('new')}><Plus size={16}/>New Lead</button>
      </div>
      <div className="body">
        {!loaded?<div className="empty">Loading…</div>:
          page==='dash'?<Dashboard leads={bizLeads} stages={stages} open={openLead}/>:
          page==='followup'?<FollowUp leads={leads} stages={stages} open={openLead} updateLead={updateLead} me={me} settings={settings} addActivity={addActivity}/>:
          page==='tasks'?<Tasks tasks={tasks} leads={leads} me={me} upsertTask={upsertTask} deleteTask={deleteTask} saveTasks={saveTasks}/>:
          page==='activity'?<Activity leads={leads} tasks={tasks} me={me} open={openLead}/>:
          page==='pipeline'?<Pipeline leads={bizLeads} stages={stages} open={openLead} updateLead={updateLead}/>:
          page==='leads'?<Leads leads={bizLeads} settings={settings} stages={stages} open={openLead} saveSettings={saveSettings} importLeads={importLeads} me={me} updateLead={updateLead}/>:
          page==='rels'?<Relationships leads={leads} open={openLead}/>:
          page==='clients'?<Clients leads={bizLeads} stages={stages} settings={settings} open={openLead}/>:
          page==='invoices'?<Invoices invoices={invoices} leads={bizLeads} settings={settings} onNew={newInvoice} open={id=>setInvId(id)}/>:
          page==='books'?<Books txns={txns} upsertTxn={upsertTxn} deleteTxn={deleteTxn}/>:
          page==='money'?<Money leads={bizLeads} stages={stages}/>:
          <SettingsPage settings={settings} saveSettings={saveSettings} leads={leads} saveLeads={saveLeads} invoices={invoices} saveInvoices={saveInvoices}/>}
      </div>
    </div>
    {(active||activeId==='new')&&<Modal key={activeId} lead={active} isNew={activeId==='new'} settings={settings} stages={stages} addOption={addOption} me={me} allLeads={leads} navList={(navIds&&navIds.length?navIds:leads.map(l=>l.id))} onNav={id=>setActiveId(id)} convertToClient={convertToClient} revertClient={revertClient} toggleMilestone={toggleMilestone} setMilestoneDue={setMilestoneDue} onClose={()=>setActiveId(null)} updateLead={updateLead} addActivity={addActivity} delActivity={delActivity} delLead={delLead} createNew={createNew}/>}
    {invId&&(()=>{const inv=invoices.find(x=>x.id===invId);return inv?<InvoiceModal key={invId} invoice={inv} leads={leads} settings={settings} saveSettings={saveSettings} onSave={upsertInvoice} onDelete={deleteInvoice} onClose={()=>setInvId(null)}/>:null;})()}
  </div></>);
}

/* ===================== metrics ===================== */
function useMetrics(leads,stages){
  return useMemo(()=>{
    const byStage={}; stages.forEach(s=>byStage[s.key]={count:0,value:0});
    let openCount=0,openValue=0,weighted=0,wonCount=0,wonValue=0,lostCount=0,mrr=0,retainers=0;
    leads.forEach(l=>{const s=sOf(l.stage,stages);byStage[l.stage]=byStage[l.stage]||{count:0,value:0};byStage[l.stage].count++;byStage[l.stage].value+=num(l.dealValue);
      if(s.open){openCount++;openValue+=num(l.dealValue);weighted+=num(l.dealValue)*num(s.prob);}
      if(s.won){wonCount++;wonValue+=num(l.dealValue);} if(s.lost) lostCount++;
      if(l.retainerActive){mrr+=num(l.retainer);retainers++;}});
    const overdue=leads.filter(l=>l.followUp&&daysUntil(l.followUp)<0&&sOf(l.stage,stages).open);
    const dueWeek=leads.filter(l=>{const d=l.followUp?daysUntil(l.followUp):null;return d!==null&&d>=0&&d<=7&&sOf(l.stage,stages).open;});
    const hot=leads.filter(l=>l.priority==='high'&&sOf(l.stage,stages).open);
    const winRate=(wonCount+lostCount)>0?wonCount/(wonCount+lostCount):0;
    const avgDeal=wonCount>0?wonValue/wonCount:0; const avgRet=retainers>0?mrr/retainers:0;
    return {byStage,openCount,openValue,weighted,wonCount,wonValue,lostCount,mrr,retainers,overdue,dueWeek,hot,winRate,avgDeal,avgRet};
  },[leads,stages]);
}

/* ===================== DASHBOARD ===================== */
/* ===================== FOLLOW-UP ===================== */
function FollowUp({leads,stages,open,updateLead,me,settings,addActivity}){
  const [leaving,setLeaving]=useState({});
  const [cleared,setCleared]=useState(0);
  const t=todayISO();
  const canAll=teamAccess(settings,me)==='all';
  const [view,setView]=useState('mine');
  useEffect(()=>{ if(!canAll&&view==='all') setView('mine'); },[canAll,view]);
  const isDue=l=>l.followUp&&daysUntil(l.followUp)<=0;
  const counts={mine:leads.filter(l=>isDue(l)&&l.owner===me).length,pool:leads.filter(l=>isDue(l)&&l.owner===POOL_OWNER).length,all:leads.filter(isDue).length};
  const due=scopeLeads(leads,view,me).filter(isDue).sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||''));
  const ids=due.map(l=>l.id);
  const overdue=due.filter(l=>daysUntil(l.followUp)<0);
  const today=due.filter(l=>daysUntil(l.followUp)===0);
  const remaining=due.length;
  const total=remaining+cleared;
  const pct=total?Math.round(cleared/total*100):0;
  /* FUB-style: the note lives with the date. Clearing a follow-up auto-logs the
     old note to the activity feed, then asks for the next date + next note. */
  const [pending,setPending]=useState(null); // {id,date,note}
  const startNext=(l,date)=>{ if(leaving[l.id]||!date)return; setPending({id:l.id,date,note:''}); };
  const confirmNext=l=>{
    const p=pending; if(!p||p.id!==l.id)return;
    const old=(l.nextSteps||'').trim();
    if(addActivity) addActivity(l.id,'Note',old?`Follow-up done — ${old}`:'Follow-up cleared.',me);
    setPending(null);
    setLeaving(s=>({...s,[l.id]:true})); setCleared(c=>c+1);
    setTimeout(()=>updateLead(l.id,{followUp:p.date,nextSteps:p.note.trim()}),430);
  };
  const QUICK=[['Tomorrow',1],['+3 days',3],['Next week',7],['+2 weeks',14]];
  const Card=({l})=>{ const d=daysUntil(l.followUp); const od=d<0; const lv=!!leaving[l.id];
    const lastTouch=(l.activities||[]).find(a=>a.type&&a.type!=='Note');
    const pend=pending&&pending.id===l.id?pending:null;
    return (<div className={'fu-card'+(od?' od':'')+(lv?' leaving':'')} onClick={()=>!lv&&!pend&&open(l.id,ids)}>
      <div className="fu-top">
        <div style={{minWidth:0}}><div className="fu-name">{l.name||'(no name)'}</div><div className="subcell">{l.company||l.businessType||'—'}</div></div>
        <span className={'badge '+(od?'inv-overdue':'inv-sent')}>{od?Math.abs(d)+'d overdue':'Due today'}</span>
      </div>
      {view!=='mine'&&<div className="fu-owner">{l.owner===POOL_OWNER?<button className="claim-btn" onClick={e=>{e.stopPropagation();updateLead(l.id,{owner:me});}}><UserCheck size={13}/>Claim</button>:<span className="own-badge">{l.owner||'—'}</span>}</div>}
      {l.nextSteps?<div className="fu-plan"><StickyNote size={13}/><span>{l.nextSteps}</span></div>:null}
      <div className="fu-meta">{l.nextAction||'Follow up'}{lastTouch?' · last touch '+fmtDate(lastTouch.ts):''}</div>
      <div className="fu-act" onClick={e=>e.stopPropagation()}>
        {pend?(<div className="fu-next">
          <div className="fu-next-h"><CheckCircle2 size={13} color={GREEN}/>Next follow-up <b>{fmtDate(pend.date)}</b></div>
          <textarea className="fu-note" rows={2} autoFocus placeholder="What's the plan for next time? (optional)" value={pend.note} onChange={e=>setPending({...pend,note:e.target.value})} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))confirmNext(l);}}/>
          <div className="fu-next-b">
            <button className="btn btn-p btn-sm" onClick={()=>confirmNext(l)}><CheckCircle2 size={14}/>Save &amp; clear</button>
            <button className="btn btn-g btn-sm" onClick={()=>setPending(null)}>Cancel</button>
            {(l.nextSteps||'').trim()&&<span className="fu-next-note">Old note gets logged to activity</span>}
          </div>
        </div>):(<>
          <div className="fu-quick">
            {l.phone&&<a className="fu-ic" href={'tel:'+l.phone} title="Call"><Phone size={15}/></a>}
            {l.phone&&<a className="fu-ic" href={'sms:'+l.phone} title="Text"><MessageSquare size={15}/></a>}
            {l.email&&<a className="fu-ic" href={'mailto:'+l.email} title="Email"><Mail size={15}/></a>}
            {!l.phone&&!l.email&&<span className="subcell" style={{fontSize:11}}>no contact info</span>}
          </div>
          <div className="fu-chips">
            {QUICK.map(([lbl,n])=><button key={lbl} className="fu-chip" onClick={()=>startNext(l,addDays(t,n))}>{lbl}</button>)}
            <label className="fu-chip fu-date" title="Pick a date"><CalendarClock size={13}/><input type="date" min={t} onClick={e=>e.stopPropagation()} onChange={e=>startNext(l,e.target.value)}/></label>
          </div>
        </>)}
      </div>
    </div>);
  };
  const Scope=()=>(<div className="fu-scope"><ScopeSeg view={view} setView={setView} counts={counts} canAll={canAll}/></div>);
  if(!due.length){ return (<><Scope/><div className="fu-done">
    <div className="fu-done-burst"><Sparkles size={20} className="s1"/><Sparkles size={14} className="s2"/><Sparkles size={16} className="s3"/><div className="fu-done-ring"><CheckCircle2 size={54} color={GREEN}/></div></div>
    <h2>{cleared>0?'Inbox zero. Nice work.':view==='mine'?'You\u2019re all caught up':view==='pool'?'Nothing waiting in the pool':'All caught up'}</h2>
    <p>{cleared>0?`You cleared ${cleared} follow-up${cleared>1?'s':''} today — every lead's been handled.`:view==='mine'?(counts.pool>0?`Nothing of yours is due. There ${counts.pool===1?'is':'are'} ${counts.pool} unclaimed follow-up${counts.pool>1?'s':''} in the pool.`:(counts.all>0&&canAll?'Nothing of yours is due — switch to All to see the team\u2019s.':'Nothing is due or overdue right now.')):'Nothing is due or overdue right now. Set follow-up dates on your leads and they\u2019ll show up here the day they\u2019re due.'}</p>
  </div></>); }
  return (<>
    <Scope/>
    <div className="fu-hero">
      <div className="fu-hero-l"><div className="fu-hero-n">{remaining}</div><div className="fu-hero-lbl">lead{remaining>1?'s':''} to clear</div></div>
      <div className="fu-hero-stats">
        {overdue.length>0&&<span className="fu-stat od"><AlertTriangle size={13}/><b>{overdue.length}</b> overdue</span>}
        {today.length>0&&<span className="fu-stat"><CalendarClock size={13}/><b>{today.length}</b> due today</span>}
        {cleared>0&&<span className="fu-stat done"><CheckCircle2 size={13}/><b>{cleared}</b> cleared</span>}
      </div>
      <div className="fu-ring" style={{'--p':pct}}><span>{pct}%</span></div>
    </div>
    {overdue.length>0&&<><div className="fu-band od"><AlertTriangle size={14}/>Overdue · {overdue.length}</div><div className="fu-grid">{overdue.map(l=><Card key={l.id} l={l}/>)}</div></>}
    {today.length>0&&<><div className="fu-band"><CalendarClock size={14}/>Due Today · {today.length}</div><div className="fu-grid">{today.map(l=><Card key={l.id} l={l}/>)}</div></>}
  </>);
}

function Dashboard({leads,stages,open}){
  const m=useMetrics(leads,stages);
  const stageData=stages.filter(s=>s.open).map(s=>({name:s.label,Leads:m.byStage[s.key]?.count||0,color:s.color}));
  const revMix=[{name:'Closed Setup',value:m.wonValue},{name:'Annual MRR',value:m.mrr*12}].filter(d=>d.value>0);
  const followUps=[...m.overdue,...m.dueWeek].sort((a,b)=>(a.followUp||'').localeCompare(b.followUp||'')).slice(0,8);
  return (<>
    <div className="kgrid">
      <Kpi variant="accent" label="Open Pipeline" value={usd(m.openValue)} icon={<KanbanSquare size={14}/>} d={`${m.openCount} active leads`}/>
      <Kpi label="Weighted Forecast" value={usd(m.weighted)} icon={<Target size={14}/>} d="probability-adjusted"/>
      <Kpi variant="green" label="Deals Closed" value={m.wonCount} icon={<CheckCircle2 size={14}/>} d={`${usd(m.wonValue)} setup`}/>
      <Kpi variant="gold" label="MRR" value={usd(m.mrr)} icon={<Repeat size={14}/>} d={`${m.retainers} retainers · ${usdK(m.mrr*12)}/yr`}/>
    </div>
    <div className="row r3">
      <ChartCard title="Pipeline by Stage" sub="Open leads only" empty={stageData.some(d=>d.Leads>0)?null:'No open leads yet.'}>
        <div className="chart-h"><ResponsiveContainer width="100%" height="100%"><BarChart data={stageData} margin={{top:6,right:10,left:-12,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F6"/><XAxis dataKey="name" tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/><YAxis allowDecimals={false} tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={tipStyle} cursor={{fill:'#F4F6FB'}}/><Bar dataKey="Leads" radius={[6,6,0,0]}>{stageData.map((e,i)=><Cell key={i} fill={e.color}/>)}</Bar>
        </BarChart></ResponsiveContainer></div>
      </ChartCard>
      <ChartCard title="Revenue Mix" sub="Setup vs annualized recurring" empty={revMix.length?null:'No closed revenue yet.'}>
        <div className="chart-h"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={revMix} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={46} outerRadius={80} paddingAngle={2}>{revMix.map((e,i)=><Cell key={i} fill={PIE[i]}/>)}</Pie><Tooltip contentStyle={tipStyle} formatter={v=>usd(v)}/><Legend wrapperStyle={{fontSize:12}}/></PieChart></ResponsiveContainer></div>
      </ChartCard>
    </div>
    <div className="row r2">
      <div className="card">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><div className="sec-title" style={{margin:0}}>Follow-ups Due</div>{m.overdue.length>0&&<span className="pill" style={{background:'rgba(209,67,67,.1)',color:RED}}><AlertTriangle size={11}/>{m.overdue.length} overdue</span>}</div>
        <div style={{marginTop:12}}>{followUps.length?followUps.map(l=>(<div key={l.id} onClick={()=>open(l.id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #F0F0F6',cursor:'pointer'}}><div><div style={{fontWeight:600,color:INK,fontSize:14}}>{l.name}</div><div className="subcell">{l.company} · {l.nextAction}</div></div><Due iso={l.followUp}/></div>)):<div className="empty">Nothing due this week. Clean board.</div>}</div>
      </div>
      <div className="card">
        <div className="sec-title" style={{margin:'0 0 12px'}}>🔥 Hot Leads</div>
        {m.hot.length?m.hot.map(l=>(<div key={l.id} onClick={()=>open(l.id)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid #F0F0F6',cursor:'pointer'}}><div><div style={{fontWeight:600,color:INK,fontSize:14}}>{l.name}</div><div className="subcell">{l.company}</div></div><StageBadge k={l.stage} stages={stages}/></div>)):<div className="empty">No high-priority open leads.</div>}
      </div>
    </div>
  </>);
}

/* ===================== PIPELINE (cleaner kanban) ===================== */
function Pipeline({leads,stages,open,updateLead}){
  const [dragId,setDragId]=useState(null);const [over,setOver]=useState(null);const [expanded,setExpanded]=useState({});
  const drop=stage=>{if(dragId)updateLead(dragId,{stage});setDragId(null);setOver(null);};
  const move=(l,dir)=>{const i=sIdx(l.stage,stages);const j=i+dir;if(j<0||j>=stages.length)return;updateLead(l.id,{stage:stages[j].key});};
  const openLeads=leads.filter(l=>sOf(l.stage,stages).open);
  const totalOpen=openLeads.reduce((a,l)=>a+num(l.dealValue),0);
  const weighted=openLeads.reduce((a,l)=>a+num(l.dealValue)*(sOf(l.stage,stages).prob||0),0);
  const wonC=leads.filter(l=>sOf(l.stage,stages).won).length;
  const lostC=leads.filter(l=>sOf(l.stage,stages).lost).length;
  const winRate=(wonC+lostC)?Math.round(wonC/(wonC+lostC)*100):0;
  const Card=({l})=>{ const i=sIdx(l.stage,stages); const st=sOf(l.stage,stages); const od=l.followUp&&daysUntil(l.followUp)<0; const stale=st.open&&daysSince(lastContact(l))>=7;
    return (<div className={'kcard'+(od?' od':'')+(dragId===l.id?' dragging':'')} draggable onDragStart={()=>setDragId(l.id)} onDragEnd={()=>{setDragId(null);setOver(null);}} onClick={()=>open(l.id)}>
      <div className="kcard-top">
        <div className="kn"><span className="dot" style={{background:(PRIORITIES[l.priority]||PRIORITIES.medium).color}}/>{l.name||'(no name)'}</div>
        {l.owner&&<span className="kown" title={l.owner}>{l.owner[0].toUpperCase()}</span>}
      </div>
      <div className="kco">{l.company||l.businessType}</div>
      {(l.serviceInterest||[]).length>0&&<div className="ktags">{(l.serviceInterest||[]).slice(0,2).map(s2=><span key={s2} className="tag">{s2}</span>)}</div>}
      <div className="kmeta">
        <span className="kvals">{l.dealValue>0&&<span className="kdv">{usd(l.dealValue)}</span>}{l.retainerActive&&num(l.retainer)>0&&<span className="kmrr">{usd(l.retainer)}/mo</span>}</span>
        {l.followUp&&<Due iso={l.followUp}/>}
      </div>
      {stale&&<div className="kstale"><AlertTriangle size={11}/>{daysSince(lastContact(l))}d no contact</div>}
      <div className="kmove" onClick={e=>e.stopPropagation()}>
        <button className="kmv" disabled={i<=0} onClick={()=>move(l,-1)} title="Move back a stage"><ChevronLeft size={16}/></button>
        <span className="kmv-s">{st.label}</span>
        <button className="kmv" disabled={i>=stages.length-1} onClick={()=>move(l,1)} title="Advance a stage"><ChevronRight size={16}/></button>
      </div>
    </div>);
  };
  return (<>
    <div className="kgrid" style={{marginBottom:18}}>
      <Kpi variant="accent" label="Open Pipeline" value={usd(totalOpen)} icon={<KanbanSquare size={14}/>} d={`${openLeads.length} open deal${openLeads.length===1?'':'s'}`}/>
      <Kpi variant="green" label="Weighted Forecast" value={usd(weighted)} icon={<Target size={14}/>} d="probability-adjusted"/>
      <Kpi label="Win Rate" value={winRate+'%'} icon={<Award size={14}/>} d={`${wonC} won · ${lostC} lost`}/>
    </div>
    <div className="kanban">{stages.map(s=>{const items=leads.filter(l=>l.stage===s.key).sort((a,b)=>num(b.dealValue)-num(a.dealValue)||(a.followUp||'9999').localeCompare(b.followUp||'9999'));const val=items.reduce((a,l)=>a+num(l.dealValue),0);const wtd=val*(s.prob||0);const isClosed=!s.open;const collapsed=isClosed&&!expanded[s.key];
      if(collapsed){ return (<div key={s.key} className="kcol kcollapsed" title={`${s.label} — tap to expand`} onClick={()=>setExpanded(e=>({...e,[s.key]:true}))} onDragOver={e=>{e.preventDefault();setOver(s.key);}} onDragLeave={()=>setOver(c=>c===s.key?null:c)} onDrop={()=>drop(s.key)}>
        <div className="kbar" style={{background:s.color}}/>
        <div className="kcoll-body"><ChevronRight size={15} className="kcoll-exp"/><span className="kcoll-label">{s.label}</span><span className="kc">{items.length}</span></div>
      </div>); }
      return (<div key={s.key} className={'kcol '+(over===s.key?'drag':'')} onDragOver={e=>{e.preventDefault();setOver(s.key);}} onDragLeave={()=>setOver(c=>c===s.key?null:c)} onDrop={()=>drop(s.key)}>
        <div className="kbar" style={{background:s.color}}/>
        <div className="kcol-h"><span className="kt">{s.label}</span><span style={{display:'flex',alignItems:'center',gap:6}}><span className="kc">{items.length}</span>{isClosed&&<button className="kcoll-x" title="Collapse" onClick={e=>{e.stopPropagation();setExpanded(e2=>({...e2,[s.key]:false}));}}><ChevronLeft size={13}/></button>}</span></div>
        <div className="kcol-v">{val>0?usd(val):'—'}{s.open&&val>0&&<span className="kwtd"> · {usd(wtd)} weighted</span>}</div>
        <div className="kcol-body">
          {items.map(l=><Card key={l.id} l={l}/>)}
          {dragId&&over===s.key&&<div className="kdrop">Release to move here</div>}
          {!items.length&&!(dragId&&over===s.key)&&<div className="kdrop">No leads</div>}
        </div>
      </div>);})}</div>
  </>);
}

/* ===================== LEADS ===================== */
function Leads({leads,settings,stages,open,saveSettings,importLeads,me,updateLead}){
  const [importOpen,setImportOpen]=useState(false);
  const canAll=teamAccess(settings,me)==='all';
  const [view,setView]=useState('mine');
  useEffect(()=>{ if(!canAll&&view==='all') setView('mine'); },[canAll,view]);
  const counts={mine:leads.filter(l=>l.owner===me).length,pool:leads.filter(l=>l.owner===POOL_OWNER).length,all:leads.length};
  const claim=(e,l)=>{ e.stopPropagation(); if(updateLead) updateLead(l.id,{owner:me}); };
  const customFields=settings.customFields||[];
  const defs=leadColumnDefs(stages,customFields);
  const cols=mergeLeadCols(settings.leadColumns||DEFAULT_LEAD_COLS,customFields).filter(c=>defs[c.key]);
  const visCols=cols.filter(c=>c.visible);
  const setCols=next=>saveSettings({...settings,leadColumns:next});
  const moveCol=(i,d)=>{const j=i+d;if(j<0||j>=cols.length)return;const a=cols.slice();[a[i],a[j]]=[a[j],a[i]];setCols(a);};
  const toggleCol=key=>setCols(cols.map(c=>c.key===key?{...c,visible:!c.visible}:c));
  const [colOpen,setColOpen]=useState(false);
  const [q,setQ]=useState('');const [stage,setStage]=useState('all');const [pri,setPri]=useState('all');const [cold,setCold]=useState('all');const [spon,setSpon]=useState('all');
  const [sortK,setSortK]=useState('followUp');const [dir,setDir]=useState('asc');
  const sortVal=(l,k)=>{
    if(k==='stage') return sIdx(l.stage,stages);
    if(k==='priority') return (PRIORITIES[l.priority]||PRIORITIES.medium).rank;
    if(k==='dealValue') return num(l.dealValue);
    if(k==='lastContacted') return lastContact(l);
    if(k==='followUp') return l.followUp||'9999-99-99';
    if(k.startsWith('cf:')) {const v=l.custom?.[k.slice(3)];return typeof v==='number'?v:(v||'').toString().toLowerCase();}
    return (l[k]||'').toString().toLowerCase();
  };
  const toggleSort=k=>{ if(sortK===k) setDir(d=>d==='asc'?'desc':'asc'); else {setSortK(k);setDir('asc');} };
  const rows=useMemo(()=>{
    let r=scopeLeads(leads,view,me).filter(l=>{
      if(stage!=='all'&&l.stage!==stage)return false;
      if(pri!=='all'&&l.priority!==pri)return false;
      if(cold!=='all'&&daysSince(lastContact(l))<+cold)return false;
      if(spon==='potential'&&!l.potentialSponsor)return false;
      if(spon==='past'&&!l.pastSponsor)return false;
      if(spon==='any'&&!(l.potentialSponsor||l.pastSponsor))return false;
      if(q){const s=(l.name+' '+l.company+' '+l.businessType+' '+l.phone+' '+(l.serviceInterest||[]).join(' ')+' '+l.source).toLowerCase();if(!s.includes(q.toLowerCase()))return false;}
      return true;
    });
    r.sort((a,b)=>{const av=sortVal(a,sortK),bv=sortVal(b,sortK);const c=av<bv?-1:av>bv?1:0;return dir==='asc'?c:-c;});
    return r;
  },[leads,q,stage,pri,cold,spon,sortK,dir,stages,view,me]);
  const csv=()=>{
    const cols=['name','company','businessType','phone','email','website','stage','priority','source','serviceInterest','nextAction','nextSteps','followUp','expectedClose','owner','dealValue','retainer','retainerActive'];
    const esc=v=>{v=Array.isArray(v)?v.join('; '):(v??'');v=String(v).replace(/"/g,'""');return /[",\n]/.test(v)?`"${v}"`:v;};
    const head=cols.join(',');const body=rows.map(l=>cols.map(c=>esc(c==='stage'?sOf(l.stage,stages).label:l[c])).join(',')).join('\n');
    const blob=new Blob([head+'\n'+body],{type:'text/csv'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='proytech-leads.csv';a.click();URL.revokeObjectURL(u);
  };
  const Th=({k,children})=>(<th className={sortK===k?'sorted':''} onClick={()=>toggleSort(k)}>{children}<span className="ar">{sortK===k?(dir==='asc'?'▲':'▼'):'↕'}</span></th>);
  return (<>
    <div className="toolbar">
      <ScopeSeg view={view} setView={setView} counts={counts} canAll={canAll}/>
      <div className="searchbox"><Search size={16} color="#928DAD"/><input placeholder="Search name, company, phone, service…" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select className="selctl" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">All stages</option>{stages.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
      <select className="selctl" value={pri} onChange={e=>setPri(e.target.value)}><option value="all">All priority</option>{Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
      <select className="selctl" value={cold} onChange={e=>setCold(e.target.value)}><option value="all">Any contact age</option><option value="7">Cold · 7+ days</option><option value="14">Cold · 14+ days</option><option value="30">Cold · 30+ days</option></select>
      <select className="selctl" value={spon} onChange={e=>setSpon(e.target.value)}><option value="all">All leads</option><option value="potential">Potential sponsors</option><option value="past">Past sponsors</option><option value="any">Any sponsor</option></select>
      <button className="selctl" onClick={()=>setDir(d=>d==='asc'?'desc':'asc')} title="Toggle direction"><ArrowUpDown size={15}/></button>
      <div className="colmenu-wrap">
        <button className="selctl" onClick={()=>setColOpen(o=>!o)}><SlidersHorizontal size={15}/>Columns</button>
        {colOpen&&<><div className="cm-back" onClick={()=>setColOpen(false)}/><div className="colmenu">
          <div className="cm-row"><span className="cm-name" style={{fontWeight:600,color:INK}}>Name</span><span className="cm-lock">always on</span></div>
          {cols.map((c,i)=>(<div className="cm-row" key={c.key}><input type="checkbox" checked={c.visible} onChange={()=>toggleCol(c.key)}/><span className="cm-name">{defs[c.key]?.label||c.key}</span><button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveCol(i,-1)} disabled={i===0}><ChevronUp size={13}/></button><button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveCol(i,1)} disabled={i===cols.length-1}><ChevronDown size={13}/></button></div>))}
        </div></>}
      </div>
      <button className="btn btn-g" onClick={csv}><Download size={15}/>CSV</button>
      {importLeads&&<button className="btn btn-p" onClick={()=>setImportOpen(true)}><Upload size={15}/>Import</button>}
    </div>
    {view==='pool'&&<div className="pool-note"><Users size={14}/>Unclaimed leads owned by ProyTech. Claim one and it moves to your list.</div>}
    <div className="tbl-wrap"><table className="tbl"><thead><tr>
      <Th k="name">Name</Th>{visCols.map(c=><Th key={c.key} k={c.key}>{defs[c.key].label}</Th>)}{view==='pool'&&<th></th>}
    </tr></thead><tbody>{rows.map(l=>(<tr key={l.id} onClick={()=>open(l.id,rows.map(r=>r.id))}>
      <td><div className="namecell">{l.name}</div><div className="subcell">{l.company}</div></td>
      {visCols.map(c=><td key={c.key}>{defs[c.key].render(l)}</td>)}
      {view==='pool'&&<td style={{textAlign:'right'}}><button className="claim-btn" onClick={e=>claim(e,l)}><UserCheck size={13}/>Claim</button></td>}
    </tr>))}</tbody></table>{!rows.length&&<div className="empty">{view==='mine'?<>No leads assigned to you{q||stage!=='all'?' match those filters':''}. Check the <b>Pool</b> for unclaimed leads{canAll?<> or switch to <b>All</b></>:''}.</>:view==='pool'?'The pool is empty — every lead is claimed.':'No leads match. Adjust filters or add a new lead.'}</div>}</div>
    {importOpen&&<ImportModal onClose={()=>setImportOpen(false)} onImport={arr=>{importLeads(arr);setImportOpen(false);}} businessTypes={settings.options?.businessType||[]}/>}
  </>);
}

/* ===================== CSV IMPORT ===================== */
const IMPORT_FIELDS=[['ignore','— ignore —'],['name','Name'],['company','Company'],['phone','Phone'],['email','Email'],['website','Website'],['businessType','Business type'],['source','Source'],['note','Notes']];
const IMPORT_KEYS=IMPORT_FIELDS.map(f=>f[0]);
const guessField=h=>{const s=(h||'').toLowerCase();
  if(/e-?mail/.test(s))return 'email';
  if(/phone|mobile|cell|tel|number/.test(s))return 'phone';
  if(/web|site|url|domain/.test(s))return 'website';
  if(/company|business\s*name|org|account|dba|firm/.test(s))return 'company';
  if(/first|last|full|contact|name/.test(s))return 'name';
  if(/type|industry|category|vertical/.test(s))return 'businessType';
  if(/source|origin|referr|lead\s*from/.test(s))return 'source';
  if(/note|comment|desc|remark/.test(s))return 'note';
  return 'ignore';};
const parseCSV=text=>{const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
    else { if(c==='"')q=true; else if(c===','){row.push(cur);cur='';} else if(c==='\n'){row.push(cur);rows.push(row);row=[];cur='';} else if(c!=='\r')cur+=c; } }
  if(cur!==''||row.length){row.push(cur);rows.push(row);}
  return rows.filter(r=>r.some(c=>(c||'').trim()!==''));};

function ImportModal({onClose,onImport,businessTypes}){
  const [headers,setHeaders]=useState(null);
  const [rows,setRows]=useState([]);
  const [mapping,setMapping]=useState({});
  const [markSponsor,setMarkSponsor]=useState(false);
  const [ai,setAi]=useState(null);
  const [fileName,setFileName]=useState('');
  const fileRef=React.useRef(null);
  const ingest=text=>{ const parsed=parseCSV(text); if(parsed.length<2){window.alert('That file needs a header row and at least one data row.');return;}
    const hd=parsed[0].map(h=>(h||'').trim()); const rw=parsed.slice(1);
    setHeaders(hd); setRows(rw);
    const base={}; hd.forEach(h=>base[h]=guessField(h)); setMapping(base);
    setAi('reading');
    (async()=>{ try{ const r=await fetch('/api/import-leads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({headers:hd,samples:rw.slice(0,6)})}); const j=await r.json();
      if(j&&j.ok&&j.mapping){ const m={}; hd.forEach(h=>{const v=j.mapping[h];m[h]=(v&&IMPORT_KEYS.includes(v))?v:base[h];}); setMapping(m); setAi('done'); }
      else setAi('heuristic'); }catch(e){ setAi('heuristic'); } })();
  };
  const onFile=e=>{ const f=e.target.files?.[0]; e.target.value=''; if(!f)return; setFileName(f.name); const r=new FileReader(); r.onload=()=>ingest(String(r.result)); r.readAsText(f); };
  const buildLead=row=>{ const f={}; headers.forEach((h,i)=>{ const t=mapping[h]; if(!t||t==='ignore')return; const v=(row[i]||'').trim(); if(!v)return; if(t==='name')f.name=(f.name?f.name+' ':'')+v; else if(t==='note')f.note=(f.note?f.note+' | ':'')+v; else f[t]=v; });
    if(!f.name)f.name=f.company||'(no name)'; if(!f.source)f.source='CSV import'; if(markSponsor)f.potentialSponsor=true; return mkLead(f); };
  const preview=headers?rows.slice(0,6).map(buildLead):[];
  const mapped=k=>headers?headers.filter(h=>mapping[h]===k).length:0;
  const doImport=()=>{ const built=rows.map(buildLead); onImport(built); };
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal" style={{maxWidth:720}} onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head"><div><h2>Import leads from CSV</h2><div className="meta">AI maps your columns — you review, then import</div></div><button className="m-x" onClick={onClose}><X size={18}/></button></div>
      <div style={{padding:'4px 22px 22px'}}>
        {!headers?(<>
          <div className="drop" onClick={()=>fileRef.current?.click()}><Upload size={22}/><div style={{marginTop:8,fontWeight:600,color:INK}}>Choose a .csv file</div><div style={{fontSize:12,color:'#8b88a0',marginTop:3}}>Export your Google Sheet as CSV, or drag any contact list. Messy columns are fine — the AI sorts them out.</div></div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{display:'none'}} onChange={onFile}/>
          <div style={{textAlign:'center',color:'#c7c5d4',fontSize:12,margin:'12px 0 6px'}}>or paste rows below</div>
          <textarea rows={5} placeholder="Name,Company,Phone,Email&#10;Jane Doe,Acme,3165551234,jane@acme.com" style={{width:'100%',border:'1px solid #E1E2EC',borderRadius:10,padding:10,fontSize:12.5,fontFamily:'monospace'}} onBlur={e=>{if(e.target.value.trim())ingest(e.target.value);}}/>
        </>):(<>
          {ai==='reading'&&<div className="ai-banner ai-reading"><Loader2 size={15} className="spin"/>AI is reading your columns…</div>}
          {ai==='done'&&<div className="ai-banner ai-done"><Sparkles size={15}/>AI mapped your columns — check them below and fix any that look off.</div>}
          {ai==='heuristic'&&<div className="ai-banner ai-off"><AlertTriangle size={15}/>Auto-matched columns by name (AI unavailable). Double-check the mapping below.</div>}
          <div className="imp-sub">{rows.length} row{rows.length===1?'':'s'} found{fileName?' · '+fileName:''}. Map each column:</div>
          <div className="imp-map">{headers.map(h=>(<div className="imp-row" key={h}><span className="imp-h" title={h}>{h||'(blank)'}</span><ChevronRight size={13} color="#c7c5d4"/><select value={mapping[h]||'ignore'} onChange={e=>setMapping(m=>({...m,[h]:e.target.value}))}>{IMPORT_FIELDS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div>))}</div>
          {!mapped('name')&&<div className="imp-warn"><AlertTriangle size={13}/>No column is mapped to <b>Name</b> — those rows will fall back to the company name.</div>}
          <label className="spon-tog" style={{marginTop:12}}><input type="checkbox" checked={markSponsor} onChange={e=>setMarkSponsor(e.target.checked)}/>Mark all imported leads as <b>potential sponsors</b></label>
          <div className="imp-sub" style={{marginTop:16}}>Preview (first {preview.length}):</div>
          <div className="tbl-wrap" style={{maxHeight:200,overflow:'auto'}}><table className="tbl"><thead><tr><th>Name</th><th>Company</th><th>Phone</th><th>Email</th></tr></thead><tbody>{preview.map((l,i)=>(<tr key={i}><td className="namecell">{l.name}</td><td className="subcell">{l.company||'—'}</td><td className="subcell">{l.phone||'—'}</td><td className="subcell">{l.email||'—'}</td></tr>))}</tbody></table></div>
          <div style={{display:'flex',gap:8,marginTop:16,alignItems:'center'}}>
            <button className="btn btn-p" onClick={doImport}><CheckCircle2 size={15}/>Import {rows.length} lead{rows.length===1?'':'s'}</button>
            <button className="btn btn-s btn-sm" onClick={()=>{setHeaders(null);setRows([]);setAi(null);setFileName('');}}>Start over</button>
          </div>
        </>)}
      </div>
    </div>
  </div>);
}

/* ===================== INTRO WEB ===================== */
function NetworkWeb({contacts,open}){
  const [sel,setSel]=useState(null);
  const net=useMemo(()=>buildNetwork(contacts),[contacts]);
  const COL=196,ROW=52,NW=164,NH=36,PAD=22;
  if(!net.nodes.length) return (<div className="card"><div className="empty">No introductions mapped yet. Open any contact, set <b>Introduced by</b>, and the web will draw itself here.</div></div>);
  const rootYs=net.nodes.filter(n=>n.depth===1).map(n=>n.y);
  const youY=rootYs.length?(Math.min(...rootYs)+Math.max(...rootYs))/2:0;
  const X=d=>PAD+d*COL, Y=y=>PAD+y*ROW+NH/2;
  const W=X(net.maxDepth)+NW+PAD, H=PAD*2+Math.max(net.rows,1)*ROW;
  const ancestors=id=>{const c=net.byId[id];return c?introChain(c,contacts).map(p=>p.id):[];};
  const selPath=sel?[...ancestors(sel),sel]:[];
  const onPath=id=>selPath.includes(id);
  const linkOn=(a,b)=>{const i=selPath.indexOf(a);return i>=0&&selPath[i+1]===b;};
  const curve=(x1,y1,x2,y2)=>{const mx=(x1+x2)/2;return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;};
  const colorOf=c=>c.isRelationship?'#7A5CC8':(c.isClient?GREEN:COBALT);
  return (<div className="card web-card">
    <div className="web-legend">
      <span><i style={{background:'#7A5CC8'}}/>Relationship</span>
      <span><i style={{background:COBALT}}/>Lead</span>
      <span><i style={{background:GREEN}}/>Client</span>
      <span className="web-tip">Tap a name to trace it back · double-tap to open</span>
      {sel&&<button className="btn btn-s btn-sm" style={{marginLeft:'auto'}} onClick={()=>setSel(null)}>Clear trace</button>}
    </div>
    {sel&&(()=>{const chain=[...ancestors(sel).map(id=>net.byId[id]),net.byId[sel]].filter(Boolean);
      return (<div className="web-trace"><b>{chain[chain.length-1].name}</b>{chain.length>1?<> traces back through {chain.slice(0,-1).map((p,i)=><React.Fragment key={p.id}>{i>0&&' → '}<span onClick={()=>setSel(p.id)}>{p.name}</span></React.Fragment>)}</>:<> — you met them directly</>}</div>);})()}
    <div className="web-scroll">
      <svg width={W} height={H} className="web-svg">
        {net.roots.length>0&&<>
          <rect x={X(0)} y={Y(youY)-NH/2} width={NW} height={NH} rx={9} className="web-you"/>
          <text x={X(0)+NW/2} y={Y(youY)+4} textAnchor="middle" className="web-youtxt">You · ProyTech</text>
          {net.nodes.filter(n=>n.depth===1).map(n=>(
            <path key={'y'+n.id} d={curve(X(0)+NW,Y(youY),X(1),Y(n.y))} className="web-link you"/>
          ))}
        </>}
        {net.links.map(([a,b])=>{
          const na=net.nodes.find(n=>n.id===a),nb=net.nodes.find(n=>n.id===b);
          if(!na||!nb)return null;
          return <path key={a+'>'+b} d={curve(X(na.depth)+NW,Y(na.y),X(nb.depth),Y(nb.y))} className={'web-link'+(linkOn(a,b)?' on':'')}/>;
        })}
        {net.nodes.map(n=>{const c=net.byId[n.id];if(!c)return null;
          const dim=sel&&!onPath(n.id);
          return (<g key={n.id} className={'web-node'+(dim?' dim':'')+(sel===n.id?' sel':'')} onClick={()=>setSel(n.id)} onDoubleClick={()=>open&&open(n.id)}>
            <rect x={X(n.depth)} y={Y(n.y)-NH/2} width={NW} height={NH} rx={9} fill="#fff" stroke={onPath(n.id)?colorOf(c):'#E1E2EC'} strokeWidth={onPath(n.id)?2:1}/>
            <rect x={X(n.depth)} y={Y(n.y)-NH/2} width={4} height={NH} rx={2} fill={colorOf(c)}/>
            <text x={X(n.depth)+12} y={Y(n.y)-1} className="web-name">{(c.name||'').slice(0,20)}</text>
            <text x={X(n.depth)+12} y={Y(n.y)+11} className="web-co">{(c.company||'').slice(0,22)}</text>
            {n.kids>0&&<><circle cx={X(n.depth)+NW-14} cy={Y(n.y)} r={9} fill="#F1F2F8"/><text x={X(n.depth)+NW-14} y={Y(n.y)+3.5} textAnchor="middle" className="web-kids">{n.kids}</text></>}
          </g>);
        })}
      </svg>
    </div>
  </div>);
}

/* ===================== RELATIONSHIPS ===================== */
function Relationships({leads,open}){
  const [q,setQ]=useState('');
  const [src,setSrc]=useState('all');
  const [view,setView]=useState('grouped');
  const rels=useMemo(()=>leads.filter(l=>l.isRelationship),[leads]);
  const nameOf=id=>{const x=leads.find(l=>l.id===id);return x?x.name:'';};
  const sources=useMemo(()=>{
    const m={};
    rels.forEach(r=>{const k=r.introducedBy||'';m[k]=(m[k]||0)+1;});
    return Object.entries(m).map(([id,count])=>({id,count,name:id?nameOf(id)||'(removed contact)':'Direct / no intro'}))
      .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
  },[rels,leads]);
  const shown=useMemo(()=>rels.filter(r=>{
    if(src!=='all'&&(r.introducedBy||'')!==src)return false;
    if(q){const s=(r.name+' '+r.company+' '+(r.relNote||'')+' '+nameOf(r.introducedBy)).toLowerCase();if(!s.includes(q.toLowerCase()))return false;}
    return true;
  }).sort((a,b)=>(a.name||'').localeCompare(b.name||'')),[rels,q,src,leads]);
  const groups=useMemo(()=>{
    const m={};
    shown.forEach(r=>{const k=r.introducedBy||'';(m[k]=m[k]||[]).push(r);});
    return Object.entries(m).map(([id,list])=>({id,name:id?nameOf(id)||'(removed contact)':'Direct / no intro',list}))
      .sort((a,b)=>b.list.length-a.list.length||a.name.localeCompare(b.name));
  },[shown,leads]);
  const topConnector=sources.filter(s=>s.id)[0];
  const allIntro=useMemo(()=>{
    const m={};
    leads.forEach(l=>{ if(l.introducedBy&&l.introducedBy!==l.id&&leads.some(x=>x.id===l.introducedBy)) m[l.introducedBy]=(m[l.introducedBy]||0)+1; });
    return Object.entries(m).map(([id,count])=>({id,count,name:nameOf(id)})).sort((a,b)=>b.count-a.count);
  },[leads]);
  const topAll=allIntro[0];
  const deepest=useMemo(()=>{
    let best=0,who=null;
    leads.forEach(l=>{const c=introChain(l,leads);if(c.length>best){best=c.length;who=l;}});
    return {len:best,who};
  },[leads]);
  const Row=r=>(<tr key={r.id} onClick={()=>open(r.id,shown.map(x=>x.id))}>
    <td><div className="namecell">{r.name}</div><div className="subcell">{r.company||'—'}</div></td>
    <td className="subcell">{r.relNote||'—'}</td>
    <td>{r.introducedBy?<span className="rel-chip"><Link2 size={11}/>{nameOf(r.introducedBy)||'—'}</span>:<span className="subcell">Direct</span>}</td>
    <td className="subcell">{r.phone||'—'}</td>
    <td><Due iso={r.followUp}/></td>
    <td className="subcell">{r.owner||'—'}</td>
  </tr>);
  return (<>
    <div className="kpis">
      <Kpi variant="accent" label="Relationships" value={rels.length} icon={<Users size={14}/>} d="Kept out of sales numbers"/>
      <Kpi label="Connectors" value={allIntro.length} icon={<UserPlus size={14}/>} d="People who intro'd you"/>
      <Kpi label="Top connector" value={topAll?topAll.count:0} icon={<Award size={14}/>} d={topAll?topAll.name:'—'}/>
      <Kpi label="Longest chain" value={deepest.len?deepest.len+1:0} icon={<Link2 size={14}/>} d={deepest.who?'ends at '+deepest.who.name:'—'}/>
    </div>
    <div className="toolbar">
      <div className="searchbox"><Search size={16} color="#928DAD"/><input placeholder="Search name, company, how you know them…" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select className="selctl" value={src} onChange={e=>setSrc(e.target.value)}>
        <option value="all">Everyone who introduced</option>
        {sources.map(s=><option key={s.id} value={s.id}>{s.name} ({s.count})</option>)}
      </select>
      <div className="seg" style={{marginLeft:'auto'}}>
        <button className={view==='grouped'?'on':''} onClick={()=>setView('grouped')}>Grouped</button>
        <button className={view==='list'?'on':''} onClick={()=>setView('list')}>List</button>
        <button className={view==='web'?'on':''} onClick={()=>setView('web')}>Web</button>
      </div>
    </div>
    {view==='web'?<NetworkWeb contacts={leads} open={open}/>
    :!rels.length?<div className="card"><div className="empty">No relationships yet. Open any contact and flip the <b>Relationship</b> toggle at the top to move them here.</div></div>
    :!shown.length?<div className="card"><div className="empty">No relationships match that search.</div></div>
    :view==='list'?<div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>How you know them</th><th>Introduced by</th><th>Phone</th><th>Follow-up</th><th>Owner</th></tr></thead><tbody>{shown.map(Row)}</tbody></table></div>
    :<>{groups.map(g=>(<div className="card" style={{marginBottom:14}} key={g.id||'direct'}>
        <div className="rel-ghead">
          {g.id?<><span className="rel-gname" onClick={()=>open(g.id)}><Link2 size={13}/>{g.name}</span><span className="rel-gcount">{g.list.length} {g.list.length===1?'intro':'intros'}</span></>
              :<><span className="rel-gname plain"><Users size={13}/>Direct / no intro</span><span className="rel-gcount">{g.list.length}</span></>}
        </div>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Name</th><th>How you know them</th><th>Introduced by</th><th>Phone</th><th>Follow-up</th><th>Owner</th></tr></thead><tbody>{g.list.map(Row)}</tbody></table></div>
      </div>))}</>}
  </>);
}

/* ===================== CLIENTS ===================== */
function ClientRoadmap({clients,tracks,open}){
  if(!clients.length) return null;
  const PHASES=[['Not Started',p=>p<=0],['Kickoff',p=>p>0&&p<.26],['In Progress',p=>p>=.26&&p<.6],['Review',p=>p>=.6&&p<1]];
  const wp=clients.map(l=>({l,o:clientOverall(l,tracks)}));
  return (<div className="card" style={{marginBottom:18}}>
    <div className="sec-title" style={{margin:'0 0 14px'}}><Rocket size={15}/>Delivery Roadmap</div>
    <div className="rmap-board">{PHASES.map(([label,test])=>{const items=wp.filter(x=>test(x.o.pct));return (
      <div className="rmap-col" key={label}>
        <div className="rmap-colh">{label}<span>{items.length}</span></div>
        {items.map(({l,o})=>(<div className="rmap-card" key={l.id} onClick={()=>open(l.id)}>
          <div className="rc-n">{l.company||l.name}</div>
          <div className="pbar" style={{margin:'7px 0 0'}}><div style={{width:Math.round(o.pct*100)+'%'}}/></div>
          <div className="rc-ph">{o.phase}</div>
        </div>))}
        {!items.length&&<div className="rmap-empty">—</div>}
      </div>);})}
    </div>
    <div className="rmap-rows">{wp.map(({l,o})=>(<div className="rmap-row" key={l.id} onClick={()=>open(l.id)}>
      <div className="rr-name"><div className="namecell">{l.company||l.name}</div><div className="subcell">{Math.round(o.pct*100)}% · {o.phase}{o.overdue>0?<span className="od-tag"> · {o.overdue} overdue</span>:o.nextDue?<span className="due-tag"> · next due {fmtDate(o.nextDue)}</span>:''}</div></div>
      <div className="rr-tracks">{o.tracks.map(tr=>{const p=trackProgress(l,tr);return (
        <div className="rr-track" key={tr.key}><span className="rr-tl">{tr.label}</span><div className="rr-dots">{p.ms.map(m=>{const e=p.entries[m];const done=!!e.done;const od=!done&&e.due&&daysUntil(e.due)<0;return <span key={m} className={'rdot'+(done?' on':'')+(od?' over':'')} title={m+(done?' ✓ '+fmtDate(e.done):e.due?(od?' overdue '+fmtDate(e.due):' due '+fmtDate(e.due)):' (no date)')}/>;})}</div></div>);})}
      </div>
    </div>))}</div>
  </div>);
}

function Clients({leads,stages,settings,open}){
  const tracks=settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS;
  const clients=leads.filter(l=>l.isClient);
  const active=clients.filter(l=>!clientOverall(l,tracks).delivered);
  const done=clients.filter(l=>clientOverall(l,tracks).delivered);
  const retainerClients=clients.filter(l=>l.retainerActive);
  const mrr=retainerClients.reduce((a,l)=>a+num(l.retainer),0);
  const wonNotConverted=leads.filter(l=>sOf(l.stage,stages).won&&!l.isClient);
  const Prog=({l})=>{const o=clientOverall(l,tracks);return (<div className="cli-prog"><div className="pbar"><div style={{width:Math.round(o.pct*100)+'%'}}/></div><span className="pp">{Math.round(o.pct*100)}%</span></div>);};
  const Status=({o})=>o.delivered?<span className="badge done"><CheckCircle2 size={12}/>Delivered{o.doneDate?' · '+fmtDate(o.doneDate):''}</span>:o.overdue>0?<span className="badge over">{o.overdue} overdue</span>:<span className="subcell">{o.phase}</span>;
  const Section=({title,list})=>(<div className="tbl-wrap" style={{marginBottom:18}}>
    <div className="tbl-cap">{title} · {list.length}</div>
    {list.length?<table className="tbl"><thead><tr><th>Client</th><th>Service</th><th>Delivery</th><th>Status</th><th>Setup</th><th>Retainer</th><th>Owner</th></tr></thead><tbody>{list.map(l=>{const o=clientOverall(l,tracks);return (<tr key={l.id} onClick={()=>open(l.id)}>
      <td><div className="namecell">{l.company||l.name}{l.retainerActive&&<span className="rtag">retainer</span>}</div><div className="subcell">{l.name}</div></td>
      <td className="subcell">{(l.serviceInterest||[]).join(', ')||l.businessType}</td>
      <td><Prog l={l}/></td>
      <td><Status o={o}/></td>
      <td style={{fontWeight:600,color:INK}}>{usd(l.dealValue)}</td>
      <td>{l.retainerActive?<span style={{fontWeight:600,color:GREEN}}>{usd(l.retainer)}/mo</span>:<span className="subcell">—</span>}</td>
      <td className="subcell">{l.owner}</td>
    </tr>);})}</tbody></table>:<div className="empty">None yet.</div>}</div>);
  return (<>
    <div className="kgrid">
      <Kpi variant="accent" label="Total Clients" value={clients.length} icon={<Award size={14}/>} d={`${retainerClients.length} on retainer`}/>
      <Kpi variant="green" label="Active Retainers" value={retainerClients.length} icon={<Repeat size={14}/>} d={`${usd(mrr)} MRR`}/>
      <Kpi label="In Delivery" value={active.length} icon={<Rocket size={14}/>} d="active projects"/>
      <Kpi label="Completed" value={done.length} icon={<CheckCircle2 size={14}/>} d="fully delivered"/>
    </div>
    {wonNotConverted.length>0&&<div className="note" style={{marginBottom:18}}><b>{wonNotConverted.length} closed-won {wonNotConverted.length===1?'lead is':'leads are'} not converted yet.</b> Open {wonNotConverted.length===1?'it':'them'} and hit <b>Convert to Client</b> to start delivery tracking: {wonNotConverted.slice(0,5).map(l=>l.company||l.name).join(', ')}{wonNotConverted.length>5?'…':''}</div>}
    <ClientRoadmap clients={active} tracks={tracks} open={open}/>
    <Section title="In Delivery" list={active}/>
    <Section title="Completed" list={done}/>
    {!clients.length&&<div className="empty">No clients yet. Open a closed lead and hit <b>Convert to Client</b> to begin.</div>}
  </>);
}

/* ===================== MONEY ===================== */
function Money({leads,stages}){
  const m=useMetrics(leads,stages);const won=leads.filter(l=>sOf(l.stage,stages).won);
  const opt=DEFAULT_OPTIONS; const months=lastNMonths(6);
  const setupByMonth=months.map(k=>({name:monthLabel(k),Setup:won.filter(l=>l.closedAt&&monthKey(l.closedAt)===k).reduce((a,l)=>a+num(l.dealValue),0)}));
  const mrrByMonth=months.map(k=>{const end=k+'-31';const v=leads.filter(l=>l.retainerActive&&l.retainerStart&&l.retainerStart<=end).reduce((a,l)=>a+num(l.retainer),0);return {name:monthLabel(k),MRR:v};});
  const sources=[...new Set(leads.map(l=>l.source).filter(Boolean))];
  const bySource=sources.map(s=>({name:s,Value:won.filter(l=>l.source===s).reduce((a,l)=>a+num(l.dealValue)+num(l.retainer)*12,0)})).filter(d=>d.Value>0);
  const services=[...new Set(leads.flatMap(l=>l.serviceInterest||[]))];
  const byService=services.map(s=>({name:s.replace(' / ','/'),Deals:leads.filter(l=>(l.serviceInterest||[]).includes(s)).length})).filter(d=>d.Deals>0);
  const funnel=stages.filter(s=>!s.lost).map((s,i,arr)=>({name:s.label,Leads:leads.filter(l=>sIdx(l.stage,stages)>=sIdx(s.key,stages)&&!sOf(l.stage,stages).lost).length}));
  const anyMoney=m.wonValue>0||m.mrr>0;
  return (<>
    <div className="kgrid">
      <Kpi variant="green" label="Closed Setup Rev" value={usd(m.wonValue)} icon={<CheckCircle2 size={14}/>} d={`${m.wonCount} deals`}/>
      <Kpi variant="gold" label="MRR" value={usd(m.mrr)} icon={<Repeat size={14}/>} d={`${usd(m.mrr*12)}/yr`}/>
      <Kpi variant="accent" label="Weighted Pipeline" value={usd(m.weighted)} icon={<Target size={14}/>} d={`${usd(m.openValue)} unweighted`}/>
      <Kpi label="Win Rate" value={pct(m.winRate)} icon={<Percent size={14}/>} d={`avg deal ${usdK(m.avgDeal)}`}/>
      <Kpi label="Avg Retainer" value={usd(m.avgRet)} icon={<Repeat size={14}/>} d={`${m.retainers} active`}/>
    </div>
    {!anyMoney&&<div className="note" style={{marginBottom:18}}><b>These charts fill in as you close deals and turn on retainers.</b> Move a lead to a Won stage and set its Deal value + Monthly Retainer, and every number here updates automatically.</div>}
    <div className="row r2">
      <ChartCard title="MRR Growth" sub="Recurring revenue, last 6 months" empty={mrrByMonth.some(d=>d.MRR>0)?null:'No retainers yet.'}>
        <div className="chart-sm"><ResponsiveContainer width="100%" height="100%"><AreaChart data={mrrByMonth} margin={{top:6,right:10,left:-8,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F6"/><XAxis dataKey="name" tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={usdK} tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={tipStyle} formatter={v=>usd(v)}/><Area type="monotone" dataKey="MRR" stroke={COBALT} fill={COBALT} fillOpacity={.18} strokeWidth={3}/></AreaChart></ResponsiveContainer></div>
      </ChartCard>
      <ChartCard title="Setup Revenue by Month" sub="One-time cash from closes" empty={setupByMonth.some(d=>d.Setup>0)?null:'No closed setup revenue yet.'}>
        <div className="chart-sm"><ResponsiveContainer width="100%" height="100%"><BarChart data={setupByMonth} margin={{top:6,right:10,left:-8,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F6"/><XAxis dataKey="name" tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/><YAxis tickFormatter={usdK} tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={tipStyle} formatter={v=>usd(v)} cursor={{fill:'#F4F6FB'}}/><Bar dataKey="Setup" fill={INDIGO} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
      </ChartCard>
    </div>
    <div className="row r2">
      <ChartCard title="Revenue by Lead Source" sub="Setup + annual recurring" empty={bySource.length?null:'No revenue attributed yet.'}>
        <div className="chart-sm"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={bySource} margin={{top:4,right:14,left:30,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F6"/><XAxis type="number" tickFormatter={usdK} tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false} width={90}/>
          <Tooltip contentStyle={tipStyle} formatter={v=>usd(v)} cursor={{fill:'#F4F6FB'}}/><Bar dataKey="Value" radius={[0,6,6,0]}>{bySource.map((e,i)=><Cell key={i} fill={PIE[i%PIE.length]}/>)}</Bar></BarChart></ResponsiveContainer></div>
      </ChartCard>
      <ChartCard title="Conversion Funnel" sub="How far leads get" empty={leads.length?null:'No leads yet.'}>
        <div className="chart-sm"><ResponsiveContainer width="100%" height="100%"><BarChart layout="vertical" data={funnel} margin={{top:4,right:14,left:14,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F6"/><XAxis type="number" allowDecimals={false} tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/><YAxis type="category" dataKey="name" tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false} width={80}/>
          <Tooltip contentStyle={tipStyle} cursor={{fill:'#F4F6FB'}}/><Bar dataKey="Leads" fill={COBALT} radius={[0,6,6,0]}/></BarChart></ResponsiveContainer></div>
      </ChartCard>
    </div>
    <ChartCard title="Service Interest" sub="Across all leads & clients" empty={byService.length?null:'No services tagged yet.'}>
      <div className="chart-sm"><ResponsiveContainer width="100%" height="100%"><BarChart data={byService} margin={{top:6,right:10,left:-12,bottom:0}}>
        <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F6"/><XAxis dataKey="name" tick={{fontSize:10,fill:'#8E89A8'}} axisLine={false} tickLine={false} interval={0} angle={-12} textAnchor="end" height={50}/><YAxis allowDecimals={false} tick={{fontSize:11,fill:'#8E89A8'}} axisLine={false} tickLine={false}/>
        <Tooltip contentStyle={tipStyle} cursor={{fill:'#F4F6FB'}}/><Bar dataKey="Deals" fill={GOLD} radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
    </ChartCard>
  </>);
}

/* ===================== SETTINGS ===================== */
/* ===================== INVOICES ===================== */
function Invoices({invoices,leads,settings,onNew,open}){
  const [filter,setFilter]=useState('all');
  const rows=(invoices||[]).map(inv=>({inv,st:invState(inv),total:invTotal(inv)}));
  const outstanding=rows.filter(r=>r.st!=='paid').reduce((a,r)=>a+r.total,0);
  const paid=rows.filter(r=>r.st==='paid').reduce((a,r)=>a+r.total,0);
  const overdue=rows.filter(r=>r.st==='overdue').length;
  const tabs=[['all','All'],['draft','Draft'],['sent','Sent'],['overdue','Overdue'],['paid','Paid']];
  const shown=rows.filter(r=>filter==='all'?true:r.st===filter).sort((a,b)=>(b.inv.issueDate||'').localeCompare(a.inv.issueDate||''));
  const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
  return (<>
    <div className="kgrid">
      <Kpi variant="accent" label="Outstanding" value={usd(outstanding)} icon={<Receipt size={14}/>} d={`${rows.filter(r=>r.st!=='paid').length} unpaid`}/>
      <Kpi variant="green" label="Collected" value={usd(paid)} icon={<CheckCircle2 size={14}/>} d={`${rows.filter(r=>r.st==='paid').length} paid`}/>
      <Kpi label="Overdue" value={overdue} icon={<AlertTriangle size={14}/>} d="past due date"/>
    </div>
    <div className="inv-bar">
      <div className="seg">{tabs.map(([k,l])=><button key={k} className={'seg-b '+(filter===k?'on':'')} onClick={()=>setFilter(k)}>{l}</button>)}</div>
      <button className="btn btn-p" onClick={()=>onNew()}><Plus size={15}/>New Invoice</button>
    </div>
    <div className="tbl-wrap">
      {shown.length?<table className="tbl"><thead><tr><th>Invoice</th><th>Client</th><th>Issued</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
      <tbody>{shown.map(({inv,st,total})=>(<tr key={inv.id} onClick={()=>open(inv.id)}>
        <td style={{fontWeight:600,color:INK}}>{inv.number}</td>
        <td><div className="namecell">{inv.billTo?.company||inv.billTo?.name||'—'}</div>{inv.billTo?.company&&inv.billTo?.name&&<div className="subcell">{inv.billTo.name}</div>}</td>
        <td className="subcell">{fmtDate(inv.issueDate)}</td>
        <td className="subcell">{fmtDate(inv.dueDate)}</td>
        <td style={{fontWeight:600,color:INK}}>{usd(total)}</td>
        <td><span className={'badge inv-'+st}>{cap(st)}</span></td>
      </tr>))}</tbody></table>
      :<div className="empty">No invoices yet. Hit <b>New Invoice</b> to bill a client.</div>}
    </div>
  </>);
}

function InvoicePreview({inv,settings,saveSettings}){
  const iv=settings.invoicing||DEFAULT_INVOICING; const biz=iv.biz||DEFAULT_INVOICING.biz;
  const accent=iv.accent||'#2B4DE0'; const logoH=iv.logoH||46;
  const layout=iv.layout||DEFAULT_INVOICING.layout;
  const sections={...DEFAULT_INV_SECTIONS,...(iv.sections||{})};
  const [order,setOrder]=useState(layout.order||DEFAULT_INVOICING.layout.order);
  const [dragK,setDragK]=useState(null);
  const [sel,setSel]=useState(null);
  useEffect(()=>{setOrder((iv.layout||DEFAULT_INVOICING.layout).order||DEFAULT_INVOICING.layout.order);},[((iv.layout||{}).order||[]).join(',')]);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const secStyle=k=>{const s=sections[k]||DEFAULT_INV_SECTIONS[k];return {fontSize:s.fz+'px',lineHeight:s.lh};};
  const adj=(k,dfz,dlh)=>{ const cur=sections[k]||DEFAULT_INV_SECTIONS[k]; const next={fz:clamp(+(cur.fz+dfz).toFixed(1),6,30),lh:clamp(+(cur.lh+dlh).toFixed(2),1,2.6)}; if(saveSettings) saveSettings({...settings,invoicing:{...iv,sections:{...sections,[k]:next}}}); };
  const saveLayout=next=>{ if(saveSettings) saveSettings({...settings,invoicing:{...iv,layout:{...layout,...next}}}); };
  const onSecOver=(e,key)=>{ e.preventDefault(); if(!dragK||dragK===key)return; setOrder(o=>{const a=o.filter(k=>k!==dragK);const i=a.indexOf(key);a.splice(i<0?a.length:i,0,dragK);return a;}); };
  const onSecDrop=()=>{ setDragK(null); saveLayout({order}); };
  const swapHeader=()=>saveLayout({headerSwap:!layout.headerSwap});
  const bt=inv.billTo||{}; const items=inv.items||[];
  const sub=invSubtotal(inv),tax=invTax(inv),total=invTotal(inv),st=invState(inv);
  const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
  return (<div className="inv-preview-wrap">
          <div className="inv-page-tools">
            {sel?(()=>{const s=sections[sel]||DEFAULT_INV_SECTIONS[sel];const NAME={headerLeft:'Header · left',headerRight:'Header · right',billto:'Bill To',items:'Line items',totals:'Totals',pay:'Payment link',notes:'Notes'};return(
              <div className="sec-toolbar">
                <span className="sec-tl">{NAME[sel]}</span>
                <span className="sec-grp">Font<button className="stp" onClick={()=>adj(sel,-0.5,0)}>−</button><span className="val">{s.fz}</span><button className="stp" onClick={()=>adj(sel,0.5,0)}>+</button></span>
                <span className="sec-grp">Spacing<button className="stp" onClick={()=>adj(sel,0,-0.05)}>−</button><span className="val">{s.lh.toFixed(2)}</span><button className="stp" onClick={()=>adj(sel,0,0.05)}>+</button></span>
                <button className="sec-done" onClick={()=>setSel(null)}>Done</button>
              </div>);})():<span className="sec-hint">Tap any section to resize its text &amp; spacing · hover to drag</span>}
            <button className="swapbtn" onClick={swapHeader} title="Swap header sides"><ArrowUpDown size={13} style={{transform:'rotate(90deg)'}}/>Swap header</button>
          </div>
          <div className="inv-preview" id="invprint">
            {(()=>{ const bizBlock=(<div key="biz" className={'ip-biz ip-sec'+(sel==='headerLeft'?' sel':'')} style={secStyle('headerLeft')} onClick={e=>{e.stopPropagation();setSel('headerLeft');}}>
                {(iv.showLogo!==false&&settings.logo)?<img src={settings.logo} alt="logo" className="ip-logo" style={{maxHeight:logoH,maxWidth:logoH*4.5}}/>:<div className="ip-name">{biz.name||'ProyTech'}</div>}
                <div className="ip-bizmeta">{(biz.address||'').split('\n').map((l,i)=><div key={i}>{l}</div>)}{biz.email&&<div>{biz.email}</div>}{biz.phone&&<div>{biz.phone}</div>}</div>
              </div>);
              const metaBlock=(<div key="meta" className={'ip-meta ip-sec'+(layout.headerSwap?' left':'')+(sel==='headerRight'?' sel':'')} style={secStyle('headerRight')} onClick={e=>{e.stopPropagation();setSel('headerRight');}}>
                <div className="ip-title" style={{color:accent}}>INVOICE</div>
                <div className="ip-num">{inv.number}</div>
                <div className="ip-dates"><div><span>Issued</span>{fmtDate(inv.issueDate)}</div><div><span>Due</span>{fmtDate(inv.dueDate)}</div></div>
                <div className={'ip-stamp inv-'+st}>{cap(st)}</div>
              </div>);
              return <div className="ip-top">{layout.headerSwap?[metaBlock,bizBlock]:[bizBlock,metaBlock]}</div>; })()}
            <div className="ip-rule" style={{background:accent}}/>
            {(()=>{ const blocks={
                billto:(<div className="ip-billto" style={secStyle('billto')}><div className="ip-lbl">Bill To</div><div className="ip-btname">{bt.company||bt.name||'—'}</div>{bt.company&&bt.name&&<div>{bt.name}</div>}{(bt.address||'').split('\n').map((l,i)=>l&&<div key={i}>{l}</div>)}{bt.email&&<div>{bt.email}</div>}</div>),
                items:(<table className="ip-table" style={secStyle('items')}><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{items.map((it,i)=>(<tr key={it.id||i}><td>{it.label||'—'}</td><td>{num(it.qty)}</td><td>{usd(it.amount)}</td><td>{usd(num(it.qty)*num(it.amount))}</td></tr>))}</tbody></table>),
                totals:(<div className="ip-totals" style={secStyle('totals')}><div className="ip-tr"><span>Subtotal</span><b>{usd(sub)}</b></div>{num(inv.taxRate)>0&&<div className="ip-tr"><span>Tax ({num(inv.taxRate)}%)</span><b>{usd(tax)}</b></div>}<div className="ip-tr ip-grand"><span>Total Due</span><b style={{color:accent}}>{usd(total)}</b></div></div>),
                pay:(iv.showPay!==false&&inv.paymentLink)?(<div className="ip-pay" style={secStyle('pay')}>Pay online: <a href={inv.paymentLink} style={{color:accent}}>{inv.paymentLink}</a></div>):null,
                notes:(iv.showNotes!==false&&inv.notes)?(<div className="ip-notes" style={secStyle('notes')}>{inv.notes}</div>):null,
              };
              return order.filter(k=>blocks[k]).map(key=>(<div key={key} className={'ip-block ip-sec'+(dragK===key?' dragk':'')+(sel===key?' sel':'')} draggable onDragStart={()=>setDragK(key)} onDragOver={e=>onSecOver(e,key)} onDragEnd={onSecDrop} onClick={e=>{e.stopPropagation();setSel(key);}}>
                <span className="ip-drag" title="Drag to reorder"><GripVertical size={13}/></span>
                {blocks[key]}
              </div>)); })()}
          </div>
        </div>);
}

function InvoiceModal({invoice,leads,settings,saveSettings,onSave,onDelete,onClose}){
  const [inv,setInv]=useState(invoice);
  useEffect(()=>setInv(invoice),[invoice.id]);
  const patch=p=>{const n={...inv,...p};setInv(n);onSave(n);};
  const iv=settings.invoicing||DEFAULT_INVOICING;
  const bt=inv.billTo||{};
  const setBT=p=>patch({billTo:{...bt,...p}});
  const items=inv.items||[];
  const setItem=(i,p)=>{const a=items.slice();a[i]={...a[i],...p};patch({items:a});};
  const addItem=()=>patch({items:[...items,{id:uid(),label:'',qty:1,amount:0}]});
  const delItem=i=>patch({items:items.filter((_,j)=>j!==i)});
  const pickClient=id=>{const l=leads.find(x=>x.id===id); if(!l){patch({clientId:''});return;} patch({clientId:id,billTo:{name:l.name||'',company:l.company||'',email:l.email||'',address:bt.address||''},items:itemsFromLead(l)});};
  const sub=invSubtotal(inv),tax=invTax(inv),total=invTotal(inv),st=invState(inv);
  const cap=s=>s?s[0].toUpperCase()+s.slice(1):s;
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal inv-modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head">
        <div style={{minWidth:0}}><h2>{inv.number}</h2><div className="meta">Invoice · {cap(st)}</div></div>
        <div className="inv-actions">
          {inv.status!=='paid'&&inv.status!=='sent'&&<button className="btn btn-s btn-sm" onClick={()=>patch({status:'sent'})}><Send size={14}/>Mark sent</button>}
          {inv.status!=='paid'
            ? <button className="btn btn-p btn-sm" onClick={()=>patch({status:'paid',paidDate:todayISO()})}><CheckCircle2 size={14}/>Mark paid</button>
            : <button className="btn btn-s btn-sm" onClick={()=>patch({status:'sent',paidDate:''})}>Unmark paid</button>}
          <button className="btn btn-s btn-sm" onClick={()=>window.print()}><Printer size={14}/>Print / PDF</button>
          <button className="m-x" onClick={onClose}><X size={18}/></button>
        </div>
      </div>
      <div className="inv-body">
        <div className="inv-edit">
          <div className="dh"><Contact2 size={13}/>Bill To</div>
          <div className="field" style={{marginBottom:10}}><label>Client (auto-fills)</label><select value={inv.clientId||''} onChange={e=>pickClient(e.target.value)}><option value="">— Manual / no client —</option>{leads.map(l=><option key={l.id} value={l.id}>{l.company||l.name}</option>)}</select></div>
          <div className="fgrid">
            <div className="field"><label>Company</label><input value={bt.company||''} onChange={e=>setBT({company:e.target.value})}/></div>
            <div className="field"><label>Contact name</label><input value={bt.name||''} onChange={e=>setBT({name:e.target.value})}/></div>
            <div className="field"><label>Email</label><input value={bt.email||''} onChange={e=>setBT({email:e.target.value})}/></div>
            <div className="field full"><label>Address</label><textarea rows={2} value={bt.address||''} onChange={e=>setBT({address:e.target.value})}/></div>
          </div>
          <div className="dh mt"><CalendarClock size={13}/>Invoice details</div>
          <div className="fgrid">
            <div className="field"><label>Invoice #</label><input value={inv.number||''} onChange={e=>patch({number:e.target.value})}/></div>
            <div className="field"><label>Issue date</label><input type="date" value={inv.issueDate||''} onChange={e=>patch({issueDate:e.target.value})}/></div>
            <div className="field"><label>Due date</label><input type="date" value={inv.dueDate||''} onChange={e=>patch({dueDate:e.target.value})}/></div>
          </div>
          <div className="dh mt"><DollarSign size={13}/>Line Items</div>
          <div className="inv-items-edit">
            <div className="iie-h"><span>Description</span><span>Qty</span><span>Rate</span><span>Amount</span><span/></div>
            {items.map((it,i)=>(<div className="iie-row" key={it.id||i}>
              <input className="iie-label" value={it.label||''} placeholder="Description" onChange={e=>setItem(i,{label:e.target.value})}/>
              <input className="iie-qty" type="number" value={it.qty??1} onChange={e=>setItem(i,{qty:e.target.value})}/>
              <input className="iie-rate" type="number" value={it.amount??0} onChange={e=>setItem(i,{amount:e.target.value})}/>
              <span className="iie-amt">{usd(num(it.qty)*num(it.amount))}</span>
              <button className="ex-del" onClick={()=>delItem(i)}><X size={14}/></button>
            </div>))}
            <button className="addline" onClick={addItem}><Plus size={13}/>Add item</button>
          </div>
          <div className="fgrid" style={{marginTop:12}}>
            <div className="field"><label>Tax rate (%)</label><input type="number" value={inv.taxRate??0} onChange={e=>patch({taxRate:num(e.target.value)})}/></div>
            <div className="field"><label>Payment link</label><input placeholder="https://…" value={inv.paymentLink||''} onChange={e=>patch({paymentLink:e.target.value})}/></div>
            <div className="field full"><label>Notes / terms</label><textarea rows={2} value={inv.notes||''} onChange={e=>patch({notes:e.target.value})}/></div>
          </div>
          <button className="btn btn-d btn-sm" style={{marginTop:14}} onClick={()=>{if(window.confirm('Delete invoice '+inv.number+'? This cannot be undone.'))onDelete(inv.id);}}><Trash2 size={14}/>Delete invoice</button>
        </div>

        <InvoicePreview inv={inv} settings={settings} saveSettings={saveSettings}/>
      </div>
    </div>
  </div>);
}

const TX_TYPES={
  income:{label:'Money in',dir:'in'},
  contribution:{label:'Owner contribution',dir:'in'},
  expense:{label:'Expense',dir:'out'},
  draw:{label:'Owner draw',dir:'out'},
};
const EXP_CATS=['Software','Advertising','Office','Meals','Travel','Contractors','Fees','Equipment','Other'];
const INC_CATS=['Client payment','Retainer','Refund','Other'];
const TX_WHO=['Business',...BRAND.team];
const TX_METHODS=['Card','Bank transfer','Cash','Check','Other'];
const csvq=s=>{s=String(s==null?'':s);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const toB64=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});

/* ===================== Tasks (shared · AI-ranked) ===================== */
const TASK_OWNERS=[...BRAND.team,'Both'];
const OWNER_PALETTE=[COBALT,'#7A5CC8','#0E9AA7','#D97706'];
const ownerColor=o=>{const i=BRAND.team.indexOf(o);return i>=0?OWNER_PALETTE[i%OWNER_PALETTE.length]:GREEN;};
const meOwner=me=>BRAND.team.includes(me)?me:(BRAND.team[0]||'');
const newTask=owner=>({id:uid(),title:'',notes:'',owner:owner||'Both',leadId:'',due:'',revenue:3,urgency:3,effort:3,done:false,doneAt:'',doneBy:'',aiRank:null,aiReason:'',createdAt:new Date().toISOString()});
const taskScore=t=>num(t.revenue)*num(t.urgency);

function Tasks({tasks,leads,me,upsertTask,deleteTask,saveTasks}){
  const [who,setWho]=useState('all');
  const [show,setShow]=useState('open');
  const [title,setTitle]=useState('');
  const [addOwner,setAddOwner]=useState(meOwner(me));
  const [edit,setEdit]=useState(null);
  const [busy,setBusy]=useState(false);
  const leadName=id=>{const l=leads.find(x=>x.id===id);return l?(l.company||l.name||'Lead'):'';};

  const add=()=>{ const t=title.trim(); if(!t)return; upsertTask({...newTask(addOwner),title:t}); setTitle(''); };

  const filtered=tasks.filter(t=>{
    const w=who==='all'||(who==='mine'&&t.owner===meOwner(me))||(who==='logan'&&t.owner==='Logan')||(who==='both'&&t.owner==='Both');
    const s=show==='all'||(show==='open'&&!t.done)||(show==='done'&&t.done);
    return w&&s;
  });
  const ordered=[...filtered].sort((a,b)=>{
    if(a.done!==b.done)return a.done?1:-1;
    if(a.aiRank!=null&&b.aiRank!=null)return a.aiRank-b.aiRank;
    if(a.aiRank!=null)return -1; if(b.aiRank!=null)return 1;
    if(taskScore(b)!==taskScore(a))return taskScore(b)-taskScore(a);
    if(num(a.effort)!==num(b.effort))return num(a.effort)-num(b.effort);
    return (a.createdAt||'').localeCompare(b.createdAt||'');
  });
  const ranked=tasks.some(t=>!t.done&&t.aiRank!=null);

  const runAI=async()=>{
    const open=tasks.filter(t=>!t.done);
    if(!open.length){window.alert('No open tasks to rank yet.');return;}
    setBusy(true);
    try{
      const payload=open.map(t=>({id:t.id,title:t.title,notes:t.notes||'',owner:t.owner,lead:leadName(t.leadId),due:t.due||'',revenue:num(t.revenue),urgency:num(t.urgency),effort:num(t.effort)}));
      const r=await fetch('/api/rank-tasks',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tasks:payload})});
      const j=await r.json();
      if(!j.ok){window.alert('AI ranking isn\u2019t available: '+(j.error||'unknown')+'.\nTasks are still sorted by impact \u00d7 urgency.');setBusy(false);return;}
      const map={}; (j.ranking||[]).forEach((x,i)=>{map[x.id]={rank:i+1,reason:x.reason||''};});
      saveTasks(tasks.map(t=>{ if(t.done)return {...t,aiRank:null}; const m=map[t.id]; return m?{...t,aiRank:m.rank,aiReason:m.reason}:{...t,aiRank:null,aiReason:''}; }));
    }catch(e){window.alert('AI ranking failed: '+(e.message||e));}
    setBusy(false);
  };
  const clearAI=()=>saveTasks(tasks.map(t=>({...t,aiRank:null,aiReason:''})));

  return (<>
    <div className="card" style={{marginBottom:16}}>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
        <input value={title} onChange={e=>setTitle(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')add();}} placeholder="Add a task and hit Enter\u2026" style={{flex:'1 1 260px',padding:'11px 13px',border:'1px solid #E2E3EE',borderRadius:11,fontSize:14,background:'#fff',color:INK}}/>
        <div className="seg">{TASK_OWNERS.map(o=><button key={o} className={'seg-b '+(addOwner===o?'on':'')} onClick={()=>setAddOwner(o)}>{o}</button>)}</div>
        <button className="btn btn-p" onClick={add}><Plus size={16}/>Add</button>
      </div>
    </div>

    <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:14}}>
      <div className="seg">
        <button className={'seg-b '+(who==='all'?'on':'')} onClick={()=>setWho('all')}>All</button>
        <button className={'seg-b '+(who==='mine'?'on':'')} onClick={()=>setWho('mine')}>Mine</button>
        <button className={'seg-b '+(who==='logan'?'on':'')} onClick={()=>setWho('logan')}>Logan</button>
        <button className={'seg-b '+(who==='both'?'on':'')} onClick={()=>setWho('both')}>Shared</button>
      </div>
      <div className="seg">
        <button className={'seg-b '+(show==='open'?'on':'')} onClick={()=>setShow('open')}>Open</button>
        <button className={'seg-b '+(show==='done'?'on':'')} onClick={()=>setShow('done')}>Done</button>
        <button className={'seg-b '+(show==='all'?'on':'')} onClick={()=>setShow('all')}>All</button>
      </div>
      <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
        {ranked&&<button className="btn btn-g btn-sm" onClick={clearAI}>Clear ranking</button>}
        <button className="btn btn-p" disabled={busy} onClick={runAI}>{busy?<Loader2 size={15} className="spin"/>:<Sparkles size={15}/>}{busy?'Ranking\u2026':'AI rank'}</button>
      </div>
    </div>

    {ranked&&<div className="ai-banner ai-done" style={{marginBottom:14}}><Sparkles size={15}/>Ranked for the $10K sprint \u2014 top of the list moves cash first.</div>}

    {ordered.length? <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {ordered.map(t=>{
        const du=t.due?daysUntil(t.due):null;
        const dueColor=du==null?'#8b88a0':du<0?RED:du===0?GOLD:'#5A5680';
        const dueLabel=t.due?(du<0?`${-du}d overdue`:du===0?'Due today':du===1?'Due tomorrow':`Due in ${du}d`):'No date';
        return (<div key={t.id} className="card" style={{padding:'13px 15px',display:'flex',gap:12,alignItems:'flex-start',opacity:t.done?.6:1}}>
          <button onClick={()=>upsertTask({...t,done:!t.done,doneAt:t.done?'':new Date().toISOString(),doneBy:t.done?'':(t.owner&&t.owner!=='Both'?t.owner:me),aiRank:t.done?t.aiRank:null,aiReason:t.done?t.aiReason:''})} style={{background:'none',border:'none',cursor:'pointer',padding:0,marginTop:1,color:t.done?GREEN:'#c3c2d4',flex:'none'}} title={t.done?'Mark open':'Mark done'}>{t.done?<CheckCircle2 size={22}/>:<Circle size={22}/>}</button>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              {t.aiRank!=null&&!t.done&&<span className="pill" style={{background:INK,color:'#fff',fontWeight:700}}>#{t.aiRank}</span>}
              <span style={{fontWeight:600,color:INK,fontSize:15,textDecoration:t.done?'line-through':'none'}}>{t.title}</span>
            </div>
            {t.aiReason&&!t.done&&<div style={{fontSize:12.5,color:COBALT,marginTop:4,display:'flex',alignItems:'center',gap:5}}><Sparkles size={12}/>{t.aiReason}</div>}
            <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:8,alignItems:'center'}}>
              <span className="pill" style={{background:ownerColor(t.owner)+'1A',color:ownerColor(t.owner)}}><span className="dot" style={{background:ownerColor(t.owner)}}/>{t.owner}</span>
              {t.leadId&&leadName(t.leadId)&&<span className="pill" style={{background:'#F0F1F7',color:'#5A5680'}}><Building2 size={11}/>{leadName(t.leadId)}</span>}
              <span className="pill" style={{background:du!=null&&du<0?'rgba(209,67,67,.1)':'#F0F1F7',color:dueColor}}><CalendarClock size={11}/>{dueLabel}</span>
              <span style={{fontSize:11,color:'#a6a2bc'}}>Impact {t.revenue} \u00b7 Urgency {t.urgency} \u00b7 Effort {t.effort}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:4,flex:'none'}}>
            <button className="m-x" style={{width:30,height:30}} onClick={()=>setEdit(t)} title="Edit"><SlidersHorizontal size={15}/></button>
            <button className="m-x" style={{width:30,height:30}} onClick={()=>{if(window.confirm('Delete this task?'))deleteTask(t.id);}} title="Delete"><Trash2 size={15}/></button>
          </div>
        </div>);
      })}
    </div>
    : <div className="empty">{show==='done'?'Nothing checked off yet.':'No tasks yet. Add your first one above \u2014 dump everything in your head here.'}</div>}

    {edit&&<TaskModal task={edit} leads={leads} onSave={t=>{upsertTask(t);setEdit(null);}} onDelete={id=>{deleteTask(id);setEdit(null);}} onClose={()=>setEdit(null)}/>}
  </>);
}

function TaskModal({task,leads,onSave,onDelete,onClose}){
  const [d,setD]=useState({...task});
  const set=p=>setD(x=>({...x,...p}));
  const Knob=({label,field,hint})=>(<div className="field"><label>{label} \u2014 {d[field]} <span style={{color:'#a6a2bc',fontWeight:400}}>{hint}</span></label><input type="range" min="1" max="5" value={d[field]} onChange={e=>set({[field]:Number(e.target.value)})}/></div>);
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal" style={{maxWidth:520}} onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head"><div><h2>Edit task</h2><div className="meta">Tune the knobs so the AI ranks it right</div></div><button className="m-x" onClick={onClose}><X size={18}/></button></div>
      <div style={{padding:'4px 22px 22px'}}>
        <div className="field"><label>Task</label><input value={d.title||''} onChange={e=>set({title:e.target.value})} placeholder="What needs doing?"/></div>
        <div className="fgrid">
          <div className="field"><label>Owner</label><select value={d.owner} onChange={e=>set({owner:e.target.value})}>{TASK_OWNERS.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
          <div className="field"><label>Due date</label><input type="date" value={d.due||''} onChange={e=>set({due:e.target.value})}/></div>
          <div className="field full"><label>Link a lead / deal</label><select value={d.leadId||''} onChange={e=>set({leadId:e.target.value})}><option value="">\u2014 none \u2014</option>{leads.map(l=><option key={l.id} value={l.id}>{l.company||l.name||'Lead'}</option>)}</select></div>
        </div>
        <Knob label="Revenue impact" field="revenue" hint="how much cash it moves"/>
        <Knob label="Urgency" field="urgency" hint="how time-sensitive"/>
        <Knob label="Effort" field="effort" hint="1 = quick win, 5 = heavy lift"/>
        <div className="field"><label>Notes</label><input value={d.notes||''} onChange={e=>set({notes:e.target.value})} placeholder="Any detail that helps the ranking"/></div>
        <div style={{display:'flex',gap:8,marginTop:16,alignItems:'center'}}>
          <button className="btn btn-p" onClick={()=>onSave({...d,title:(d.title||'').trim()||'Untitled task'})}><CheckCircle2 size={15}/>Save</button>
          <button className="btn btn-d btn-sm" onClick={()=>{if(window.confirm('Delete this task?'))onDelete(d.id);}}><Trash2 size={14}/>Delete</button>
        </div>
      </div>
    </div>
  </div>);
}

function Books({txns,upsertTxn,deleteTxn}){
  const thisYear=todayISO().slice(0,4);
  const [year,setYear]=useState(thisYear);
  const [filter,setFilter]=useState('all');
  const [edit,setEdit]=useState(null); // {txn, file}
  const [busy,setBusy]=useState(false);
  const fileRef=React.useRef(null);
  const years=useMemo(()=>{const s=new Set(txns.map(t=>(t.date||'').slice(0,4)).filter(Boolean));s.add(thisYear);return [...s].sort().reverse();},[txns,thisYear]);
  const yearTxns=useMemo(()=>txns.filter(t=>(t.date||'').slice(0,4)===year).sort((a,b)=>(b.date||'').localeCompare(a.date||'')),[txns,year]);
  const shown=yearTxns.filter(t=>{const d=TX_TYPES[t.type]?.dir;return filter==='all'||(filter==='in'&&d==='in')||(filter==='out'&&d==='out')||(filter==='draw'&&t.type==='draw');});
  const sum=pred=>yearTxns.filter(pred).reduce((a,t)=>a+num(t.amount),0);
  const moneyIn=sum(t=>TX_TYPES[t.type]?.dir==='in');
  const moneyOut=sum(t=>TX_TYPES[t.type]?.dir==='out');
  const net=moneyIn-moneyOut;
  const expenses=sum(t=>t.type==='expense');
  const draws=BRAND.team.map(nm=>({nm,amt:sum(t=>t.type==='draw'&&t.who===nm)}));
  const drawTotal=draws.reduce((a,d)=>a+d.amt,0);
  const openReceipt=async t=>{ if(!t.receipt?.path)return; try{ const url=await db.receiptUrl(t.receipt.path); if(url){window.open(url,'_blank');return;} }catch(e){} try{ const blob=await db.downloadReceipt(t.receipt.path); const u=URL.createObjectURL(blob); window.open(u,'_blank'); }catch(e){ window.alert('Could not open the receipt file.'); } };
  const onPickReceipt=e=>{ const f=e.target.files?.[0]; e.target.value=''; if(!f)return; setEdit({txn:null,file:f}); };
  const downloadYear=async()=>{
    if(!yearTxns.length){window.alert('No transactions for '+year+' yet.');return;}
    setBusy(true);
    try{
      const zip=new JSZip();
      const head=['Date','Type','Category','Vendor/Source','Method','Who','Amount','Notes','Receipt file'];
      const lines=[head.join(',')].concat(yearTxns.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).map(t=>{
        const signed=(TX_TYPES[t.type]?.dir==='out'?-1:1)*num(t.amount);
        return [t.date||'',TX_TYPES[t.type]?.label||t.type,t.category||'',csvq(t.party),t.method||'',t.who||'',signed,csvq(t.notes),t.receipt?.name||''].join(',');
      }));
      lines.push(['','','','','','','TOTALS','',''].join(','));
      lines.push(['Money in','','','','','',moneyIn,'',''].join(','));
      lines.push(['Money out','','','','','',moneyOut,'',''].join(','));
      lines.push(['Net','','','','','',net,'',''].join(','));
      zip.file(`books-${year}.csv`,lines.join('\n'));
      const rf=zip.folder('receipts');
      let missing=0;
      for(const t of yearTxns){ if(t.receipt?.path&&typeof db.downloadReceipt==='function'){ try{ const blob=await db.downloadReceipt(t.receipt.path); rf.file((t.date||'')+'-'+(t.receipt.name||t.receipt.path.split('/').pop()),blob);}catch(e){missing++;} } }
      const out=await zip.generateAsync({type:'blob'});
      const u=URL.createObjectURL(out);const a=document.createElement('a');a.href=u;a.download=`the-books-${year}.zip`;a.click();URL.revokeObjectURL(u);
      if(missing)window.alert('Bundle downloaded. '+missing+' receipt file(s) could not be fetched (storage may not be set up yet).');
    }catch(e){window.alert('Could not build the bundle: '+(e.message||e));}
    setBusy(false);
  };
  return (<>
    <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{display:'none'}} onChange={onPickReceipt}/>
    <div className="card" style={{marginBottom:18}}>
      <div className="bk-actions">
        <button className="btn btn-p" onClick={()=>fileRef.current?.click()}><Upload size={15}/>Upload receipt</button>
        <button className="btn btn-s" onClick={()=>setEdit({txn:null,file:null})}><Plus size={15}/>Add transaction</button>
        <button className="btn btn-s" style={{marginLeft:'auto'}} disabled={busy} onClick={downloadYear}>{busy?<Loader2 size={15} className="spin"/>:<FileDown size={15}/>}Download {year} for CPA</button>
      </div>
    </div>
    <div className="kpis">
      <Kpi variant="accent" label="Money in" value={usd(moneyIn)} icon={<ArrowDownLeft size={14}/>} d={year}/>
      <Kpi label="Money out" value={usd(moneyOut)} icon={<ArrowUpRight size={14}/>} d={`${usd(expenses)} expenses`}/>
      <Kpi label="Net" value={usd(net)} icon={<Wallet size={14}/>} d={net>=0?'positive':'negative'}/>
      <Kpi label="Owner draws" value={usd(drawTotal)} icon={<Wallet size={14}/>} d={draws.map(d=>`${d.nm[0]} ${usd(d.amt)}`).join(' · ')||'—'}/>
    </div>
    <div className="bk-filters">
      {[['all','All'],['in','Money in'],['out','Money out'],['draw','Draws']].map(([k,l])=>(
        <button key={k} className={'bk-chip'+(filter===k?' on':'')} onClick={()=>setFilter(k)}>{l}</button>))}
      <div className="bk-yr"><span style={{fontSize:12,color:'#8b88a0',fontWeight:600}}>Year</span><select value={year} onChange={e=>setYear(e.target.value)}>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></div>
    </div>
    <div className="card">
      {shown.length?<table className="tbl"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Vendor / Source</th><th>Who</th><th>Receipt</th><th style={{textAlign:'right'}}>Amount</th></tr></thead>
      <tbody>{shown.map(t=>{const m=TX_TYPES[t.type]||{};const out=m.dir==='out';return(<tr key={t.id} onClick={()=>setEdit({txn:t,file:null})}>
        <td className="subcell">{fmtDate(t.date)}</td>
        <td><span className="tx-type">{out?<ArrowUpRight size={13} color="#b4322e"/>:<ArrowDownLeft size={13} color="#1f9d63"/>}{m.label||t.type}</span></td>
        <td className="subcell">{t.category||'—'}</td>
        <td><div className="namecell">{t.party||'—'}</div>{t.notes&&<div className="subcell">{t.notes}</div>}</td>
        <td className="subcell">{t.who||'—'}</td>
        <td onClick={e=>{e.stopPropagation();if(t.receipt)openReceipt(t);}}>{t.receipt?<span className="rc-btn"><Paperclip size={13}/>View</span>:<span className="rc-none">—</span>}</td>
        <td style={{textAlign:'right'}}><span className={'tx-amt '+(out?'tx-out':'tx-in')}>{out?'−':'+'}{usd(num(t.amount))}</span></td>
      </tr>);})}</tbody></table>
      :<div className="empty">No {filter==='all'?'':TX_TYPES[filter]?'':''}transactions for {year} yet. Hit <b>Upload receipt</b> or <b>Add transaction</b> to start the books.</div>}
    </div>
    {edit&&<TxnModal txn={edit.txn} file={edit.file} onSave={t=>{upsertTxn(t);setEdit(null);}} onDelete={t=>{deleteTxn(t);setEdit(null);}} onClose={()=>setEdit(null)}/>}
  </>);
}

function TxnModal({txn,file,onSave,onDelete,onClose}){
  const [d,setD]=useState(txn?{...txn}:{id:uid(),type:file?'expense':'expense',date:todayISO(),amount:'',category:'',party:'',method:'Card',who:'Business',notes:'',receipt:null,createdAt:new Date().toISOString()});
  const [ai,setAi]=useState(null); // null | reading | done | off
  const [saving,setSaving]=useState(false);
  const set=p=>setD(x=>({...x,...p}));
  useEffect(()=>{ if(!file||txn) return; let go=true; (async()=>{ setAi('reading');
    try{ const b64=await toB64(file); const r=await fetch('/api/parse-receipt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({file:b64,mime:file.type})}); const j=await r.json();
      if(go&&j&&j.ok&&j.fields){ const f=j.fields; setD(x=>({...x,type:'expense',party:f.vendor||x.party,date:f.date||x.date,amount:f.total||x.amount,category:f.category||x.category,notes:f.summary||x.notes})); setAi('done'); }
      else if(go){ setAi('off'); } }
    catch(e){ if(go)setAi('off'); } })(); return ()=>{go=false;}; },[]);
  const cats=(d.type==='income'||d.type==='contribution')?INC_CATS:EXP_CATS;
  const showCat=d.type==='income'||d.type==='expense';
  const save=async()=>{
    let receipt=d.receipt||null;
    if(file){ setSaving(true);
      const yr=(d.date||todayISO()).slice(0,4);
      const safe=(file.name||'receipt.pdf').replace(/[^\w.\-]+/g,'_');
      const path=`${yr}/${d.id}-${safe}`;
      try{ if(typeof db.uploadReceipt==='function'){ await db.uploadReceipt(path,file); receipt={path,name:file.name||safe,uploadedAt:new Date().toISOString()}; } }
      catch(e){ window.alert('Transaction saved — but the receipt file could not be stored yet. Finish the one-time Storage setup, then re-upload this receipt. ('+(e.message||e)+')'); }
      setSaving(false);
    }
    onSave({...d,amount:num(d.amount),receipt});
  };
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal" style={{maxWidth:560}} onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head"><div><h2>{txn?'Edit transaction':'New transaction'}</h2><div className="meta">The Books</div></div><button className="m-x" onClick={onClose}><X size={18}/></button></div>
      <div style={{padding:'4px 22px 22px'}}>
        {ai==='reading'&&<div className="ai-banner ai-reading"><Loader2 size={15} className="spin"/>Reading the receipt…</div>}
        {ai==='done'&&<div className="ai-banner ai-done"><Sparkles size={15}/>Filled in from your receipt — review and tweak below.</div>}
        {ai==='off'&&<div className="ai-banner ai-off"><AlertTriangle size={15}/>AI read-back isn't on yet — type the details (your file is still attached). </div>}
        <div className="fgrid">
          <div className="field"><label>Type</label><select value={d.type} onChange={e=>set({type:e.target.value})}>{Object.entries(TX_TYPES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></div>
          <div className="field"><label>Amount</label><input type="number" inputMode="decimal" value={d.amount} onChange={e=>set({amount:e.target.value})} placeholder="0.00"/></div>
          <div className="field"><label>Date</label><input type="date" value={d.date||''} onChange={e=>set({date:e.target.value})}/></div>
          {showCat&&<div className="field"><label>Category</label><select value={d.category||''} onChange={e=>set({category:e.target.value})}><option value="">— pick —</option>{cats.map(c=><option key={c} value={c}>{c}</option>)}</select></div>}
          <div className="field"><label>{TX_TYPES[d.type]?.dir==='in'?'Source':'Vendor'}</label><input value={d.party||''} onChange={e=>set({party:e.target.value})} placeholder={TX_TYPES[d.type]?.dir==='in'?'Who paid you':'Who you paid'}/></div>
          <div className="field"><label>Method</label><select value={d.method||'Card'} onChange={e=>set({method:e.target.value})}>{TX_METHODS.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
          <div className="field"><label>Who</label><select value={d.who||'Business'} onChange={e=>set({who:e.target.value})}>{TX_WHO.map(w=><option key={w} value={w}>{w}</option>)}</select></div>
          <div className="field full"><label>Notes</label><input value={d.notes||''} onChange={e=>set({notes:e.target.value})} placeholder="What was this for?"/></div>
        </div>
        {file&&<div className="rcfile"><Paperclip size={14}/>{file.name}<span style={{marginLeft:'auto',color:'#8b88a0'}}>will be saved with this entry</span></div>}
        {!file&&d.receipt&&<div className="rcfile"><Paperclip size={14}/>{d.receipt.name}<span style={{marginLeft:'auto',color:'#8b88a0'}}>receipt on file</span></div>}
        <div style={{display:'flex',gap:8,marginTop:16,alignItems:'center'}}>
          <button className="btn btn-p" disabled={saving} onClick={save}>{saving?<Loader2 size={15} className="spin"/>:<CheckCircle2 size={15}/>}Save</button>
          {txn&&<button className="btn btn-d btn-sm" onClick={()=>{if(window.confirm('Delete this transaction?'))onDelete(txn);}}><Trash2 size={14}/>Delete</button>}
        </div>
      </div>
    </div>
  </div>);
}

const ACT_COLORS={Call:'#2B4DE0',Text:'#1F9D55',Meeting:'#7A5CC8',Note:'#C8A24A',Email:'#D14343',Task:'#0E9AA7'};
const ACT_ORDER=['Call','Text','Meeting','Note','Email','Task'];
const ACT_ICON={Note:StickyNote,Call:PhoneCall,Text:MessageSquare,Meeting:CalendarClock,Email:Mailbox,Task:ListTodo};
function Activity({leads,tasks,me,open}){
  const [mode,setMode]=useState('day');
  const [anchor,setAnchor]=useState(todayISO());
  const [who,setWho]=useState('All');
  const [typeF,setTypeF]=useState('All');
  const range=useMemo(()=>{
    const d=new Date(anchor+'T00:00:00'); let start,end,label;
    if(mode==='day'){ start=new Date(d); end=new Date(d); label=d.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'}); }
    else if(mode==='week'){ const dow=d.getDay(); start=new Date(d); start.setDate(d.getDate()-dow); end=new Date(start); end.setDate(start.getDate()+6); label=start.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' – '+end.toLocaleDateString(undefined,{month:'short',day:'numeric'}); }
    else { start=new Date(d.getFullYear(),d.getMonth(),1); end=new Date(d.getFullYear(),d.getMonth()+1,0); label=d.toLocaleDateString(undefined,{month:'long',year:'numeric'}); }
    start.setHours(0,0,0,0); end.setHours(23,59,59,999); return {start,end,label};
  },[mode,anchor]);
  const all=useMemo(()=>{
    const acts=leads.flatMap(l=>(l.activities||[]).map(a=>({...a,leadId:l.id,leadName:l.name,company:l.company})));
    /* completed tasks count as work done — fold them into the same feed */
    const done=(tasks||[]).filter(t=>t.done&&t.doneAt).map(t=>{
      const l=leads.find(x=>x.id===t.leadId);
      return {id:'task-'+t.id,ts:t.doneAt,type:'Task',text:t.title||'(untitled task)',who:t.doneBy||(t.owner&&t.owner!=='Both'?t.owner:'—'),
        leadId:t.leadId||'',leadName:l?l.name:'',company:l?l.company:'',isTask:true};
    });
    return [...acts,...done];
  },[leads,tasks]);
  const inRange=useMemo(()=>all.filter(a=>{const t=new Date(a.ts);return t>=range.start&&t<=range.end;}),[all,range]);
  const people=useMemo(()=>{const s=new Set(inRange.map(a=>a.who||'—'));BRAND.team.forEach(p=>s.add(p));return [...s].filter(Boolean).sort();},[inRange]);
  /* the person filter drives the WHOLE tab — KPIs, chart, matrix and log */
  const scope=useMemo(()=>inRange.filter(a=>who==='All'||a.who===who),[inRange,who]);
  const shown=scope.filter(a=>typeF==='All'||a.type===typeF).sort((a,b)=>(b.ts||'').localeCompare(a.ts||''));
  const matrix=useMemo(()=>{const m={};const zero=()=>ACT_ORDER.reduce((o,k)=>(o[k]=0,o),{total:0});scope.forEach(a=>{const p=a.who||'—';m[p]=m[p]||zero();if(m[p][a.type]!=null)m[p][a.type]++;m[p].total++;});return m;},[scope]);
  const chartData=Object.entries(matrix).map(([person,c])=>({person,...c})).sort((a,b)=>b.total-a.total);
  const totals=ACT_ORDER.reduce((o,t)=>{o[t]=scope.filter(a=>a.type===t).length;return o;},{});
  const grand=scope.length;
  const shift=dir=>{const d=new Date(anchor+'T00:00:00');if(mode==='day')d.setDate(d.getDate()+dir);else if(mode==='week')d.setDate(d.getDate()+7*dir);else d.setMonth(d.getMonth()+dir);setAnchor(d.toISOString().slice(0,10));};
  const fmtTime=ts=>{try{return new Date(ts).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}catch{return '';}};
  const dayHead=ts=>new Date(ts).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'});
  const kIcon=t=>{const I=ACT_ICON[t];return I?React.createElement(I,{size:14}):null;};
  let lastDay=null;
  return (<>
    <div className="card" style={{marginBottom:16}}>
      <div className="act-ctrl">
        <div className="seg">{[['day','Day'],['week','Week'],['month','Month']].map(([k,l])=><button key={k} className={mode===k?'on':''} onClick={()=>setMode(k)}>{l}</button>)}</div>
        <div className="act-nav"><button className="iconbtn" onClick={()=>shift(-1)}><ChevronLeft size={16}/></button><b>{range.label}</b><button className="iconbtn" onClick={()=>shift(1)}><ChevronRight size={16}/></button></div>
        <input type="date" value={anchor} onChange={e=>setAnchor(e.target.value)} style={{padding:'7px 10px',border:'1px solid #E1E2EC',borderRadius:9,fontSize:13,color:INK}}/>
        <button className="btn btn-s btn-sm" style={{marginLeft:'auto'}} onClick={()=>{setMode('day');setAnchor(todayISO());}}>Today</button>
      </div>
      <div className="bk-filters" style={{margin:0}}>
        <button className={'bk-chip'+(who==='All'?' on':'')} onClick={()=>setWho('All')}>Everyone</button>
        {people.map(p=><button key={p} className={'bk-chip'+(who===p?' on':'')} onClick={()=>setWho(p)}>{p}</button>)}
        <span style={{width:1,height:22,background:'#E4E5EE',margin:'0 4px'}}/>
        <button className={'bk-chip'+(typeF==='All'?' on':'')} onClick={()=>setTypeF('All')}>All types</button>
        {ACT_ORDER.map(t=><button key={t} className={'bk-chip'+(typeF===t?' on':'')} onClick={()=>setTypeF(t)}>{t}</button>)}
      </div>
    </div>
    <div className="kpis">
      <Kpi variant="accent" label="Total logged" value={grand} icon={<List size={14}/>} d={(who==='All'?'Everyone':who)+' · '+range.label}/>
      {ACT_ORDER.map(t=><Kpi key={t} label={t+'s'} value={totals[t]} icon={kIcon(t)}/>)}
    </div>
    {chartData.length>0&&<div className="card" style={{marginBottom:16}}>
      <div className="ch-title">Activity by person</div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={chartData} margin={{top:8,right:8,left:-14,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#EEF0F5" vertical={false}/>
          <XAxis dataKey="person" tick={{fontSize:12,fill:'#6a6788'}}/>
          <YAxis allowDecimals={false} tick={{fontSize:12,fill:'#9b98ad'}}/>
          <Tooltip/>
          <Legend wrapperStyle={{fontSize:12}}/>
          {ACT_ORDER.map(t=><Bar key={t} dataKey={t} stackId="a" fill={ACT_COLORS[t]} radius={t==='Email'?[4,4,0,0]:0}/>)}
        </BarChart>
      </ResponsiveContainer>
    </div>}
    {chartData.length>0&&<div className="card" style={{marginBottom:16}}>
      <table className="tbl"><thead><tr><th>Person</th>{ACT_ORDER.map(t=><th key={t} style={{textAlign:'right'}}>{t}</th>)}<th style={{textAlign:'right'}}>Total</th></tr></thead>
      <tbody>{chartData.map(r=>(<tr key={r.person}><td className="namecell">{r.person}</td>{ACT_ORDER.map(t=><td key={t} style={{textAlign:'right'}} className="subcell">{r[t]||0}</td>)}<td style={{textAlign:'right',fontWeight:800,color:INK}}>{r.total}</td></tr>))}</tbody></table>
    </div>}
    <div className="card">
      <div className="ch-title">Log · {shown.length} {shown.length===1?'entry':'entries'}</div>
      {shown.length?<div className="act-feedlist">{shown.map(a=>{const Ic=ACT_ICON[a.type]||StickyNote;const dk=(a.ts||'').slice(0,10);const head=mode!=='day'&&dk!==lastDay;lastDay=dk;return(
        <React.Fragment key={a.id}>
          {head&&<div className="act-daysep">{dayHead(a.ts)}</div>}
          <div className="act-row" onClick={()=>open&&open(a.leadId)}>
            <div className="act-ic" style={{background:ACT_COLORS[a.type]||'#8b88a0'}}><Ic size={15}/></div>
            <div className="act-body">
              <div className="act-top"><span className="act-lead">{a.leadName||'—'}</span><span className="act-who">{a.who||'—'}</span><span className="act-time">{fmtTime(a.ts)}</span></div>
              <div className="act-txt">{a.text}</div>
            </div>
          </div>
        </React.Fragment>);})}</div>
      :<div className="empty">No activity logged for {mode==='day'?'this day':'this '+mode}{who!=='All'?' by '+who:''}{typeF!=='All'?' · '+typeF:''}. Log calls, texts &amp; meetings from any lead and they'll show up here.</div>}
    </div>
  </>);
}

function SettingsPage({settings,saveSettings,leads,saveLeads,invoices,saveInvoices}){
  const onLogo=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>saveSettings({...settings,logo:r.result});r.readAsDataURL(f);};
  const setOptions=(key,arr)=>saveSettings({...settings,options:{...settings.options,[key]:arr}});
  const exportAll=()=>{const data={app:'proytech-crm',version:4,exportedAt:new Date().toISOString(),leads,settings,invoices};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`proytech-crm-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(u);};
  const importAll=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.leads)throw 0;if(window.confirm(`Restore ${d.leads.length} leads from this backup? This replaces everything currently in the CRM.`)){saveLeads(d.leads);if(d.settings)saveSettings({logo:d.settings.logo||'',logoSize:d.settings.logoSize||34,options:{...DEFAULT_OPTIONS,...(d.settings.options||{})},stages:d.settings.stages?.length?d.settings.stages:DEFAULT_STAGES,customFields:d.settings.customFields||[],team:d.settings.team||DEFAULT_TEAM,leadColumns:d.settings.leadColumns||DEFAULT_LEAD_COLS,deliveryTracks:d.settings.deliveryTracks?.length?d.settings.deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:{...DEFAULT_INVOICING,...(d.settings.invoicing||{}),biz:{...DEFAULT_INVOICING.biz,...((d.settings.invoicing||{}).biz||{})}}});if(saveInvoices)saveInvoices(Array.isArray(d.invoices)?d.invoices:[]);window.alert('Backup restored.');}}catch(err){window.alert('That file is not a valid ProyTech backup.');}};r.readAsText(f);e.target.value='';};

  return (<>
    {/* team access */}
    {(()=>{ const people=(settings.options?.owner||OWNERS).filter(o=>o!==POOL_OWNER);
      const setAccess=(name,access)=>{ const t=(settings.team||[]).filter(x=>x.name!==name); saveSettings({...settings,team:[...t,{name,access}]}); };
      return (<div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Users size={15}/>Team &amp; lead visibility</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Everyone lands on <b>their own</b> leads by default. This controls whether they can switch to <b>All</b> and see the whole company's list. Leads owned by <b>{POOL_OWNER}</b> sit in the shared <b>Pool</b> — anyone can see and claim those.</div>
      <div className="team-list">
        {people.map(p=>{const a=teamAccess(settings,p);return (<div className="team-row" key={p}>
          <span className="team-av">{p[0]}</span>
          <span className="team-name">{p}</span>
          <div className="seg team-seg">
            <button className={a==='own'?'on':''} onClick={()=>setAccess(p,'own')}>Own + Pool</button>
            <button className={a==='all'?'on':''} onClick={()=>setAccess(p,'all')}>Everything</button>
          </div>
        </div>);})}
      </div>
      <div className="ch-sub" style={{marginTop:12,marginBottom:0}}>Add a new salesperson under <b>Dropdown options → Owner</b> and they'll appear here. Give them <b>Own + Pool</b> and they'll only ever see their own leads plus the shared pool.</div>
    </div>); })()}

    {/* logo */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><ImageIcon size={15}/>Brand / Logo</div>
      {settings.logo&&<div style={{marginBottom:14,padding:'16px',background:INK,borderRadius:12,display:'inline-block'}}><img src={settings.logo} alt="logo" style={{maxHeight:(settings.logoSize||34),maxWidth:(settings.logoSize||34)*5,objectFit:'contain',display:'block'}}/></div>}
      <label className="logo-drop"><ImageIcon size={22} style={{marginBottom:6}}/><div style={{fontWeight:600}}>{settings.logo?'Replace logo':'Upload your ProyTech logo'}</div><div style={{fontSize:12,marginTop:4}}>PNG or SVG, transparent background ideal</div><input type="file" accept="image/*" onChange={onLogo} style={{display:'none'}}/></label>
      {settings.logo&&<div className="logosize">
        <div className="logosize-h"><span>Logo size</span><b>{settings.logoSize||34}px</b></div>
        <input type="range" min="20" max="90" step="1" value={settings.logoSize||34} onChange={e=>saveSettings({...settings,logoSize:Number(e.target.value)})}/>
      </div>}
      {settings.logo&&<button className="btn btn-d" style={{marginTop:12}} onClick={()=>saveSettings({...settings,logo:''})}><Trash2 size={15}/>Remove logo</button>}
    </div>

    {/* invoicing defaults */}
    {(()=>{ const iv=settings.invoicing||DEFAULT_INVOICING; const biz=iv.biz||DEFAULT_INVOICING.biz; const setIv=patch=>saveSettings({...settings,invoicing:{...iv,...patch}}); const setBiz=patch=>setIv({biz:{...biz,...patch}});
      return (<div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Receipt size={15}/>Invoicing</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Your business details and defaults. These fill in automatically on every new invoice.</div>
      <div className="fgrid">
        <div className="field"><label>Business name</label><input value={biz.name||''} onChange={e=>setBiz({name:e.target.value})}/></div>
        <div className="field"><label>Email</label><input value={biz.email||''} onChange={e=>setBiz({email:e.target.value})}/></div>
        <div className="field full"><label>Business address</label><textarea rows={2} value={biz.address||''} onChange={e=>setBiz({address:e.target.value})}/></div>
        <div className="field"><label>Invoice prefix</label><input value={iv.prefix||''} onChange={e=>setIv({prefix:e.target.value})}/></div>
        <div className="field"><label>Next invoice #</label><input type="number" value={iv.seq||1} onChange={e=>setIv({seq:Math.max(1,Math.round(num(e.target.value)))})}/></div>
        <div className="field"><label>Payment terms (days)</label><input type="number" value={iv.terms??14} onChange={e=>setIv({terms:Math.round(num(e.target.value))})}/></div>
        <div className="field"><label>Default tax rate (%)</label><input type="number" value={iv.taxRate??0} onChange={e=>setIv({taxRate:num(e.target.value)})}/></div>
        <div className="field full"><label>Payment link (Stripe / PayPal / etc.)</label><input placeholder="https://…" value={iv.paymentLink||''} onChange={e=>setIv({paymentLink:e.target.value})}/></div>
        <div className="field full"><label>Default notes / terms</label><textarea rows={2} value={iv.notes||''} onChange={e=>setIv({notes:e.target.value})}/></div>
      </div>
      <div className="ch-sub" style={{margin:'18px 0 12px',fontWeight:700,color:INK,textTransform:'uppercase',letterSpacing:'.05em',fontSize:11}}>Invoice design</div>
      <div className="fgrid">
        <div className="field"><label>Brand accent color</label><div className="acc-row"><input type="color" value={iv.accent||'#2B4DE0'} onChange={e=>setIv({accent:e.target.value})}/><input value={iv.accent||'#2B4DE0'} onChange={e=>setIv({accent:e.target.value})}/></div></div>
        <div className="field"><label>Invoice logo size — {iv.logoH||46}px</label><input type="range" className="invrange" min="24" max="80" value={iv.logoH||46} onChange={e=>setIv({logoH:Number(e.target.value)})}/></div>
      </div>
      <div className="inv-toggles">
        <label className="invtog"><input type="checkbox" checked={iv.showLogo!==false} onChange={e=>setIv({showLogo:e.target.checked})}/>Show logo</label>
        <label className="invtog"><input type="checkbox" checked={iv.showNotes!==false} onChange={e=>setIv({showNotes:e.target.checked})}/>Show notes / terms</label>
        <label className="invtog"><input type="checkbox" checked={iv.showPay!==false} onChange={e=>setIv({showPay:e.target.checked})}/>Show payment link</label>
      </div>
      <div className="ch-sub" style={{margin:'20px 0 8px',fontWeight:700,color:INK,textTransform:'uppercase',letterSpacing:'.05em',fontSize:11}}>Page layout &amp; text sizes</div>
      <div className="ch-sub" style={{marginTop:-2,marginBottom:10}}>Tap any section in this sample to set its font size &amp; spacing. Drag sections to reorder, or swap the header. Whatever you set here becomes the default on every new invoice — no need to redo it each time.</div>
      <div className="inv-design-stage">
        <InvoicePreview settings={settings} saveSettings={saveSettings} inv={{number:(iv.prefix||'INV-')+String(iv.seq||1).padStart(4,'0'),issueDate:todayISO(),dueDate:addDays(todayISO(),iv.terms||14),status:'sent',taxRate:num(iv.taxRate),paymentLink:iv.paymentLink||'https://buy.stripe.com/your-link',notes:iv.notes||'Thank you for your business.',billTo:{company:'Acme Realty Group',name:'Jordan Blake',email:'jordan@acmerealty.com',address:'88 Douglas Ave\nWichita, KS 67202'},items:[{id:'s1',label:'Website foundation — design & build',qty:1,amount:1200},{id:'s2',label:'AI front office — monthly retainer',qty:1,amount:199}]}}/>
      </div>
    </div>); })()}

    {/* dropdown options */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><SlidersHorizontal size={15}/>Dropdown Options</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Add or remove the choices that appear in every lead. Applies everywhere instantly.</div>
      <OptionEditor label="Service Interest" items={settings.options.service} onChange={a=>setOptions('service',a)}/>
      <OptionEditor label="Lead Source" items={settings.options.source} onChange={a=>setOptions('source',a)}/>
      <OptionEditor label="Business Type" items={settings.options.businessType} onChange={a=>setOptions('businessType',a)}/>
      <OptionEditor label="Next Action" items={settings.options.nextAction} onChange={a=>setOptions('nextAction',a)}/>
      <OptionEditor label="Owner" items={settings.options.owner||OWNERS} onChange={a=>setOptions('owner',a)}/>
    </div>

    {/* stages */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Layers size={15}/>Pipeline Stages</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Rename, recolor, reorder, or add stages. Mark one or more as <b>Won</b> (counts as closed revenue) or <b>Lost</b>.</div>
      <StageEditor stages={settings.stages} onChange={s=>saveSettings({...settings,stages:s})}/>
    </div>

    {/* delivery tracks */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><Rocket size={15}/>Delivery Tracks</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>The fulfillment steps clients move through after converting. Each track shows only for clients who bought a matching service.</div>
      <DeliveryEditor tracks={settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS} services={settings.options.service} onChange={t=>saveSettings({...settings,deliveryTracks:t})}/>
    </div>

    {/* custom fields */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><List size={15}/>Custom Fields</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Add your own columns to every lead. Toggle "show in table" to put them on the Leads page.</div>
      <CustomFieldEditor fields={settings.customFields||[]} onChange={f=>saveSettings({...settings,customFields:f})}/>
    </div>

    {/* backup */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><FileText size={15}/>Backup & Restore</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Download a full snapshot (every lead, note, setting, and custom field) — or restore one. Save these regularly.</div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <button className="btn btn-p" onClick={exportAll}><Download size={15}/>Export full backup (JSON)</button>
        <label className="btn btn-g" style={{cursor:'pointer'}}><Upload size={15}/>Restore from backup<input type="file" accept="application/json,.json" onChange={importAll} style={{display:'none'}}/></label>
        <button className="btn btn-d" onClick={()=>{if(window.confirm('Reset to the sample demo leads? Export a backup first if you want to keep current data.'))saveLeads(seed());}}><Trash2 size={15}/>Reset to seed leads</button>
      </div>
    </div>

    <div className="note">
      <b>This preview saves to your browser.</b> The next step wires it to Supabase so you and Logan share one live board with separate logins — and your data lives in the database, not the code, so future redeploys can never wipe a single lead. Keep exporting JSON backups as your offline safety net.
    </div>
  </>);
}

function OptionEditor({label,items,onChange}){
  const [val,setVal]=useState('');
  const add=()=>{const v=val.trim();if(!v||items.includes(v))return;onChange([...items,v]);setVal('');};
  return (<div style={{marginBottom:18}}>
    <div style={{fontSize:12.5,fontWeight:700,color:INK,marginBottom:9}}>{label}</div>
    <div>{items.map(it=><span className="opt-chip" key={it}>{it}<button onClick={()=>onChange(items.filter(x=>x!==it))}><X size={13}/></button></span>)}</div>
    <div className="addrow"><input placeholder={`Add ${label.toLowerCase()}…`} value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&add()}/><button className="btn btn-g btn-sm" onClick={add}><Plus size={14}/>Add</button></div>
  </div>);
}

function StageEditor({stages,onChange}){
  const upd=(i,patch)=>onChange(stages.map((s,j)=>j===i?{...s,...patch}:s));
  const move=(i,dir)=>{const j=i+dir;if(j<0||j>=stages.length)return;const a=[...stages];[a[i],a[j]]=[a[j],a[i]];onChange(a);};
  const del=i=>{if(stages.length<=2){window.alert('Keep at least two stages.');return;}onChange(stages.filter((_,j)=>j!==i));};
  const add=()=>{const key='stage'+uid();onChange([...stages,{key,label:'New Stage',color:STAGE_COLORS[stages.length%STAGE_COLORS.length],prob:0.3,open:true,won:false,lost:false}]);};
  const setType=(i,t)=>upd(i,{open:t==='open',won:t==='won',lost:t==='lost',prob:t==='won'?1:t==='lost'?0:0.3});
  const typeOf=s=>s.won?'won':s.lost?'lost':'open';
  return (<div>
    {stages.map((s,i)=>(<div className="set-row" key={s.key}>
      <div style={{display:'flex',flexDirection:'column',gap:2}}>
        <button className="iconbtn" style={{height:18,width:24}} onClick={()=>move(i,-1)} disabled={i===0}><ChevronUp size={14}/></button>
        <button className="iconbtn" style={{height:18,width:24}} onClick={()=>move(i,1)} disabled={i===stages.length-1}><ChevronDown size={14}/></button>
      </div>
      <input type="color" className="swatch" value={s.color} onChange={e=>upd(i,{color:e.target.value})}/>
      <input style={{flex:1,minWidth:90,padding:'8px 10px',border:'1px solid #DEDFEA',borderRadius:8,fontSize:13.5,fontFamily:'Inter'}} value={s.label} onChange={e=>upd(i,{label:e.target.value})}/>
      <select className="selctl" value={typeOf(s)} onChange={e=>setType(i,e.target.value)}><option value="open">Open</option><option value="won">Won</option><option value="lost">Lost</option></select>
      {s.open&&<input type="number" min="0" max="100" title="Win %" style={{width:64,padding:'8px 8px',border:'1px solid #DEDFEA',borderRadius:8,fontSize:13}} value={Math.round(num(s.prob)*100)} onChange={e=>upd(i,{prob:num(e.target.value)/100})}/>}
      <button className="iconbtn" onClick={()=>del(i)} title="Delete stage"><Trash2 size={14}/></button>
    </div>))}
    <button className="btn btn-g btn-sm" style={{marginTop:12}} onClick={add}><Plus size={14}/>Add stage</button>
  </div>);
}

function CustomFieldEditor({fields,onChange}){
  const [label,setLabel]=useState('');const [type,setType]=useState('text');const [opts,setOpts]=useState('');
  const add=()=>{const l=label.trim();if(!l)return;const f={id:uid(),label:l,type,showInTable:false};if(type==='select')f.options=opts.split(',').map(x=>x.trim()).filter(Boolean);onChange([...fields,f]);setLabel('');setOpts('');setType('text');};
  return (<div>
    {fields.map((f,i)=>(<div className="set-row" key={f.id}>
      <Tag size={15} color="#928DAD"/>
      <div style={{flex:1}}><div style={{fontWeight:600,color:INK,fontSize:13.5}}>{f.label}</div><div className="subcell">{f.type}{f.type==='select'&&f.options?` · ${f.options.join(', ')}`:''}</div></div>
      <label className="toggle" style={{margin:0,fontSize:12}}><span className={'sw sm '+(f.showInTable?'on':'')} onClick={()=>onChange(fields.map(x=>x.id===f.id?{...x,showInTable:!x.showInTable}:x))}><b/></span>in table</label>
      <button className="iconbtn" onClick={()=>onChange(fields.filter(x=>x.id!==f.id))}><Trash2 size={14}/></button>
    </div>))}
    {!fields.length&&<div className="empty" style={{padding:'10px 0',textAlign:'left'}}>No custom fields yet.</div>}
    <div className="addrow">
      <input placeholder="Field name (e.g. Contract Link)" value={label} onChange={e=>setLabel(e.target.value)}/>
      <select value={type} onChange={e=>setType(e.target.value)}><option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="select">Dropdown</option><option value="checkbox">Checkbox</option></select>
      {type==='select'&&<input placeholder="Options, comma-separated" value={opts} onChange={e=>setOpts(e.target.value)} style={{flex:1,minWidth:160}}/>}
      <button className="btn btn-g btn-sm" onClick={add}><Plus size={14}/>Add field</button>
    </div>
  </div>);
}

function DeliveryEditor({tracks,services,onChange}){
  const upd=(i,patch)=>onChange(tracks.map((t,j)=>j===i?{...t,...patch}:t));
  const addTrack=()=>onChange([...tracks,{key:'track'+uid(),label:'New Track',services:[],milestones:['Step 1']}]);
  const delTrack=i=>{if(window.confirm('Delete this delivery track?'))onChange(tracks.filter((_,j)=>j!==i));};
  const toggleSvc=(i,s)=>{const cur=tracks[i].services||[];upd(i,{services:cur.includes(s)?cur.filter(x=>x!==s):[...cur,s]});};
  const Milestones=({i})=>{const [v,setV]=useState('');const ms=tracks[i].milestones||[];
    const addM=()=>{const x=v.trim();if(!x||ms.includes(x))return;upd(i,{milestones:[...ms,x]});setV('');};
    const moveM=(k,d)=>{const j=k+d;if(j<0||j>=ms.length)return;const a=ms.slice();[a[k],a[j]]=[a[j],a[k]];upd(i,{milestones:a});};
    return (<div style={{marginTop:8}}>
      {ms.map((m,k)=>(<div key={m} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 0'}}>
        <span style={{flex:1,fontSize:13,color:'#3a3658'}}>{k+1}. {m}</span>
        <button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveM(k,-1)} disabled={k===0}><ChevronUp size={13}/></button>
        <button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveM(k,1)} disabled={k===ms.length-1}><ChevronDown size={13}/></button>
        <button className="iconbtn" style={{width:24,height:24}} onClick={()=>upd(i,{milestones:ms.filter(x=>x!==m)})}><Trash2 size={12}/></button>
      </div>))}
      <div className="addrow"><input placeholder="Add milestone…" value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addM()} style={{flex:1,minWidth:160}}/><button className="btn btn-g btn-sm" onClick={addM}><Plus size={14}/>Add</button></div>
    </div>);
  };
  return (<div>
    {tracks.map((t,i)=>(<div key={t.key} style={{border:'1px solid #E8E9F2',borderRadius:12,padding:'14px 16px',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <input style={{flex:1,padding:'9px 11px',border:'1px solid #DEDFEA',borderRadius:8,fontSize:14,fontFamily:'Inter',fontWeight:600}} value={t.label} onChange={e=>upd(i,{label:e.target.value})}/>
        <button className="iconbtn" onClick={()=>delTrack(i)}><Trash2 size={14}/></button>
      </div>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:'#928DAD',marginBottom:7}}>Shows for services</div>
      <div className="chips">{services.map(s=><span key={s} className={'chip '+((t.services||[]).includes(s)?'on':'')} onClick={()=>toggleSvc(i,s)}>{s}</span>)}</div>
      <div style={{fontSize:11,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:'#928DAD',margin:'14px 0 0'}}>Milestones</div>
      <Milestones i={i}/>
    </div>))}
    <button className="btn btn-g btn-sm" onClick={addTrack}><Plus size={14}/>Add track</button>
  </div>);
}

/* ===================== MODAL ===================== */
function Modal({lead,isNew,settings,stages,addOption,me,allLeads,navList,onNav,convertToClient,revertClient,toggleMilestone,setMilestoneDue,onClose,updateLead,addActivity,delActivity,delLead,createNew}){
  const _list=navList||[]; const _idx=isNew?-1:_list.indexOf(lead?.id);
  const prevId=_idx>0?_list[_idx-1]:null; const nextId=(_idx>=0&&_idx<_list.length-1)?_list[_idx+1]:null;
  const opt=settings.options; const customFields=settings.customFields||[];
  const blank={id:uid(),name:'',company:'',businessType:'—',phone:'',email:'',website:'',stage:stages[0].key,priority:'medium',source:'',nextAction:'Follow Up Call',nextSteps:'',followUp:'',expectedClose:'',serviceInterest:[],owner:me||BRAND.team[0]||'',dealValue:0,retainer:0,retainerActive:false,retainerStart:'',closedAt:'',isRelationship:false,introducedBy:'',relNote:'',custom:{},createdAt:new Date().toISOString(),activities:[]};
  const [draft,setDraft]=useState(isNew?blank:lead);
  const [atype,setAtype]=useState('Note');const [atext,setAtext]=useState('');const [who,setWho]=useState(me||BRAND.team[0]||'');const [feedFilter,setFeedFilter]=useState('All');
  const [openSec,setOpenSec]=useState({});
  const [showMore,setShowMore]=useState(false);
  const [firstNote,setFirstNote]=useState('');
  const [firstType,setFirstType]=useState('Call');
  useEffect(()=>{if(!isNew&&lead)setDraft(lead);},[lead,isNew]);
  const set=patch=>{if(isNew)setDraft({...draft,...patch});else{setDraft({...draft,...patch});updateLead(draft.id,patch);}};
  const setCustom=(id,v)=>set({custom:{...(draft.custom||{}),[id]:v}});
  const toggleSvc=s=>{const cur=draft.serviceInterest||[];set({serviceInterest:cur.includes(s)?cur.filter(x=>x!==s):[...cur,s]});};
  const addCustomAction=()=>{const v=window.prompt('New Next Action:');if(v&&v.trim()){addOption('nextAction',v.trim());set({nextAction:v.trim()});}};
  const addCustomSvc=()=>{const v=window.prompt('New Service Interest:');if(v&&v.trim()){addOption('service',v.trim());toggleSvc(v.trim());}};
  const F=({label,k,type,full})=>(<div className={'field'+(full?' full':'')}><label>{label}</label><input type={type||'text'} value={draft[k]??''} onChange={e=>set({[k]:e.target.value})}/></div>);
  const dealBreak=(draft.deal&&typeof draft.deal==='object')
    ? {setup:draft.deal.setup??'',website:draft.deal.website??'',integration:draft.deal.integration??'',extras:Array.isArray(draft.deal.extras)?draft.deal.extras:[]}
    : {setup:(draft.dealValue||''),website:'',integration:'',extras:[]};
  const dealSum=d=>num(d.setup)+num(d.website)+num(d.integration)+(d.extras||[]).reduce((a,e)=>a+num(e.amount),0);
  const setDeal=next=>set({deal:next,dealValue:dealSum(next)});
  const Sel=({label,k,opts})=>(<div className="field"><label>{label}</label><select value={draft[k]} onChange={e=>set({[k]:e.target.value})}>{opts.map(o=>typeof o==='string'?<option key={o} value={o}>{o||'—'}</option>:<option key={o.v} value={o.v}>{o.l}</option>)}</select></div>);
  /* collapsible section. called as a function (not <Sec/>) so inputs inside
     never remount and lose focus while typing. */
  const Sec=(k,icon,title,summary,body,defOpen)=>{
    const isOpen=openSec[k]??!!defOpen;
    return (<div className={'msec'+(isOpen?' open':'')} key={k}>
      <div className="msec-h" onClick={()=>setOpenSec(o=>({...o,[k]:!isOpen}))}>
        <span className="msec-t">{icon}{title}</span>
        {!isOpen&&summary?<span className="msec-s">{summary}</span>:null}
        <ChevronDown size={15} className="msec-ch"/>
      </div>
      {isOpen&&<div className="msec-b">{body}</div>}
    </div>);
  };
  const logIt=()=>{if(!atext.trim())return;addActivity(draft.id,atype,atext,who);setAtext('');};
  const create=()=>{
    if(!draft.name.trim()){window.alert('Add a name first.');return;}
    const ts=new Date().toISOString();
    const acts=[{id:uid(),ts,type:'Note',text:'Lead created.',who}];
    if(firstNote.trim()) acts.unshift({id:uid(),ts,type:firstType,text:firstNote.trim(),who});
    createNew({...draft,activities:acts});
  };
  const feed=(isNew?[]:(lead?.activities||[])).filter(a=>feedFilter==='All'||a.type===feedFilter);
  const noteCount=(lead?.activities||[]).filter(a=>a.type==='Note').length;
  return (<div className="scrim2" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <div className="modal" onMouseDown={e=>e.stopPropagation()}>
      <div className="m-head">
        <div style={{minWidth:0}}>
          <h2>{draft.name||'New Lead'}</h2>{!isNew&&<div className="co">{draft.company} · {draft.businessType}</div>}
          {!isNew&&<div className="meta">Added {fmtDate(draft.createdAt)} · Last contact {fmtDate(lastContact(draft))}</div>}
          {!isNew&&<div className="qa">
            <StageBadge k={draft.stage} stages={stages}/><PriBadge p={draft.priority}/>
            {draft.phone&&<a className="qbtn" href={`tel:${draft.phone}`}><Phone size={12}/>Call</a>}
            {draft.phone&&<a className="qbtn" href={`sms:${draft.phone}`}><MessageSquare size={12}/>Text</a>}
            {draft.email&&<a className="qbtn" href={`mailto:${draft.email}`}><Mail size={12}/>Email</a>}
            {draft.website&&<a className="qbtn" href={draft.website.startsWith('http')?draft.website:'https://'+draft.website} target="_blank" rel="noreferrer"><Globe size={12}/>Site</a>}
          </div>}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flex:'none'}}>
          {!isNew&&_list.length>1&&<>
            <button className="m-x" disabled={!prevId} onClick={()=>prevId&&onNav(prevId)} title="Previous lead"><ChevronLeft size={18}/></button>
            <span style={{fontSize:12,fontWeight:600,color:'#928DAD',minWidth:46,textAlign:'center'}}>{_idx+1} / {_list.length}</span>
            <button className="m-x" disabled={!nextId} onClick={()=>nextId&&onNav(nextId)} title="Next lead"><ChevronRight size={18}/></button>
          </>}
          <button className="m-x" onClick={onClose}><X size={18}/></button>
        </div>
      </div>
      <div className="m-grid">
        <div className="m-left">
          {/* ---------- 1. CONTACT — always first, always open ---------- */}
          <div className="dh"><Contact2 size={13}/>{isNew?'New lead':'Contact'}</div>
          <div className="fgrid">
            {F({label:'Name',k:'name'})}{F({label:'Company',k:'company'})}
            {F({label:'Phone',k:'phone',type:'tel'})}{F({label:'Email',k:'email',type:'email'})}
            {F({label:'Website',k:'website',full:true})}
          </div>
          {isNew&&(draft.phone||draft.email)&&(()=>{
            const dupes=(allLeads||[]).filter(x=>{
              const ph=(v)=>(v||'').replace(/\D/g,'');
              return (draft.phone&&ph(x.phone)&&ph(x.phone)===ph(draft.phone))||(draft.email&&x.email&&x.email.toLowerCase()===draft.email.toLowerCase());
            });
            return dupes.length?(<div className="dupe-warn"><AlertTriangle size={14}/><span>Already in the CRM: <b onClick={()=>onNav&&onNav(dupes[0].id)}>{dupes[0].name}</b>{dupes[0].company?` · ${dupes[0].company}`:''}{dupes[0].owner?` · owned by ${dupes[0].owner}`:''}</span></div>):null;
          })()}

          {/* ---------- 2. FOLLOW-UP — the note lives with the date ---------- */}
          {!isNew&&<>
            <div className="dh mt"><Bell size={13}/>Follow-up</div>
            <div className="fu-block">
              <div className="fgrid">
                {F({label:'Follow-up date',k:'followUp',type:'date'})}
                <div className="field"><label>Next action</label><select value={draft.nextAction} onChange={e=>set({nextAction:e.target.value})}>{opt.nextAction.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
              </div>
              <div className="field full" style={{marginTop:10}}>
                <label>What to do on this follow-up</label>
                <textarea className="fu-note" rows={2} placeholder="e.g. Ask about their listing site — he said call back after the 15th" value={draft.nextSteps||''} onChange={e=>set({nextSteps:e.target.value})}/>
              </div>
              {draft.followUp&&<div className={'fu-when'+(daysUntil(draft.followUp)<0?' od':'')}>{daysUntil(draft.followUp)<0?`${Math.abs(daysUntil(draft.followUp))} days overdue`:daysUntil(draft.followUp)===0?'Due today':`Due in ${daysUntil(draft.followUp)} days`} · {fmtDate(draft.followUp)}</div>}
            </div>
          </>}

          {/* ---------- 3. QUICK ADD: everything else behind one tap ---------- */}
          {isNew&&<>
            <div className="dh mt"><MessageSquare size={13}/>First note</div>
            <div className="fn-block">
              <div className="act-types">{ACT_TYPES.map(({key,icon:Ic})=><button key={key} className={'act-t '+(firstType===key?'on':'')} onClick={()=>setFirstType(key)}><Ic size={12}/>{key}</button>)}</div>
              <textarea className="fu-note" style={{marginTop:9}} rows={3} placeholder={`How'd the ${firstType.toLowerCase()} go? What did they say?`} value={firstNote} onChange={e=>setFirstNote(e.target.value)}/>
              <div className="fn-hint">{firstNote.trim()?<><CheckCircle2 size={12} color={GREEN}/>Logs as a {firstType} from {who} the moment you save</>:'Optional — but log it now while it\u2019s fresh'}</div>
            </div>

            <button className="morebtn" onClick={()=>setShowMore(!showMore)}>
              <ChevronDown size={14} className={'mb-ch'+(showMore?' on':'')}/>{showMore?'Hide extra details':'Add more details'}
              {!showMore&&<i>optional — {draft.owner} · {draft.nextAction}</i>}
            </button>
            {showMore&&<div className="fgrid" style={{marginTop:12}}>
              {Sel({label:'Business Type',k:'businessType',opts:opt.businessType})}{Sel({label:'Lead Source',k:'source',opts:['',...opt.source]})}
              {Sel({label:'Stage',k:'stage',opts:stages.map(s=>({v:s.key,l:s.label}))})}{Sel({label:'Priority',k:'priority',opts:Object.entries(PRIORITIES).map(([v,x])=>({v,l:x.label}))})}
              {Sel({label:'Next Action',k:'nextAction',opts:opt.nextAction})}{Sel({label:'Owner',k:'owner',opts:opt.owner||OWNERS})}
              {F({label:'Follow-up Date',k:'followUp',type:'date'})}{F({label:'Expected Close',k:'expectedClose',type:'date'})}
              {F({label:'Notes for the follow-up',k:'nextSteps',full:true})}
            </div>}
          </>}

          {/* ---------- 4. DELIVERY (clients only) ---------- */}
          {!isNew&&draft.isClient&&(()=>{ const tracks=activeTracks(draft,settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS); const ov=clientOverall(draft,settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS);
            return (<div className="dr-sec deliv">
              <div className="dh" style={{justifyContent:'space-between',display:'flex'}}><span style={{display:'flex',alignItems:'center',gap:8}}><Rocket size={13}/>Delivery</span><span style={{fontSize:11,color:'#928DAD',fontWeight:600}}>Client since {fmtDate(draft.convertedAt)}</span></div>
              {tracks.map(tr=>{ const p=trackProgress(draft,tr); return (<div className="track" key={tr.key}>
                <div className="track-h"><b>{tr.label}</b>{p.overdue>0?<span className="phase od">{p.overdue} overdue</span>:p.nextDue?<span className="phase">Next due {fmtDate(p.nextDue)}</span>:<span className="phase">{p.current?p.current:'Delivered ✓'}</span>}</div>
                <div className="pbar"><div style={{width:Math.round(p.pct*100)+'%'}}/></div>
                <div className="mslist">{p.ms.map(m=>{ const e=p.entries[m]; const done=!!e.done; const od=!done&&e.due&&daysUntil(e.due)<0; return (<div className={'ms'+(done?' on':'')+(od?' over':'')} key={m}>
                  <span className="mcheck" onClick={()=>toggleMilestone(draft.id,tr.key,m)}>{done?<CheckCircle2 size={17} color={GREEN}/>:<Circle size={17} color={od?'#D14343':'#C9C5D9'}/>}<span className="mtxt">{m}</span></span>
                  {done
                    ? <span className="mdate done">✓ {fmtDate(e.done)}</span>
                    : <label className="msdue-w"><span className="msdue-l">{od?'overdue':'due'}</span><input type="date" className={'msdue'+(od?' over':'')} value={e.due||''} onClick={ev=>ev.stopPropagation()} onChange={ev=>setMilestoneDue(draft.id,tr.key,m,ev.target.value)}/></label>}
                </div>); })}</div>
              </div>); })}
              {ov.delivered&&<div className="deliv-done"><CheckCircle2 size={15} color={GREEN}/>All delivery steps complete{ov.doneDate?` · ${fmtDate(ov.doneDate)}`:''} — client marked completed.</div>}
              <button className="linkbtn" onClick={()=>{ if(window.confirm('Revert this client back to a lead? Delivery progress is kept.')) revertClient(draft.id); }}>Revert to lead</button>
            </div>);
          })()}

          {/* ---------- 5. EVERYTHING ELSE — collapsed ---------- */}
          {!isNew&&<div className="msecs">
            {Sec('qual',<SlidersHorizontal size={13}/>,'Qualifying',
              [draft.source,draft.businessType!=='—'?draft.businessType:null,sOf(draft.stage,stages)?.label,PRIORITIES[draft.priority]?.label].filter(Boolean).join(' · ')||'not set',
              <div className="fgrid">
                {Sel({label:'Lead Source',k:'source',opts:['',...opt.source]})}{Sel({label:'Business Type',k:'businessType',opts:opt.businessType})}
                {Sel({label:'Stage',k:'stage',opts:stages.map(s=>({v:s.key,l:s.label}))})}{Sel({label:'Priority',k:'priority',opts:Object.entries(PRIORITIES).map(([v,x])=>({v,l:x.label}))})}
                {Sel({label:'Owner',k:'owner',opts:opt.owner||OWNERS})}{F({label:'Expected Close',k:'expectedClose',type:'date'})}
                <div className="field full"><button className="chip add" onClick={addCustomAction}><Plus size={12}/>Add custom Next Action</button></div>
              </div>)}

            {Sec('svc',<Target size={13}/>,'Service Interest',
              (draft.serviceInterest||[]).length?`${(draft.serviceInterest||[]).length} selected`:'none',
              <div className="chips">{opt.service.map(s=><span key={s} className={'chip '+((draft.serviceInterest||[]).includes(s)?'on':'')} onClick={()=>toggleSvc(s)}>{s}</span>)}<span className="chip add" onClick={addCustomSvc}><Plus size={12}/>Custom</span></div>)}

            {(()=>{ const candidates=(allLeads||[]).filter(x=>x.id!==draft.id).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
              const intros=(allLeads||[]).filter(x=>x.introducedBy===draft.id);
              const chain=introChain(draft,allLeads||[]);
              const root=chain.length?chain[0]:null;
              const summary=[draft.isRelationship?'Relationship':'Lead',chain.length?`via ${chain[chain.length-1].name}`:null].filter(Boolean).join(' · ');
              return Sec('type',<Users size={13}/>,'Type & Introduction',summary,<>
                <div className="spon-row">
                  <label className={'spon-tog rel'+(draft.isRelationship?' on':'')}><input type="checkbox" checked={!!draft.isRelationship} onChange={e=>set({isRelationship:e.target.checked})}/>{draft.isRelationship?'Relationship — not a ProyTech lead':'ProyTech lead'}</label>
                </div>
                {draft.isRelationship&&<div className="rel-hint">Kept out of Pipeline, Money &amp; Dashboard — still shows in Follow-Up when due.</div>}
                <div className="fgrid" style={{marginTop:10}}>
                  <div className="field"><label>Introduced by</label>
                    <select value={draft.introducedBy||''} onChange={e=>set({introducedBy:e.target.value})}>
                      <option value="">— nobody / direct —</option>
                      {candidates.map(x=><option key={x.id} value={x.id}>{x.name}{x.company?' · '+x.company:''}</option>)}
                    </select>
                  </div>
                  {F({label:'How you know them',k:'relNote'})}
                </div>
                {chain.length>0&&<div className="rel-chain">
                  <div className="rc-lbl">Intro chain</div>
                  <div className="rc-path">
                    {chain.map((pp,i)=>(<React.Fragment key={pp.id}>
                      <span className={'rc-node'+(i===0?' root':'')} onClick={()=>onNav&&onNav(pp.id)}>{pp.name}</span>
                      <ChevronRight size={12} className="rc-arrow"/>
                    </React.Fragment>))}
                    <span className="rc-node self">{draft.name||'this contact'}</span>
                  </div>
                  {chain.length>1&&root&&<div className="rc-root">It all traces back to <b onClick={()=>onNav&&onNav(root.id)}>{root.name}</b></div>}
                </div>}
                {intros.length>0&&<div className="rel-gave"><UserPlus size={13}/><span><b>{intros.length}</b> {intros.length===1?'person':'people'} in your CRM came from {draft.name||'this contact'}</span></div>}
              </>);
            })()}

            {Sec('spon',<Award size={13}/>,'Sponsorship',
              draft.pastSponsor?'Past sponsor':draft.potentialSponsor?'Potential sponsor':'no',
              <>
                <div className="spon-row">
                  <label className={'spon-tog'+(draft.potentialSponsor?' on':'')}><input type="checkbox" checked={!!draft.potentialSponsor} onChange={e=>set({potentialSponsor:e.target.checked})}/>Potential sponsor</label>
                  <label className={'spon-tog past'+(draft.pastSponsor?' on':'')}><input type="checkbox" checked={!!draft.pastSponsor} onChange={e=>set({pastSponsor:e.target.checked})}/>Past sponsor</label>
                </div>
                {(draft.potentialSponsor||draft.pastSponsor)&&<div className="fgrid" style={{marginTop:10}}>
                  {F({label:'Sponsor tier',k:'sponsorTier'})}
                  {F({label:draft.pastSponsor?'Amount given ($)':'Amount possible ($)',k:'sponsorAmount',type:'number'})}
                </div>}
              </>)}

            {customFields.length>0&&Sec('custom',<Tag size={13}/>,'Custom Fields',
              `${customFields.length} field${customFields.length>1?'s':''}`,
              <div className="fgrid">
                {customFields.map(f=>(<div className="field" key={f.id} style={f.type==='checkbox'?{gridColumn:'1/-1'}:undefined}>
                  <label>{f.label}</label>
                  {f.type==='select'?<select value={draft.custom?.[f.id]||''} onChange={e=>setCustom(f.id,e.target.value)}><option value="">—</option>{(f.options||[]).map(o=><option key={o} value={o}>{o}</option>)}</select>
                  :f.type==='checkbox'?<label className="toggle" style={{marginTop:2}}><span className={'sw sm '+(draft.custom?.[f.id]?'on':'')} onClick={()=>setCustom(f.id,!draft.custom?.[f.id])}><b/></span>{draft.custom?.[f.id]?'Yes':'No'}</label>
                  :<input type={f.type==='number'?'number':f.type==='date'?'date':'text'} value={draft.custom?.[f.id]??''} onChange={e=>setCustom(f.id,e.target.value)}/>}
                </div>))}
              </div>)}

            {Sec('deal',<DollarSign size={13}/>,'Deal',
              (dealSum(dealBreak)>0||num(draft.retainer)>0)?[dealSum(dealBreak)>0?usd(dealSum(dealBreak)):null,num(draft.retainer)>0?usd(draft.retainer)+'/mo':null].filter(Boolean).join(' · '):'not set',
              <>
                <div className="fgrid">
                  <div className="field"><label>Setup $</label><input type="number" value={dealBreak.setup} onChange={e=>setDeal({...dealBreak,setup:e.target.value})}/></div>
                  <div className="field"><label>Website $</label><input type="number" value={dealBreak.website} onChange={e=>setDeal({...dealBreak,website:e.target.value})}/></div>
                  <div className="field"><label>Integration $</label><input type="number" value={dealBreak.integration} onChange={e=>setDeal({...dealBreak,integration:e.target.value})}/></div>
                  {F({label:'Monthly Retainer $',k:'retainer',type:'number'})}
                </div>
                {dealBreak.extras.length>0&&<div className="extras">{dealBreak.extras.map((ex,i)=>(
                  <div className="extra-row" key={ex.id||i}>
                    <input className="ex-label" placeholder="Line item (e.g. Extra web page)" value={ex.label||''} onChange={e=>{const x=dealBreak.extras.slice();x[i]={...x[i],label:e.target.value};setDeal({...dealBreak,extras:x});}}/>
                    <div className="ex-amt-w"><span>$</span><input className="ex-amt" type="number" placeholder="0" value={ex.amount||''} onChange={e=>{const x=dealBreak.extras.slice();x[i]={...x[i],amount:e.target.value};setDeal({...dealBreak,extras:x});}}/></div>
                    <button className="ex-del" title="Remove" onClick={()=>{const x=dealBreak.extras.filter((_,j)=>j!==i);setDeal({...dealBreak,extras:x});}}><X size={14}/></button>
                  </div>))}</div>}
                <button className="addline" onClick={()=>setDeal({...dealBreak,extras:[...dealBreak.extras,{id:uid(),label:'',amount:''}]})}><Plus size={13}/>Add line item</button>
                <div className="deal-total"><span>One-time total</span><b>{usd(dealSum(dealBreak))}</b></div>
                <div className="toggle" onClick={()=>set({retainerActive:!draft.retainerActive})}><span className={'sw '+(draft.retainerActive?'on':'')}><b/></span>{draft.retainerActive?'On monthly retainer':'Not on retainer'}</div>
              </>)}
          </div>}

          {/* ---------- 6. CONVERT — the last thing, not the first ---------- */}
          {!isNew&&!draft.isClient&&<div className="convert-banner">
            <div><b>Won the deal?</b><div style={{fontSize:12.5,color:'#56527a',marginTop:2}}>Convert to a client to start tracking delivery.</div></div>
            <button className="btn btn-p" onClick={()=>convertToClient(draft.id)}><UserCheck size={15}/>Convert to Client</button>
          </div>}
        </div>

        <div className="m-right">
          {isNew?<div className="empty">Save the lead to start logging activity.</div>:<>
            <div className="dh"><MessageSquare size={13}/>Activity Log</div>
            <div className="act-types">{ACT_TYPES.map(({key,icon:Ic})=><button key={key} className={'act-t '+(atype===key?'on':'')} onClick={()=>setAtype(key)}><Ic size={12}/>{key}</button>)}</div>
            <textarea className="act-input" placeholder={`Log a ${atype.toLowerCase()}… (saved with today's date)`} value={atext} onChange={e=>setAtext(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey))logIt();}}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,gap:8}}>
              <select className="selctl" style={{padding:'7px 9px',fontSize:12.5}} value={who} onChange={e=>setWho(e.target.value)}>{(opt.owner||OWNERS).map(o=><option key={o} value={o}>{o}</option>)}</select>
              <button className="btn btn-p" style={{padding:'8px 16px'}} onClick={logIt}>Log {atype}</button>
            </div>
            <div className="afilter" style={{marginTop:16}}>
              <button className={feedFilter==='All'?'on':''} onClick={()=>setFeedFilter('All')}>All</button>
              <button className={feedFilter==='Note'?'on':''} onClick={()=>setFeedFilter('Note')}>Notes{noteCount?` (${noteCount})`:''}</button>
              {ACT_TYPES.filter(t=>t.key!=='Note').map(t=><button key={t.key} className={feedFilter===t.key?'on':''} onClick={()=>setFeedFilter(t.key)}>{t.key}</button>)}
            </div>
            <div className="feed">{feed.map(a=>{const T=ACT_TYPES.find(t=>t.key===a.type);const Ic=T?T.icon:StickyNote;return (<div className={'fitem'+(a.type==='Note'?' note':'')} key={a.id}>
              <div className="fic"><Ic size={14}/></div><div style={{minWidth:0}}><div className="ftxt">{a.text}</div><div className="fmeta">{a.who?a.who+' · ':''}{a.type} · {fmtStamp(a.ts)}</div></div>
              <button className="fdel" onClick={()=>delActivity(draft.id,a.id)}><Trash2 size={13}/></button></div>);})}
              {!feed.length&&<div className="empty" style={{padding:'18px 0'}}>{feedFilter==='All'?'No activity yet. Log your first touch above.':`No ${feedFilter.toLowerCase()} entries yet.`}</div>}</div>
            <div style={{marginTop:18,paddingTop:16,borderTop:'1px solid #F0F0F6'}}><button className="btn btn-d" onClick={()=>{if(window.confirm('Delete this lead permanently?'))delLead(draft.id);}}><Trash2 size={15}/>Delete lead</button></div>
          </>}
        </div>
      </div>
      {isNew&&<div className="m-foot">
        <button className="btn btn-p" onClick={create}><Plus size={16}/>Create Lead</button>
        <button className="btn btn-g" onClick={onClose}>Cancel</button>
        <span className="m-foot-n">{draft.name.trim()
          ? <><CheckCircle2 size={13} color={GREEN}/>{draft.name}{draft.company?' · '+draft.company:''} &rarr; {draft.owner}</>
          : 'Name is the only thing required'}</span>
      </div>}
    </div>
  </div>);
}

/* ===================== shared ===================== */
function Kpi({label,value,d,variant,icon}){return (<div className={'kpi '+(variant||'')}><div className="kl">{icon}{label}</div><div className="kv">{value}</div>{d&&<div className="kd">{d}</div>}</div>);}
function ChartCard({title,sub,children,empty}){return (<div className="card"><h3>{title}</h3>{sub&&<div className="ch-sub">{sub}</div>}{empty?<div className="empty">{empty}</div>:children}</div>);}
