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
