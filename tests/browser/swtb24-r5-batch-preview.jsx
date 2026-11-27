import React from 'react'
import {createRoot} from 'react-dom/client'
import BatchAssignmentPreview from '../../src/components/BatchAssignmentPreview.jsx'
import '../../src/typography.css'
import '../../src/styles.css'
import '../../src/production-polish.css'
import '../../src/report.css'
import '../../src/ops.css'
import '../../src/operations-workspace.css'
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const context={today:'2026-11-27',defaultDate:'2026-12-01',term:{id:'synthetic-term',state:'active',start_date:'2026-09-23',end_date:'2027-02-09'},
 workers:[{id:id(1),name:'دانشجوکار الف',state:'active'},{id:id(2),name:'دانشجوکار ب',state:'active'},{id:id(3),name:'دانشجوکار ج',state:'active'}],
 data:{tasks:[{id:id(4),title:'پیش‌نیاز نمونه',worker_id:id(1),planned_date:'2026-12-01',estimate_minutes:30,state:'assigned'}],weekly_slots:[{worker_id:id(1),weekday_iso:2,start_minute:480,end_minute:600,valid_from:'2026-09-23'}],exceptions:[]}}
createRoot(document.getElementById('root')).render(<main className="report-shell report-shell--dashboard ops-root" dir="rtl"><BatchAssignmentPreview context={context}/></main>)
