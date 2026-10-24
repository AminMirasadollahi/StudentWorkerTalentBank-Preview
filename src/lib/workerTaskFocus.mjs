/**
 * SWTB7 action-first task projection.
 * Read-only: derives UI groups from the server's canonical task state.
 * Never infers manager approval from dates, time-entry totals, or client guesses.
 */
const ACTIONABLE=new Set(['assigned','in_progress','needs_changes'])
const UPCOMING=new Set(['assigned','in_progress'])
const safelyDated=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:'9999-12-31'
const asc=(a,b)=>safelyDated(a.planned_date).localeCompare(safelyDated(b.planned_date))
const priority=task=>task.state==='needs_changes'?0:1

export function selectWorkerTaskFocus(tasks=[],todayIso,view='action') {
 const source=Array.isArray(tasks)?tasks:[]
 if(view==='action')return source.filter(task=>
   task.state==='needs_changes' ||
   (ACTIONABLE.has(task.state)&&safelyDated(task.planned_date)<=todayIso))
   .sort((a,b)=>priority(a)-priority(b)||asc(a,b))
 if(view==='pending')return source.filter(task=>task.state==='submitted')
   .sort((a,b)=>safelyDated(b.planned_date).localeCompare(safelyDated(a.planned_date)))
 if(view==='upcoming')return source.filter(task=>
   UPCOMING.has(task.state)&&safelyDated(task.planned_date)>todayIso)
   .sort(asc)
 if(view==='completed')return source.filter(task=>task.state==='completed')
   .sort((a,b)=>safelyDated(b.planned_date).localeCompare(safelyDated(a.planned_date)))
 return []
}

export function summarizeWorkerTaskFocus(tasks,todayIso) {
 return {
  action:selectWorkerTaskFocus(tasks,todayIso,'action').length,
  pending:selectWorkerTaskFocus(tasks,todayIso,'pending').length,
  upcoming:selectWorkerTaskFocus(tasks,todayIso,'upcoming').length,
  completed:selectWorkerTaskFocus(tasks,todayIso,'completed').length,
 }
}
