/* Isolated Vite test runner: ONLY fake operations APIs.
   This configuration is never used by the public Pages deployment. */
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

const v2=[
 'export const getLibraryDeskShifts=async()=>({ok:true,shifts:globalThis.__qaDeskShifts||[]});',
 'export const assignLibraryDeskShift=async args=>{if(!globalThis.__qaPermitDesk)throw Error("QA_NO_BOOKING");(globalThis.__qaDeskCalls??=[]).push(args);return {ok:true};};',
 'export const cancelLibraryDeskShift=async args=>{if(!globalThis.__qaPermitDeskCancel)throw Error("QA_NO_CANCELLATION");globalThis.__qaDeskCancels.push(args);globalThis.__qaDeskShifts=globalThis.__qaDeskShifts.map(s=>s.id===args.shiftId?{...s,state:"cancelled"}:s);return {ok:true,state:"cancelled"};};',
 'export const getUnitHourTotals=async()=>({scope:"worker",units:[{unit:"library",name:"کتابخانه",approved_minutes:0,pending_requested_minutes:30,pending_reports:1},{unit:"public_relations",name:"روابط عمومی و رسانه",approved_minutes:50,pending_requested_minutes:0,pending_reports:0},{unit:"research",name:"پژوهش",approved_minutes:55,pending_requested_minutes:45,pending_reports:1}]});',
 'export const getOperationsTermDashboard=async()=>globalThis.__qaTermData||({ok:true,term:null,terms:[],units:[],workers:[],weeks:[],pools:[]});',
 'export const saveOperationsTerm=async()=>{throw Error("BROWSER_TERM_WRITE_FORBIDDEN")};',
 'export const saveOperationsAllocation=async()=>{throw Error("BROWSER_BUDGET_WRITE_FORBIDDEN")};',
 'export const saveOperationsBudgetPool=async a=>{if(!globalThis.__qaAllowTermWrites)throw Error("BROWSER_POOL_WRITE_FORBIDDEN");(globalThis.__qaTermWrites??=[]).push(a);const data=globalThis.__qaTermData;const found=data.pools.find(p=>p.id===a.id);const p={id:a.id||"SYNTHETIC-POOL-"+data.pools.length,label:a.label,units:a.units,allocated_minutes:a.minutes,approved_minutes:0,pending_minutes:0,pending_reports:0,unreported_tasks:0,unreported_estimate_minutes:0,remaining_minutes:a.minutes};if(found)Object.assign(found,p);else data.pools.push(p);return {ok:true,pool_id:p.id};};',
 'export const getMyWorkV2=async()=>globalThis.__qaWorkerData;',
 'export const getMyWorkerProfileV2=async()=>({worker_id:"SWTB_CHROMIUM_SYNTHETIC_WORKER",name:"دانشجوکار ساختگی",major:"رشته ساختگی",entry_year:"1405",unit:"library"});',
 'export const getMyProfileChangeRequests=async()=>globalThis.__qaProfileRequests;',
 'export const getWorkerStateHistory=async()=>({ok:true,scope:"synthetic",events:[]});',
 'export const getMyWorkerAgreement=async()=>{globalThis.__qaAgreementReads=(globalThis.__qaAgreementReads||0)+1;return globalThis.__qaAgreementStatus??{status:"unpublished",required:false,accepted:false}};',
 'export const acceptMyWorkerAgreement=async({versionId,digest})=>{const state=globalThis.__qaAgreementStatus;(globalThis.__qaAgreementAcceptCalls??=[]).push({versionId,digest});if(!state||state.status!=="published"||state.version_id!==versionId||state.digest!==digest)throw Error("worker_agreement_version_stale");if(globalThis.__qaAgreementMode==="reject")throw Error("worker_agreement_role_denied");state.accepted=true;state.accepted_at="2026-11-10T08:01:00Z";const out={ok:true,version_id:versionId,digest,receipt_id:"00000000-0000-4000-8000-000000000002",accepted_at:state.accepted_at};if(globalThis.__qaAgreementMode==="commit_then_throw"){globalThis.__qaAgreementMode="";throw Error("SYNTHETIC_UNCERTAIN_NETWORK")}return out};',
 'export const setWorkerState=async()=>{globalThis.__qaWriteAttempts++;throw Error("BROWSER_WORKER_STATE_MUTATION_FORBIDDEN")};',
 'export const requestProfileChange=async()=>{globalThis.__qaWriteAttempts++;throw Error("BROWSER_SMOKE_WRITE_FORBIDDEN")};',
 ...['getAdminWorkV2','reviewProfileChange','assignGroupTask'].map(name=>
  `export const ${name}=async()=>{throw Error("BROWSER_SMOKE_API_DENIED")};`),
].join('\n')
const legacy=[
 'export const getMyWork=async()=>globalThis.__qaWorkerData;',
 ...['setWeeklyDay','setDateException','assignWorkerTask','startMyTask','submitMyTime',
     'reviewWorkerTime','getAdminWork'].map(name=>
  `export const ${name}=async()=>{globalThis.__qaWriteAttempts++;throw Error("BROWSER_SMOKE_WRITE_FORBIDDEN")};`),
].join('\n')
const isolates={
 name:'swtb7-no-backend-ever',
 enforce:'pre',
 resolveId(source,importer){
  const from=(importer||'').split('?')[0].replaceAll('\\','/')
  if(from.endsWith('/src/OperationsWorkspace.jsx')){
   if(source==='./lib/operationsV2')return '\0swtb7-fake-v2'
   if(source==='./lib/operations')return '\0swtb7-fake-legacy'
  }
  if((from.endsWith('/src/components/TermBudgetPanel.jsx')||from.endsWith('/src/components/BudgetPoolEditor.jsx')||from.endsWith('/src/components/TermStatusDialog.jsx'))&&source==='../lib/operationsV2')
    return '\0swtb7-fake-v2'
  if(from.endsWith('/src/components/TaskAssignmentEditor.jsx')){
   if(source==='../lib/operationsV2')return '\0swtb7-fake-v2'
   if(source==='../lib/operations')return '\0swtb7-fake-legacy'
  }
 },
 load(id){
  if(id==='\0swtb7-fake-v2')return v2
  if(id==='\0swtb7-fake-legacy')return legacy
 }
}
export default defineConfig({
 base:'/',plugins:[isolates,react()],
 server:{host:'127.0.0.1',port:4177,strictPort:true},
 logLevel:'warn',
})
