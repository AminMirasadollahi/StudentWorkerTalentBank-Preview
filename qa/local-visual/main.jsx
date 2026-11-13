import React from 'react';
import {createRoot} from 'react-dom/client';
import {installReadOnlyGuard} from './readonly-guard.mjs';
import '../../src/typography.css';
import '../../src/styles.css';
import '../../src/production-polish.css';
import './qa-toolbar.css';

const seen=[];
let blockedCount=0;
const status=document.getElementById('swtb17-qa-stat');
installReadOnlyGuard(entry=>{
 if(entry.kind==='blocked')blockedCount=entry.blockedCount;
 if(entry.kind==='rpc'){
  seen.push(entry);
  if(seen.length>30)seen.shift();
 }
 status.textContent='درخواست‌های خواندنی ثبت‌شده: '+seen.length+
   ' | عملیات مسدودشده: '+blockedCount;
});
document.getElementById('swtb17-qa-report').addEventListener('click',()=>{
 // Explicit fixed schema only. Never store raw responses, IDs, Auth tokens,
 // URLs, headers, full names, majors, emails, errors or screenshots.
 const report={
  build:'SWTB17_PR85_LOCAL_REACT_VISUAL_QA_V1',
  reviewCommit:import.meta.env.VITE_SWTB17_QA_SHA||'UNKNOWN',
  flag:'ENABLED_IN_QA_ONLY',
  redesignedManagerShell:'ENABLED_IN_QA_ONLY',
  readOnlyNetworkGuard:true,
  authSession:'IN_MEMORY_QA_BUILD',
  exportedAtUtc:new Date().toISOString(),
  blockedOperations:blockedCount,
  rpcRequests:seen.map(x=>({name:x.name,httpStatus:x.httpStatus,
    ms:x.ms,bodyBytes:x.bodyBytes})),
  note:'These are browser QA metrics, NOT approval to publish or evidence of production deployment.',
 };
 const blob=new Blob([JSON.stringify(report,null,2)+'\n'],{type:'application/json'});
 const url=URL.createObjectURL(blob);
 const link=document.createElement('a');
 link.href=url;link.download='SWTB17_PR85_LOCAL_REACT_QA_SUMMARY.json';
 link.click();
 setTimeout(()=>URL.revokeObjectURL(url),500);
});
// This is the exact Draft PR85 OpsApp/ManagerCandidatesWorkspace React tree,
// except volatile Auth storage and an explicit read-only fetch gate in this QA entry.
const {default:OpsApp}=await import('../../src/OpsApp.jsx');
createRoot(document.getElementById('root')).render(
 <React.StrictMode><OpsApp mode="admin"/></React.StrictMode>
);
