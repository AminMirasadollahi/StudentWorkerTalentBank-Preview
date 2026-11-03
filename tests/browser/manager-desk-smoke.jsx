/* SWTB17 isolated manager editor; zero real auth or Supabase imports. */
import React from 'react'
import {createRoot} from 'react-dom/client'
import TaskAssignmentEditor from '../../src/components/TaskAssignmentEditor.jsx'
import '../../src/operations-workspace.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/typography.css'
const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
 timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'
}).formatToParts(new Date()).map(x=>[x.type,x.value]))
const today=[p.year,p.month,p.day].join('-')
const workers=[
 {id:'SYNTH-A',name:'دانشجوی آزمایشی اول',unit:'library',state:'active'},
 {id:'SYNTH-B',name:'دانشجوی آزمایشی دوم',unit:'research',state:'active'},
 {id:'SYNTH-C',name:'دانشجوی آزمایشی سوم',unit:'public_relations',state:'active'},
]
globalThis.__qaDeskShifts=[{id:'SYNTH-SHIFT-01',task_id:'SYNTH-TASK-01',
 worker_id:'SYNTH-B',state:'scheduled',shift_date:today,start_minute:780,end_minute:900}]
globalThis.__qaDeskCalls=[]
globalThis.__qaDeskCancels=[]
globalThis.__qaPermitDeskCancel=true
globalThis.__qaPermitDesk=false
globalThis.__qaWriteAttempts=0
createRoot(document.getElementById('root')).render(
 <div className="report-shell" dir="rtl" style={{maxWidth:1000,margin:'28px auto'}}>
  <section className="report-panel">
   <h2>واگذاری کار · پیش‌نمایش ایزوله</h2>
   <TaskAssignmentEditor workers={workers}
    data={{workers,tasks:[],weekly_slots:[],exceptions:[],time_entries:[]}}
    defaultWorkerId="SYNTH-A" defaultDate={today}
    onSaved={async()=>{}}/>
  </section>
 </div>)
