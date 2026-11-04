// Only fake offline manager data. NEVER import the real Supabase client.
import React from 'react'
import {createRoot} from 'react-dom/client'
import TermBudgetPanel from '../../src/components/TermBudgetPanel.jsx'
import '../../src/operations-workspace.css'
globalThis.__qaAllowTermWrites=true
globalThis.__qaTermWrites=[]
globalThis.__qaTermData={
 ok:true,
 term:{id:'SWTB20-SYNTHETIC-TERM',label:'نیمسال نمونه ۱۴۰۵–۱۴۰۶',
  start_date:'2026-09-23',end_date:'2027-02-09',state:'draft'},
 terms:[{id:'SWTB20-SYNTHETIC-TERM',label:'نیمسال نمونه ۱۴۰۵–۱۴۰۶',
  start_date:'2026-09-23',end_date:'2027-02-09',state:'draft'}],
 pools:[],
 units:[
  {unit:'library',name:'کتابخانه',allocated_minutes:null,remaining_minutes:null,
   approved_minutes:0,pending_minutes:0,pending_reports:0,unreported_tasks:0,unreported_estimate_minutes:0},
  {unit:'research',name:'پژوهش',allocated_minutes:null,remaining_minutes:null,
   approved_minutes:0,pending_minutes:0,pending_reports:0,unreported_tasks:0,unreported_estimate_minutes:0},
  {unit:'public_relations',name:'روابط عمومی',allocated_minutes:null,remaining_minutes:null,
   approved_minutes:0,pending_minutes:0,pending_reports:0,unreported_tasks:0,unreported_estimate_minutes:0},
 ],
 workers:[],weeks:[],
}
createRoot(document.getElementById('app')).render(<TermBudgetPanel workers={[]}/>)
