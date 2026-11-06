/* SWTB22 isolated visual harness: fake only, never the real Supabase client. */
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
const api=[
 'export const getOperationsTermDashboard=async()=>({ok:true,terms:[{id:"fake-term",label:"نیمسال نمونه",state:"active"}]});',
 'export const getManagerWorkPool=async()=>({ok:true,templates:[',
 '{id:"gen",title:"ثبت مشخصات منابع",unit:"library",kind:"general",state:"active",estimated_minutes:60},',
 '{id:"desk",title:"پاسخ‌گویی میز امانت",unit:"library",kind:"library_desk",state:"active",estimated_minutes:60}],',
 'opportunities:globalThis.__qaGeneralOffers||[]});',
 'export const getManagerDeskWorkPool=async()=>({ok:true,scope:"manager_desk_offers",offers:globalThis.__qaDeskOffers||[]});',
 // Real AdminOperations/TaskAssignmentEditor in this fixture, but fake-only data:
 'export const getAdminWorkV2=async()=>globalThis.__qaAdminWork;',
 'export const getMyWorkV2=async()=>({});',
 'export const getMyWorkerProfileV2=async()=>({});',
 'export const getMyProfileChangeRequests=async()=>[];',
 'export const getUnitHourTotals=async()=>({scope:"admin",units:[]});',
 'export const getLibraryDeskShifts=async()=>({ok:true,shifts:[]});',
 ...['assignGroupTask','assignLibraryDeskShift','cancelLibraryDeskShift',
 'saveOperationsTerm','saveOperationsAllocation','saveOperationsBudgetPool',
 'requestProfileChange','reviewProfileChange'].map(name=>
  `export const ${name}=async()=>{globalThis.__qaWriteAttempts++;throw Error("NO_WRITES")};`),
 ...['createWorkTemplate','createWorkOpportunity','setWorkOpportunityState',
    'createDeskWorkTemplate','createDeskWorkOffer','setDeskWorkOfferState'].map(name=>
   `export const ${name}=async()=>{globalThis.__qaWriteAttempts++;throw Error("NO_WRITES")};`),
].join('\n')
const fakeOps=[
 'export const getAdminWork=async()=>globalThis.__qaAdminWork;',
 'export const getMyWork=async()=>({});',
 'export const getWorkerStateHistory=async()=>[];',
 ...['assignWorkerTask','setWeeklyDay','setDateException','reviewWorkerTime',
  'startMyTask','submitMyTime','setWorkerState'].map(name=>
   `export const ${name}=async()=>{globalThis.__qaWriteAttempts++;throw Error("NO_WRITES")};`),
].join('\n')
const fake={
 name:'swtb22-work-pool-fake-data',enforce:'pre',
 resolveId(source,importer){
  const from=(importer||'').split('?')[0].replaceAll('\\','/')
  if((from.endsWith('/src/components/WorkPoolManagerPanel.jsx')||
     from.endsWith('/src/components/DeskWorkPoolManagerSection.jsx')||
     from.endsWith('/src/components/TaskAssignmentEditor.jsx')||
     from.endsWith('/src/components/TermBudgetPanel.jsx')||
     from.endsWith('/src/components/BudgetPoolEditor.jsx')||
     from.endsWith('/src/components/TermStatusDialog.jsx'))&&
     source==='../lib/operationsV2')return '\0swtb22-fake-api'
  if(from.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operationsV2')return '\0swtb22-fake-api'
  if(from.endsWith('/src/OperationsWorkspace.jsx')&&source==='./lib/operations')return '\0swtb22-fake-ops'
  if((from.endsWith('/src/components/TaskAssignmentEditor.jsx')||
    from.endsWith('/src/components/WorkerLifecycleControls.jsx'))&&
     source==='../lib/operations')return '\0swtb22-fake-ops'
 },
 load(id){if(id==='\0swtb22-fake-api')return api
  if(id==='\0swtb22-fake-ops')return fakeOps},
}
export default defineConfig({
 base:'/',plugins:[fake,react()],
 server:{host:'127.0.0.1',port:4179,strictPort:true},
 logLevel:'warn',
})
