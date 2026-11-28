// Dedicated synthetic OpsApp harness. No real operations client or Supabase package.
import base from './vite.swtb24-r5.config.mjs'
const fake={
 name:'swtb27-opsapp-fake-identity',enforce:'pre',
 resolveId(source,importer){
  const from=(importer||'').split('?')[0].replaceAll('\\','/')
  if(source==='@supabase/supabase-js')throw Error('SWTB27_REAL_SUPABASE_IMPORT_FORBIDDEN')
  if(from.includes('/src/')&&/^(?:\.\/|\.\.\/)(?:lib\/)?operations(?:\.js)?$/.test(source))return '\0swtb27-opsapp-ops'
  if(from.endsWith('/src/ReportApp.jsx')&&source==='./lib/reporting')return '\0swtb27-opsapp-report'
 },
 load(id){
  if(id==='\0swtb27-opsapp-report')return 'export const getStudentWorkerReport=async()=>{throw Error("SYNTHETIC_LEGACY_REPORT_FORBIDDEN")}'
  if(id!=='\0swtb27-opsapp-ops')return
  return [
   'const get=()=>globalThis.__qaOpsAppApi;',
   'export const opsClient={auth:{getSession:(...a)=>get().auth.getSession(...a),getUser:(...a)=>get().auth.getUser(...a),onAuthStateChange:(...a)=>get().auth.onAuthStateChange(...a),updateUser:(...a)=>get().forbid(...a)},rpc:(...a)=>get().rpc(...a),functions:{invoke:(...a)=>get().forbid(...a)}};',
   'export const currentOperationsIdentity=()=>get().identity();',
   'export const getOperationsCandidates=()=>get().candidates();',
   'export const signOutOperations=()=>get().logout();',
   'export const getAdminWork=async()=>globalThis.__qaAdminWork;',
   'export const getMyWork=async()=>({});',
   'export const getWorkerStateHistory=async()=>[];',
   ...['signInOperations','provisionWorker','setCandidateScreening','setCandidateEmail','assignWorkerTask','setWeeklyDay','setDateException','reviewWorkerTime','startMyTask','submitMyTime','setWorkerState'].map(n=>'export const '+n+'=(...a)=>get().forbid(...a);')
  ].join('\n')
 }
}
export default {...base,plugins:[fake,...base.plugins],server:{...base.server,hmr:false},optimizeDeps:{noDiscovery:true,include:['react','react-dom/client','react/jsx-runtime','react/jsx-dev-runtime']}}
