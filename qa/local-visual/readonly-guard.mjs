// SWTB17 PR85 owner-local QA only. This module never imports Supabase,
// stores credentials, sends telemetry, or exposes private response payloads.
export const PROJECT_ORIGIN = 'https://pmwxryavkrjcdobwkryw.supabase.co';
const ALLOWED_RPC = new Set([
  'ops_is_admin', 'ops_list_candidates', 'ops_get_operations_v3',
]);
export function classifyReadOnlyRequest(input, init = {}, pageOrigin = 'http://127.0.0.1:8000') {
  let url, method;
  try {
    const target = typeof input === 'string' || input instanceof URL
      ? String(input) : input?.url;
    method = String(init?.method || input?.method || 'GET').toUpperCase();
    url = new URL(target, pageOrigin);
  } catch { return {allowed:false,kind:'blocked',reason:'INVALID_REQUEST'}; }
  if (url.origin === pageOrigin && (method === 'GET' || method === 'HEAD')) {
    return {allowed:true,kind:'local-static'};
  }
  if (url.origin !== PROJECT_ORIGIN || url.username || url.password)
    return {allowed:false,kind:'blocked',reason:'FOREIGN_DESTINATION'};
  if (method === 'POST' && !url.search && url.pathname.startsWith('/rest/v1/rpc/')) {
    const name = url.pathname.slice('/rest/v1/rpc/'.length);
    if (ALLOWED_RPC.has(name)) return {allowed:true,kind:'rpc',name};
  }
  if (url.pathname === '/auth/v1/token' && method === 'POST' &&
      [...url.searchParams.keys()].length === 1 &&
      ['password','refresh_token'].includes(url.searchParams.get('grant_type'))) {
    return {allowed:true,kind:'auth'};
  }
  if (url.pathname === '/auth/v1/user' && method === 'GET' && !url.search)
    return {allowed:true,kind:'auth'};
  if (url.pathname === '/auth/v1/logout' && method === 'POST' &&
      [...url.searchParams.keys()].every(k=>k==='scope'))
    return {allowed:true,kind:'auth'};
  return {allowed:false,kind:'blocked',reason:'NOT_IN_READ_ONLY_ALLOWLIST'};
}
export function installReadOnlyGuard(onMetric = ()=>{}) {
  if (typeof window === 'undefined' || typeof window.fetch !== 'function')
    throw new Error('SWTB17_QA_BROWSER_REQUIRED');
  const nativeFetch = window.fetch.bind(window);
  let blocked=0;
  window.fetch = async (input,init) => {
    const check=classifyReadOnlyRequest(input,init,window.location.origin);
    if(!check.allowed) {
      blocked++;
      onMetric({kind:'blocked',blockedCount:blocked});
      throw new Error('SWTB17_QA_READ_ONLY_BLOCKED');
    }
    const began=performance.now();
    try {
      const response=await nativeFetch(input,init);
      if(check.kind==='rpc') {
        let bytes=null;
        try { bytes=(await response.clone().arrayBuffer()).byteLength; } catch {}
        onMetric({kind:'rpc',name:check.name,httpStatus:response.status,
          ms:Math.round((performance.now()-began)*10)/10,bodyBytes:bytes});
      }
      return response;
    } catch(error) {
      if(check.kind==='rpc')
        onMetric({kind:'rpc',name:check.name,httpStatus:0,
          ms:Math.round((performance.now()-began)*10)/10,bodyBytes:null});
      throw error;
    }
  };
  return ()=>{window.fetch=nativeFetch;};
}
