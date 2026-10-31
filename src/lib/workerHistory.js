// Staff-only presentation helpers; do not broaden Supabase access.
// Operate on already-authorized ops_get_operations data without mutating it.
export function scopeWorkerHistory(data, workerId = '') {
  const workers = data?.workers || []
  const tasks = data?.tasks || []
  const time_entries = data?.time_entries || []
  if (!workerId) return { workers, tasks, time_entries }
  return {
    workers: workers.filter(worker => worker.id === workerId),
    tasks: tasks.filter(task => task.worker_id === workerId),
    time_entries: time_entries.filter(entry => entry.worker_id === workerId),
  }
}

export function summarizeWorkerHistory(scoped) {
  const tasks = scoped?.tasks || []
  const records = scoped?.time_entries || []
  return {
    taskCount: tasks.length,
    openCount: tasks.filter(task => !['completed', 'cancelled'].includes(task.state)).length,
    reportCount: records.length,
    pendingCount: records.filter(entry => entry.review_state === 'submitted').length,
    approvedMinutes: records
      .filter(entry => entry.review_state === 'approved')
      .reduce((total, entry) => total + Number(entry.approved_minutes || 0), 0),
  }
}


// Presentation-only filters for the existing manager-authorized operations result.
// Reports use ACTUAL work_date; work with NO reports uses planned_date.
// Never relabel a task with reports hidden by a filter as "without report".
// Date strings are ISO Gregorian YYYY-MM-DD, including when selected via Jalali UI.
export function filterWorkerHistory(scoped, filters = {}) {
  const workers = scoped?.workers || []
  const tasks = scoped?.tasks || []
  const records = scoped?.time_entries || []
  const unit = filters.unit || ''
  const review = filters.review || ''
  const from = filters.from || ''
  const to = filters.to || ''
  const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '')
  if ((from && !validDay(from)) || (to && !validDay(to)) || (from && to && from > to)) {
    return { workers, tasks: [], time_entries: [] }
  }
  const inDate = value => (!from || (validDay(value) && value >= from)) &&
    (!to || (validDay(value) && value <= to))
  const taskById = new Map(tasks.map(task => [task.id, task]))
  // Task unit is authoritative. The worker's enrollment unit MUST NOT be
  // substituted for a missing task: doing so would silently misattribute credit.
  const unitOf = (task) => task?.unit || ''
  const unitOk = (task, workerId) => !unit || unitOf(task, workerId) === unit
  const taskHasAnyReports = new Set(records.map(entry => entry.task_id))
  const filteredRecords = review === 'without_report' ? [] : records.filter(entry => {
    const task = taskById.get(entry.task_id)
    if (!unitOk(task, entry.worker_id)) return false
    if (review && entry.review_state !== review) return false
    return inDate(entry.work_date)
  })
  const taskWithVisibleRecord = new Set(filteredRecords.map(entry => entry.task_id))
  const filteredTasks = tasks.filter(task => {
    if (!unitOk(task, task.worker_id)) return false
    if (taskWithVisibleRecord.has(task.id)) return true
    if (taskHasAnyReports.has(task.id) || (review && review !== 'without_report')) return false
    return inDate(task.planned_date)
  })
  return { workers, tasks: filteredTasks, time_entries: filteredRecords }
}
