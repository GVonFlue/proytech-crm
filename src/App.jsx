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
  Layers, FileText, Tag, LogOut, Receipt, Printer, Send
} from 'lucide-react';
import { auth, db } from './lib/supabase';

/* ===================== brand ===================== */
const COBALT='#2B4DE0', INDIGO='#3B3470', INK='#181530', GOLD='#C8A24A', GREEN='#1F9D55', RED='#D14343';
const PIE=[COBALT,INDIGO,GOLD,'#5C76EE','#8E86C9',GREEN,'#D98A3D','#7AA0F0'];
const STAGE_COLORS=['#6B73C9',COBALT,'#7A5CC8',GOLD,GREEN,'#B0606A','#D98A3D','#2BA7A0'];

/* ===================== editable defaults ===================== */
const DEFAULT_OPTIONS={
  businessType:['Real Estate','Lending','Restaurant','Retail','Law Firm','Construction','Professional Services','Other'],
  source:['Referral','Garrett','Logan','Cold Outreach','Instagram','Networking','Realtor Breakfast','Walk-in','Website','Other'],
  service:['Web Design','AI Integration','Both','Unknown','Missed-Call Text-Back','AI Receptionist','Booking / Scheduling','CRM Setup','Full Front Office'],
  nextAction:['Schedule Coffee','Schedule Sit Down','Text in 1 Week','Visit and Introduce','Send Proposal','Follow Up Call','Close','—'],
  owner:['Garrett','Logan','ProyTech'],
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
const OWNERS=['Garrett','Logan','ProyTech'];
const ACT_TYPES=[{key:'Note',icon:StickyNote},{key:'Call',icon:PhoneCall},{key:'Text',icon:MessageSquare},{key:'Meeting',icon:CalendarClock},{key:'Email',icon:Mailbox}];
const fmtCustom=(v,type)=>{if(v===undefined||v==='')return '—';if(type==='checkbox')return v?'✓':'—';return String(v);};
const DEFAULT_LEAD_COLS=[
  {key:'businessType',visible:true},{key:'stage',visible:true},{key:'source',visible:true},
  {key:'nextAction',visible:true},{key:'lastContacted',visible:true},{key:'followUp',visible:true},
  {key:'priority',visible:true},{key:'dealValue',visible:true},{key:'owner',visible:true},
  {key:'serviceInterest',visible:false},{key:'nextSteps',visible:false},{key:'phone',visible:false},{key:'email',visible:false},
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
const normEntry=v=>{ if(!v) return {done:null,due:null}; if(typeof v==='string') return {done:v,due:null}; return {done:v.done||null,due:v.due||null}; };
const trackProgress=(lead,track)=>{ const raw=(lead.delivery&&lead.delivery[track.key])||{}; const ms=track.milestones||[]; const entries={}; let completed=0,overdue=0,nextDue=null;
  ms.forEach(m=>{ const e=normEntry(raw[m]); entries[m]=e; if(e.done) completed++; else if(e.due){ if(daysUntil(e.due)<0) overdue++; if(!nextDue||e.due<nextDue) nextDue=e.due; } });
  const current=ms.find(m=>!entries[m].done)||null;
  return {entries,ms,completedCount:completed,total:ms.length,pct:ms.length?completed/ms.length:0,current,overdue,nextDue}; };
const clientOverall=(lead,tracks)=>{ const ts=activeTracks(lead,tracks); let c=0,t=0,phase='',overdue=0,nextDue=null,lastDone=null; ts.forEach(tr=>{const p=trackProgress(lead,tr);c+=p.completedCount;t+=p.total;overdue+=p.overdue; if(p.nextDue&&(!nextDue||p.nextDue<nextDue))nextDue=p.nextDue; if(p.current&&!phase)phase=`${tr.label}: ${p.current}`; Object.values(p.entries).forEach(e=>{ if(e.done&&(!lastDone||e.done>lastDone)) lastDone=e.done; }); }); const delivered=t>0&&c>=t; return {pct:t?c/t:0,phase:phase||'Delivered',tracks:ts,overdue,nextDue,completed:c,total:t,delivered,doneDate:lastDone}; };

/* ===================== invoicing ===================== */
const DEFAULT_INVOICING={ biz:{ name:'ProyTech', address:'105 N Main St\nWichita, KS 67202', email:'getproytech@gmail.com', phone:'' }, prefix:'INV-', seq:1, taxRate:0, terms:14, notes:'Thank you for your business.', paymentLink:'' };
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
  return {id:uid(),name:'',company:'',businessType:'Real Estate',phone:'',email:'',website:'',
    stage:'new',priority:'medium',source:'',nextAction:'Schedule Coffee',nextSteps:'Follow up',
    followUp:'',expectedClose:'',serviceInterest:[],owner:'Garrett',dealValue:0,retainer:0,
    retainerActive:false,retainerStart:'',closedAt:'',custom:{},createdAt,activities:acts,...rest};
}
function seed(){return [
  mkLead({_ago:10,name:'Chris Waipa',company:'Mortgage Punk',businessType:'Lending',phone:'3163035151',stage:'contacted',priority:'high',source:'Networking',nextAction:'Schedule Sit Down',followUp:'2026-06-29',serviceInterest:['Both'],note:'Anchor relationship — hosts the Wednesday realtor breakfast.'}),
  mkLead({_ago:9,name:'Beverly',company:'EggCetra',businessType:'Restaurant',phone:'7025056866',stage:'contacted',priority:'medium',nextAction:'Text in 1 Week',serviceInterest:['Web Design'],note:'Meeting scheduled.'}),
  mkLead({_ago:8,name:'Sophii Jones',company:'Jupiter Marketing',businessType:'Professional Services',phone:'3162265444',stage:'contacted',priority:'medium',nextAction:'Schedule Sit Down',followUp:'2026-06-27',serviceInterest:['Both'],note:'Looking to build out site.'}),
  mkLead({_ago:7,name:'Mathew Agnew',company:'Agnew Law',businessType:'Law Firm',stage:'new',priority:'medium',nextAction:'Schedule Coffee',followUp:'2026-06-29',serviceInterest:['AI Integration']}),
  mkLead({_ago:6,name:'Jason Bell',company:'Specs Eyewear and Eyewear',businessType:'Retail',phone:'3168800220',stage:'contacted',priority:'medium',source:'Referral',nextAction:'Schedule Coffee',followUp:'2026-06-30',serviceInterest:['Unknown'],note:'Site isnt great, needs work.'}),
  mkLead({_ago:5,name:'Matthew Rochat',company:'Leader One Financial',businessType:'Lending',stage:'contacted',priority:'medium',source:'Garrett',nextAction:'Schedule Coffee',followUp:'2026-06-30',serviceInterest:['Unknown']}),
  mkLead({_ago:4,name:'Erica Boller',company:'Midwest Fresh',businessType:'Real Estate',stage:'new',priority:'medium',source:'Garrett',nextAction:'Schedule Coffee',followUp:'2026-06-30',serviceInterest:['Unknown'],website:'https://www.midwestfresh.com',note:'Site sucks.'}),
  mkLead({_ago:3,name:'Derek Sorrells',company:'Sweet n Saucy Wichita',businessType:'Retail',phone:'(316) 730-4932',stage:'new',priority:'high',source:'Cold Outreach',nextAction:'Visit and Introduce',followUp:'2026-06-30',serviceInterest:['Unknown'],website:'https://sweetnsaucywichita.com',note:'Site sucks — duckwichita angle.'}),
  mkLead({_ago:2,name:'Tai To',company:'316 Home Buyers',businessType:'Real Estate',phone:'3162100094',stage:'new',priority:'medium',source:'Garrett',nextAction:'Schedule Sit Down',followUp:'2026-06-30',serviceInterest:['Unknown'],note:'Think we can for sure help.'}),
  mkLead({_ago:1,name:'Robert Fluke',company:'Wichita Construction',businessType:'Construction',stage:'new',priority:'medium',source:'Garrett',nextAction:'Schedule Sit Down',followUp:'2026-06-30',serviceInterest:['Web Design'],note:'Think we can help with the site.'}),
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
.kanban{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(256px,1fr);gap:14px;overflow-x:auto;padding-bottom:10px}
.kcol{background:#fff;border:1px solid #E8E9F2;border-radius:16px;display:flex;flex-direction:column;min-height:140px;overflow:hidden;box-shadow:0 12px 30px -28px rgba(24,21,48,.5)}
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
.inv-preview-wrap{padding:20px;background:#ECEEF5;overflow:auto}
.inv-items-edit{display:flex;flex-direction:column;gap:7px}
.iie-h,.iie-row{display:grid;grid-template-columns:1fr 56px 84px 76px 30px;gap:8px;align-items:center}
.iie-h{font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#928DAD;padding:0 2px}
.iie-row input{padding:8px 9px;border:1px solid #DEDFEA;border-radius:8px;font-size:13px;font-family:'Inter';color:${INK};background:#fff;width:100%}
.iie-row input:focus{outline:none;border-color:${COBALT};box-shadow:0 0 0 3px rgba(43,77,224,.13)}
.iie-amt{font-size:13px;font-weight:600;color:${INK};text-align:right}
.inv-preview{background:#fff;border-radius:12px;padding:34px 36px;box-shadow:0 10px 40px -18px rgba(0,0,0,.25);font-size:13px;color:#2c2942}
.ip-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:26px}
.ip-logo{max-height:46px;max-width:200px;object-fit:contain;display:block;margin-bottom:8px}
.ip-name{font-family:'Space Grotesk';font-size:24px;font-weight:600;color:${INK};margin-bottom:8px}
.ip-bizmeta{font-size:12px;color:#6a6788;line-height:1.5}
.ip-meta{text-align:right;flex:none}
.ip-title{font-family:'Space Grotesk';font-size:26px;font-weight:600;letter-spacing:.04em;color:${COBALT}}
.ip-num{font-size:13px;font-weight:600;color:#56527a;margin-top:2px}
.ip-dates{margin-top:12px;font-size:12px;color:#2c2942}.ip-dates div{display:flex;gap:10px;justify-content:flex-end;margin-top:2px}.ip-dates span{color:#928DAD}
.ip-stamp{display:inline-block;margin-top:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:4px 12px;border-radius:20px}
.ip-billto{margin-bottom:22px;font-size:12.5px;line-height:1.55;color:#2c2942}
.ip-billto .ip-lbl{font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#928DAD;margin-bottom:5px}
.ip-billto .ip-btname{font-weight:700;font-size:14px;color:${INK}}
.ip-table{width:100%;border-collapse:collapse;margin-bottom:18px}
.ip-table th{text-align:left;font-size:10.5px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#928DAD;border-bottom:2px solid ${INK};padding:0 0 8px}
.ip-table th:nth-child(2),.ip-table th:nth-child(3),.ip-table th:nth-child(4){text-align:right}
.ip-table td{padding:10px 0;border-bottom:1px solid #EEE;font-size:13px}
.ip-table td:nth-child(2),.ip-table td:nth-child(3),.ip-table td:nth-child(4){text-align:right;white-space:nowrap}
.ip-table td:first-child{padding-right:14px}
.ip-totals{margin-left:auto;width:260px}
.ip-tr{display:flex;justify-content:space-between;padding:6px 0;font-size:13px;color:#2c2942}.ip-tr span{color:#6a6788}
.ip-grand{border-top:2px solid ${INK};margin-top:4px;padding-top:10px;font-size:16px}.ip-grand span{color:${INK};font-weight:700;font-family:'Space Grotesk'}.ip-grand b{font-family:'Space Grotesk';color:${COBALT}}
.ip-pay{margin-top:22px;font-size:12.5px;color:#2c2942;word-break:break-all}.ip-pay a{color:${COBALT}}
.ip-notes{margin-top:14px;padding-top:14px;border-top:1px solid #EEE;font-size:12px;color:#6a6788;white-space:pre-wrap}
@media print{
  body *{visibility:hidden!important}
  #invprint,#invprint *{visibility:visible!important}
  #invprint{position:absolute!important;left:0;top:0;width:100%;box-shadow:none!important;border-radius:0!important;padding:0!important}
  .scrim2{position:static!important;background:none!important;padding:0!important}
}
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
    <h2>ProyTech CRM</h2><p>Sign in</p>
    <input placeholder="Username" value={u} autoFocus autoCapitalize="none" autoCorrect="off" onChange={e=>{setU(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&go()}/>
    <input type="password" placeholder="Password" value={p} onChange={e=>{setP(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&go()}/>
    {err&&<div className="gate-err">{err}</div>}
    <button className="btn btn-p" style={{width:'100%',justifyContent:'center'}} disabled={busy} onClick={go}><Lock size={15}/>{busy?'Signing in…':'Sign in'}</button>
  </div></div></>);
}

/* ===================== main ===================== */
export default function App(){
  const [session,setSession]=useState(undefined);
  const [loaded,setLoaded]=useState(false);
  const [leads,setLeads]=useState([]);
  const [invoices,setInvoices]=useState([]);
  const [invId,setInvId]=useState(null);
  const [settings,setSettings]=useState({logo:'',logoSize:34,options:DEFAULT_OPTIONS,stages:DEFAULT_STAGES,customFields:[],leadColumns:DEFAULT_LEAD_COLS,deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:DEFAULT_INVOICING});
  const [page,setPage]=useState('dash');
  const [sbOpen,setSbOpen]=useState(false);
  const [activeId,setActiveId]=useState(null);
  const [navIds,setNavIds]=useState(null);
  const openLead=(id,order)=>{ setActiveId(id); setNavIds(order&&order.length?order:null); };

  useEffect(()=>{ auth.session().then(s=>setSession(s||null)); const {data:sub}=auth.onChange(s=>setSession(s||null)); return ()=>sub?.subscription?.unsubscribe?.(); },[]);

  useEffect(()=>{ if(!session){setLoaded(false);return;} (async()=>{
    try{
      let s=await db.getLeads(); let st=await db.getSettings();
      let iv=[]; try{ if(typeof db.getInvoices==='function') iv=await db.getInvoices(); }catch(err){ console.error('invoices load failed',err); }
      if(!s||!s.length){ s=seed(); await db.upsertMany(s); }
      if(!st){ st={logo:'',logoSize:34,options:DEFAULT_OPTIONS,stages:DEFAULT_STAGES,customFields:[],leadColumns:DEFAULT_LEAD_COLS,deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:DEFAULT_INVOICING}; await db.saveSettings(st); }
      setLeads(s); setInvoices(Array.isArray(iv)?iv:[]);
      setSettings({logo:st.logo||'',logoSize:st.logoSize||34,options:{...DEFAULT_OPTIONS,...(st.options||{})},stages:st.stages?.length?st.stages:DEFAULT_STAGES,customFields:st.customFields||[],leadColumns:st.leadColumns||DEFAULT_LEAD_COLS,deliveryTracks:st.deliveryTracks?.length?st.deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:{...DEFAULT_INVOICING,...(st.invoicing||{}),biz:{...DEFAULT_INVOICING.biz,...((st.invoicing||{}).biz||{})}}});
      setLoaded(true);
    }catch(e){ console.error(e); window.alert('Could not load data: '+(e.message||e)); }
  })(); },[session]);

  const stages=settings.stages?.length?settings.stages:DEFAULT_STAGES;
  const me=cap(auth.username(session))||'Garrett';
  const saveLeads=async n=>{ setLeads(n); try{ await db.deleteAll(); await db.upsertMany(n); }catch(e){ console.error(e); window.alert('Save failed: '+(e.message||e)); } };
  const saveSettings=n=>{ setSettings(n); db.saveSettings(n).catch(console.error); };
  const saveInvoices=n=>{ setInvoices(n); if(typeof db.saveInvoices==='function') db.saveInvoices(n).catch(console.error); };
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
  const convertToClient=id=>{ const l=leads.find(x=>x.id===id); if(!l)return; const updated={...l,isClient:true,convertedAt:todayISO(),delivery:l.delivery||{},activities:[{id:uid(),ts:new Date().toISOString(),type:'Note',text:'Converted to client — delivery started.',who:me},...l.activities]}; setLeads(leads.map(x=>x.id===id?updated:x)); db.upsertLead(updated).catch(console.error); };
  const revertClient=id=>{ const l=leads.find(x=>x.id===id); if(!l)return; const updated={...l,isClient:false}; setLeads(leads.map(x=>x.id===id?updated:x)); db.upsertLead(updated).catch(console.error); };
  const toggleMilestone=(id,trackKey,milestone)=>{ const l=leads.find(x=>x.id===id); if(!l)return; const d={...(l.delivery||{})}; const tr={...(d[trackKey]||{})}; const cur=normEntry(tr[milestone]); const next={done:cur.done?null:todayISO(),due:cur.due||null}; if(!next.done&&!next.due) delete tr[milestone]; else tr[milestone]=next; d[trackKey]=tr; const patch={delivery:d}; const o=clientOverall({...l,delivery:d},settings.deliveryTracks||DEFAULT_DELIVERY_TRACKS); const won=(stages||[]).find(s=>s.won); if(o.delivered&&won&&l.stage!==won.key) patch.stage=won.key; updateLead(id,patch); };
  const setMilestoneDue=(id,trackKey,milestone,date)=>{ const l=leads.find(x=>x.id===id); if(!l)return; const d={...(l.delivery||{})}; const tr={...(d[trackKey]||{})}; const cur=normEntry(tr[milestone]); const next={done:cur.done||null,due:date||null}; if(!next.done&&!next.due) delete tr[milestone]; else tr[milestone]=next; d[trackKey]=tr; updateLead(id,{delivery:d}); };
  const active=activeId&&activeId!=='new'?leads.find(l=>l.id===activeId):null;

  if(session===undefined) return (<><style>{CSS}</style><div className="gate"><div className="gate-card"><span className="nucleus" style={{width:18,height:18,margin:'0 auto 10px',display:'block'}}/><h2>ProyTech CRM</h2><p>Loading…</p></div></div></>);
  if(!session) return <Login/>;

  const NAV=[['dash','Dashboard',<LayoutDashboard size={18}/>],['pipeline','Pipeline',<KanbanSquare size={18}/>],['leads','Leads',<Contact2 size={18}/>],['clients','Clients',<Building2 size={18}/>],['invoices','Invoices',<Receipt size={18}/>],['money','Money',<DollarSign size={18}/>],['settings','Settings',<Settings size={18}/>]];
  const titles={dash:['Dashboard','The whole board at a glance'],pipeline:['Pipeline','Drag a card to move a deal'],leads:['Leads','Every contact, every conversation'],clients:['Clients','Closed deals & monthly retainers'],invoices:['Invoices','Create, send & track payments'],money:['Money','Revenue, MRR, forecast & attribution'],settings:['Settings','Customize the CRM · back up your data']};

  return (<><style>{CSS}</style><div className="pt">
    {sbOpen&&<div className="scrim" onClick={()=>setSbOpen(false)}/>}
    <aside className={'sb '+(sbOpen?'open':'')}>
      <Brand logo={settings.logo} size={settings.logoSize||34} sub="Client CRM"/>
      {NAV.map(([k,l,ic])=><button key={k} className={'nav-i '+(page===k?'on':'')} onClick={()=>{setPage(k);setSbOpen(false);}}>{ic}{l}</button>)}
      <button className="nav-i" style={{marginTop:8,background:'rgba(43,77,224,.16)',color:'#fff'}} onClick={()=>setActiveId('new')}><Plus size={18}/>New Lead</button>
      <button className="nav-i" onClick={()=>auth.logout()}><LogOut size={18}/>Sign out ({me})</button>
      <div className="sb-foot"><b>No conversation lives outside the CRM.</b><br/>Capture it the moment it happens.</div>
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
          page==='dash'?<Dashboard leads={leads} stages={stages} open={openLead}/>:
          page==='pipeline'?<Pipeline leads={leads} stages={stages} open={openLead} updateLead={updateLead}/>:
          page==='leads'?<Leads leads={leads} settings={settings} stages={stages} open={openLead} saveSettings={saveSettings}/>:
          page==='clients'?<Clients leads={leads} stages={stages} settings={settings} open={openLead}/>:
          page==='invoices'?<Invoices invoices={invoices} leads={leads} settings={settings} onNew={newInvoice} open={id=>setInvId(id)}/>:
          page==='money'?<Money leads={leads} stages={stages}/>:
          <SettingsPage settings={settings} saveSettings={saveSettings} leads={leads} saveLeads={saveLeads} invoices={invoices} saveInvoices={saveInvoices}/>}
      </div>
    </div>
    {(active||activeId==='new')&&<Modal key={activeId} lead={active} isNew={activeId==='new'} settings={settings} stages={stages} addOption={addOption} me={me} navList={(navIds&&navIds.length?navIds:leads.map(l=>l.id))} onNav={id=>setActiveId(id)} convertToClient={convertToClient} revertClient={revertClient} toggleMilestone={toggleMilestone} setMilestoneDue={setMilestoneDue} onClose={()=>setActiveId(null)} updateLead={updateLead} addActivity={addActivity} delActivity={delActivity} delLead={delLead} createNew={createNew}/>}
    {invId&&(()=>{const inv=invoices.find(x=>x.id===invId);return inv?<InvoiceModal key={invId} invoice={inv} leads={leads} settings={settings} onSave={upsertInvoice} onDelete={deleteInvoice} onClose={()=>setInvId(null)}/>:null;})()}
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
  const [dragId,setDragId]=useState(null);const [over,setOver]=useState(null);
  const drop=stage=>{if(dragId)updateLead(dragId,{stage});setDragId(null);setOver(null);};
  return (<div className="kanban">{stages.map(s=>{const items=leads.filter(l=>l.stage===s.key);const val=items.reduce((a,l)=>a+num(l.dealValue),0);
    return (<div key={s.key} className={'kcol '+(over===s.key?'drag':'')} onDragOver={e=>{e.preventDefault();setOver(s.key);}} onDragLeave={()=>setOver(c=>c===s.key?null:c)} onDrop={()=>drop(s.key)}>
      <div className="kbar" style={{background:s.color}}/>
      <div className="kcol-h"><span className="kt">{s.label}</span><span className="kc">{items.length}</span></div>
      <div className="kcol-v">{val>0?usd(val)+' in stage':'—'}</div>
      <div className="kcol-body">
        {items.map(l=>(<div key={l.id} className="kcard" draggable onDragStart={()=>setDragId(l.id)} onDragEnd={()=>{setDragId(null);setOver(null);}} onClick={()=>open(l.id)}>
          <div className="kn"><span className="dot" style={{background:(PRIORITIES[l.priority]||PRIORITIES.medium).color}}/>{l.name}</div>
          <div className="kco">{l.company||l.businessType}</div>
          {(l.serviceInterest||[]).length>0&&<div className="ktags">{(l.serviceInterest||[]).slice(0,2).map(s2=><span key={s2} className="tag">{s2}</span>)}</div>}
          <div className="kmeta"><span className="subcell">{l.dealValue>0?usd(l.dealValue):''}</span>{l.followUp&&<Due iso={l.followUp}/>}</div>
        </div>))}
        {dragId&&over===s.key&&<div className="kdrop">Release to move here</div>}
        {!items.length&&!(dragId&&over===s.key)&&<div className="kdrop">No leads</div>}
      </div>
    </div>);})}</div>);
}

/* ===================== LEADS ===================== */
function Leads({leads,settings,stages,open,saveSettings}){
  const customFields=settings.customFields||[];
  const defs=leadColumnDefs(stages,customFields);
  const cols=mergeLeadCols(settings.leadColumns||DEFAULT_LEAD_COLS,customFields).filter(c=>defs[c.key]);
  const visCols=cols.filter(c=>c.visible);
  const setCols=next=>saveSettings({...settings,leadColumns:next});
  const moveCol=(i,d)=>{const j=i+d;if(j<0||j>=cols.length)return;const a=cols.slice();[a[i],a[j]]=[a[j],a[i]];setCols(a);};
  const toggleCol=key=>setCols(cols.map(c=>c.key===key?{...c,visible:!c.visible}:c));
  const [colOpen,setColOpen]=useState(false);
  const [q,setQ]=useState('');const [stage,setStage]=useState('all');const [pri,setPri]=useState('all');const [cold,setCold]=useState('all');
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
    let r=leads.filter(l=>{
      if(stage!=='all'&&l.stage!==stage)return false;
      if(pri!=='all'&&l.priority!==pri)return false;
      if(cold!=='all'&&daysSince(lastContact(l))<+cold)return false;
      if(q){const s=(l.name+' '+l.company+' '+l.businessType+' '+l.phone+' '+(l.serviceInterest||[]).join(' ')+' '+l.source).toLowerCase();if(!s.includes(q.toLowerCase()))return false;}
      return true;
    });
    r.sort((a,b)=>{const av=sortVal(a,sortK),bv=sortVal(b,sortK);const c=av<bv?-1:av>bv?1:0;return dir==='asc'?c:-c;});
    return r;
  },[leads,q,stage,pri,cold,sortK,dir,stages]);
  const csv=()=>{
    const cols=['name','company','businessType','phone','email','website','stage','priority','source','serviceInterest','nextAction','nextSteps','followUp','expectedClose','owner','dealValue','retainer','retainerActive'];
    const esc=v=>{v=Array.isArray(v)?v.join('; '):(v??'');v=String(v).replace(/"/g,'""');return /[",\n]/.test(v)?`"${v}"`:v;};
    const head=cols.join(',');const body=rows.map(l=>cols.map(c=>esc(c==='stage'?sOf(l.stage,stages).label:l[c])).join(',')).join('\n');
    const blob=new Blob([head+'\n'+body],{type:'text/csv'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download='proytech-leads.csv';a.click();URL.revokeObjectURL(u);
  };
  const Th=({k,children})=>(<th className={sortK===k?'sorted':''} onClick={()=>toggleSort(k)}>{children}<span className="ar">{sortK===k?(dir==='asc'?'▲':'▼'):'↕'}</span></th>);
  return (<>
    <div className="toolbar">
      <div className="searchbox"><Search size={16} color="#928DAD"/><input placeholder="Search name, company, phone, service…" value={q} onChange={e=>setQ(e.target.value)}/></div>
      <select className="selctl" value={stage} onChange={e=>setStage(e.target.value)}><option value="all">All stages</option>{stages.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select>
      <select className="selctl" value={pri} onChange={e=>setPri(e.target.value)}><option value="all">All priority</option>{Object.entries(PRIORITIES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
      <select className="selctl" value={cold} onChange={e=>setCold(e.target.value)}><option value="all">Any contact age</option><option value="7">Cold · 7+ days</option><option value="14">Cold · 14+ days</option><option value="30">Cold · 30+ days</option></select>
      <button className="selctl" onClick={()=>setDir(d=>d==='asc'?'desc':'asc')} title="Toggle direction"><ArrowUpDown size={15}/></button>
      <div className="colmenu-wrap">
        <button className="selctl" onClick={()=>setColOpen(o=>!o)}><SlidersHorizontal size={15}/>Columns</button>
        {colOpen&&<><div className="cm-back" onClick={()=>setColOpen(false)}/><div className="colmenu">
          <div className="cm-row"><span className="cm-name" style={{fontWeight:600,color:INK}}>Name</span><span className="cm-lock">always on</span></div>
          {cols.map((c,i)=>(<div className="cm-row" key={c.key}><input type="checkbox" checked={c.visible} onChange={()=>toggleCol(c.key)}/><span className="cm-name">{defs[c.key]?.label||c.key}</span><button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveCol(i,-1)} disabled={i===0}><ChevronUp size={13}/></button><button className="iconbtn" style={{width:24,height:24}} onClick={()=>moveCol(i,1)} disabled={i===cols.length-1}><ChevronDown size={13}/></button></div>))}
        </div></>}
      </div>
      <button className="btn btn-g" onClick={csv}><Download size={15}/>CSV</button>
    </div>
    <div className="tbl-wrap"><table className="tbl"><thead><tr>
      <Th k="name">Name</Th>{visCols.map(c=><Th key={c.key} k={c.key}>{defs[c.key].label}</Th>)}
    </tr></thead><tbody>{rows.map(l=>(<tr key={l.id} onClick={()=>open(l.id,rows.map(r=>r.id))}>
      <td><div className="namecell">{l.name}</div><div className="subcell">{l.company}</div></td>
      {visCols.map(c=><td key={c.key}>{defs[c.key].render(l)}</td>)}
    </tr>))}</tbody></table>{!rows.length&&<div className="empty">No leads match. Adjust filters or add a new lead.</div>}</div>
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

function InvoiceModal({invoice,leads,settings,onSave,onDelete,onClose}){
  const [inv,setInv]=useState(invoice);
  useEffect(()=>setInv(invoice),[invoice.id]);
  const patch=p=>{const n={...inv,...p};setInv(n);onSave(n);};
  const iv=settings.invoicing||DEFAULT_INVOICING; const biz=iv.biz||DEFAULT_INVOICING.biz;
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
          <div className="dh mt"><CalendarClock size={13}/>Dates</div>
          <div className="fgrid">
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

        <div className="inv-preview-wrap">
          <div className="inv-preview" id="invprint">
            <div className="ip-top">
              <div className="ip-biz">
                {settings.logo?<img src={settings.logo} alt="logo" className="ip-logo"/>:<div className="ip-name">{biz.name||'ProyTech'}</div>}
                <div className="ip-bizmeta">{(biz.address||'').split('\n').map((l,i)=><div key={i}>{l}</div>)}{biz.email&&<div>{biz.email}</div>}{biz.phone&&<div>{biz.phone}</div>}</div>
              </div>
              <div className="ip-meta">
                <div className="ip-title">INVOICE</div>
                <div className="ip-num">{inv.number}</div>
                <div className="ip-dates"><div><span>Issued</span>{fmtDate(inv.issueDate)}</div><div><span>Due</span>{fmtDate(inv.dueDate)}</div></div>
                <div className={'ip-stamp inv-'+st}>{cap(st)}</div>
              </div>
            </div>
            <div className="ip-billto"><div className="ip-lbl">Bill To</div><div className="ip-btname">{bt.company||bt.name||'—'}</div>{bt.company&&bt.name&&<div>{bt.name}</div>}{(bt.address||'').split('\n').map((l,i)=>l&&<div key={i}>{l}</div>)}{bt.email&&<div>{bt.email}</div>}</div>
            <table className="ip-table"><thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
              <tbody>{items.map((it,i)=>(<tr key={it.id||i}><td>{it.label||'—'}</td><td>{num(it.qty)}</td><td>{usd(it.amount)}</td><td>{usd(num(it.qty)*num(it.amount))}</td></tr>))}</tbody></table>
            <div className="ip-totals">
              <div className="ip-tr"><span>Subtotal</span><b>{usd(sub)}</b></div>
              {num(inv.taxRate)>0&&<div className="ip-tr"><span>Tax ({num(inv.taxRate)}%)</span><b>{usd(tax)}</b></div>}
              <div className="ip-tr ip-grand"><span>Total Due</span><b>{usd(total)}</b></div>
            </div>
            {inv.paymentLink&&<div className="ip-pay">Pay online: <a href={inv.paymentLink}>{inv.paymentLink}</a></div>}
            {inv.notes&&<div className="ip-notes">{inv.notes}</div>}
          </div>
        </div>
      </div>
    </div>
  </div>);
}

function SettingsPage({settings,saveSettings,leads,saveLeads,invoices,saveInvoices}){
  const onLogo=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>saveSettings({...settings,logo:r.result});r.readAsDataURL(f);};
  const setOptions=(key,arr)=>saveSettings({...settings,options:{...settings.options,[key]:arr}});
  const exportAll=()=>{const data={app:'proytech-crm',version:4,exportedAt:new Date().toISOString(),leads,settings,invoices};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`proytech-crm-backup-${todayISO()}.json`;a.click();URL.revokeObjectURL(u);};
  const importAll=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{const d=JSON.parse(r.result);if(!d.leads)throw 0;if(window.confirm(`Restore ${d.leads.length} leads from this backup? This replaces everything currently in the CRM.`)){saveLeads(d.leads);if(d.settings)saveSettings({logo:d.settings.logo||'',logoSize:d.settings.logoSize||34,options:{...DEFAULT_OPTIONS,...(d.settings.options||{})},stages:d.settings.stages?.length?d.settings.stages:DEFAULT_STAGES,customFields:d.settings.customFields||[],leadColumns:d.settings.leadColumns||DEFAULT_LEAD_COLS,deliveryTracks:d.settings.deliveryTracks?.length?d.settings.deliveryTracks:DEFAULT_DELIVERY_TRACKS,invoicing:{...DEFAULT_INVOICING,...(d.settings.invoicing||{}),biz:{...DEFAULT_INVOICING.biz,...((d.settings.invoicing||{}).biz||{})}}});if(saveInvoices)saveInvoices(Array.isArray(d.invoices)?d.invoices:[]);window.alert('Backup restored.');}}catch(err){window.alert('That file is not a valid ProyTech backup.');}};r.readAsText(f);e.target.value='';};

  return (<>
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
    </div>); })()}

    {/* dropdown options */}
    <div className="card" style={{marginBottom:18}}>
      <div className="sec-title"><SlidersHorizontal size={15}/>Dropdown Options</div>
      <div className="ch-sub" style={{marginTop:-8,marginBottom:14}}>Add or remove the choices that appear in every lead. Applies everywhere instantly.</div>
      <OptionEditor label="Service Interest" items={settings.options.service} onChange={a=>setOptions('service',a)}/>
      <OptionEditor label="Lead Source" items={settings.options.source} onChange={a=>setOptions('source',a)}/>
      <OptionEditor label="Business Type" items={settings.options.businessType} onChange={a=>setOptions('businessType',a)}/>
      <OptionEditor label="Next Action" items={settings.options.nextAction} onChange={a=>setOptions('nextAction',a)}/>
      <OptionEditor label="Owner" items={settings.options.owner||['Garrett','Logan','ProyTech']} onChange={a=>setOptions('owner',a)}/>
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
        <button className="btn btn-d" onClick={()=>{if(window.confirm('Reset to your 10 real seed leads? Export a backup first if you want to keep current data.'))saveLeads(seed());}}><Trash2 size={15}/>Reset to seed leads</button>
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
function Modal({lead,isNew,settings,stages,addOption,me,navList,onNav,convertToClient,revertClient,toggleMilestone,setMilestoneDue,onClose,updateLead,addActivity,delActivity,delLead,createNew}){
  const _list=navList||[]; const _idx=isNew?-1:_list.indexOf(lead?.id);
  const prevId=_idx>0?_list[_idx-1]:null; const nextId=(_idx>=0&&_idx<_list.length-1)?_list[_idx+1]:null;
  const opt=settings.options; const customFields=settings.customFields||[];
  const blank={id:uid(),name:'',company:'',businessType:opt.businessType[0],phone:'',email:'',website:'',stage:stages[0].key,priority:'medium',source:'',nextAction:opt.nextAction[0],nextSteps:'',followUp:'',expectedClose:'',serviceInterest:[],owner:'Garrett',dealValue:0,retainer:0,retainerActive:false,retainerStart:'',closedAt:'',custom:{},createdAt:new Date().toISOString(),activities:[]};
  const [draft,setDraft]=useState(isNew?blank:lead);
  const [atype,setAtype]=useState('Note');const [atext,setAtext]=useState('');const [who,setWho]=useState(me||'Garrett');const [feedFilter,setFeedFilter]=useState('All');
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
  const logIt=()=>{if(!atext.trim())return;addActivity(draft.id,atype,atext,who);setAtext('');};
  const create=()=>{if(!draft.name.trim()){window.alert('Add a name first.');return;}createNew({...draft,activities:[{id:uid(),ts:new Date().toISOString(),type:'Note',text:'Lead created.',who}]});};
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
          {!isNew&&!draft.isClient&&<div className="convert-banner">
            <div><b>Won the deal?</b><div style={{fontSize:12.5,color:'#56527a',marginTop:2}}>Convert to a client to start tracking delivery.</div></div>
            <button className="btn btn-p" onClick={()=>convertToClient(draft.id)}><UserCheck size={15}/>Convert to Client</button>
          </div>}
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
          <div className="dh"><Contact2 size={13}/>Details</div>
          <div className="fgrid">
            {F({label:'Name',k:'name'})}{F({label:'Company',k:'company'})}
            {Sel({label:'Business Type',k:'businessType',opts:opt.businessType})}{Sel({label:'Lead Source',k:'source',opts:['',...opt.source]})}
            {Sel({label:'Stage',k:'stage',opts:stages.map(s=>({v:s.key,l:s.label}))})}{Sel({label:'Priority',k:'priority',opts:Object.entries(PRIORITIES).map(([v,x])=>({v,l:x.label}))})}
            {Sel({label:'Next Action',k:'nextAction',opts:opt.nextAction})}{Sel({label:'Owner',k:'owner',opts:opt.owner||OWNERS})}
            {F({label:'Follow-up Date',k:'followUp',type:'date'})}{F({label:'Expected Close',k:'expectedClose',type:'date'})}
            {F({label:'Next Steps',k:'nextSteps',full:true})}
          </div>
          <div style={{marginTop:6}}><button className="chip add" onClick={addCustomAction}><Plus size={12}/>Add custom Next Action</button></div>

          <div className="dh mt"><Target size={13}/>Service Interest</div>
          <div className="chips">{opt.service.map(s=><span key={s} className={'chip '+((draft.serviceInterest||[]).includes(s)?'on':'')} onClick={()=>toggleSvc(s)}>{s}</span>)}<span className="chip add" onClick={addCustomSvc}><Plus size={12}/>Custom</span></div>

          <div className="dh mt"><Phone size={13}/>Contact</div>
          <div className="fgrid">{F({label:'Phone',k:'phone'})}{F({label:'Email',k:'email'})}{F({label:'Website',k:'website',full:true})}</div>

          <div className="dh mt"><DollarSign size={13}/>Deal</div>
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

          {customFields.length>0&&<><div className="dh mt"><Tag size={13}/>Custom Fields</div><div className="fgrid">
            {customFields.map(f=>(<div className={'field'+(f.type==='select'||f.type==='checkbox'?'':' ')} key={f.id} style={f.type==='checkbox'?{gridColumn:'1/-1'}:undefined}>
              <label>{f.label}</label>
              {f.type==='select'?<select value={draft.custom?.[f.id]||''} onChange={e=>setCustom(f.id,e.target.value)}><option value="">—</option>{(f.options||[]).map(o=><option key={o} value={o}>{o}</option>)}</select>
              :f.type==='checkbox'?<label className="toggle" style={{marginTop:2}}><span className={'sw sm '+(draft.custom?.[f.id]?'on':'')} onClick={()=>setCustom(f.id,!draft.custom?.[f.id])}><b/></span>{draft.custom?.[f.id]?'Yes':'No'}</label>
              :<input type={f.type==='number'?'number':f.type==='date'?'date':'text'} value={draft.custom?.[f.id]??''} onChange={e=>setCustom(f.id,f.type==='number'?e.target.value:e.target.value)}/>}
            </div>))}
          </div></>}

          {isNew&&<div style={{display:'flex',gap:10,marginTop:20}}><button className="btn btn-p" onClick={create}><Plus size={16}/>Create Lead</button><button className="btn btn-g" onClick={onClose}>Cancel</button></div>}
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
    </div>
  </div>);
}

/* ===================== shared ===================== */
function Kpi({label,value,d,variant,icon}){return (<div className={'kpi '+(variant||'')}><div className="kl">{icon}{label}</div><div className="kv">{value}</div>{d&&<div className="kd">{d}</div>}</div>);}
function ChartCard({title,sub,children,empty}){return (<div className="card"><h3>{title}</h3>{sub&&<div className="ch-sub">{sub}</div>}{empty?<div className="empty">{empty}</div>:children}</div>);}
