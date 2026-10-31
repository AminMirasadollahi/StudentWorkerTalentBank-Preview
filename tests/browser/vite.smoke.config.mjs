/* Isolated Vite test runner: ONLY fake operations APIs.
   This configuration is never used by the public Pages deployment. */
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'

const v2=[
 'export const getUnitHourTotals=async()=>({scope:"worker",units:[{unit:"library",name:"کتابخانه",approved_minutes:55,pending_requested_minutes:30,pending_reports:1}]});',
 'export const getMyWorkV2=async()=>globalThis.__qaWorkerData;',
 'export const getMyWorkerProfileV2=async()=>({worker_id:"SWTB_CHROMIUM_SYNTHETIC_WORKER",name:"دانشجوکار ساختگی",major:"رشته ساختگی",entry_year:"1405",unit:"library"});',
 'export const getMyProfileChangeRequests=async()=>globalThis.__qaProfileRequests;',
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
