// SWTB17 Issue #48 -- experimental, manager-authorized, frontend-only identity join.
// Pure function. No network, SQL, storage, mutation, or authorization decision here.
// Both RPCs MUST pass the existing manager-side server guards. Fail closed on
// inconsistent worker<->application association instead of displaying stale names.
function requiredText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
function linked(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row))
    throw new TypeError('SWTB17_CANDIDATE_ROW_INVALID');
  if (row.worker_id != null && typeof row.worker_id !== 'string')
    throw new TypeError('SWTB17_WORKER_ID_INVALID');
  return Boolean(row.worker_id);
}
export function needsManagerWorkerIdentitySnapshot(candidates) {
  if (!Array.isArray(candidates)) throw new TypeError('SWTB17_CANDIDATE_LIST_INVALID');
  return candidates.some(row => linked(row) && (
    !requiredText(row.worker_effective_full_name) ||
    !requiredText(row.worker_effective_major)
  ));
}
export function projectCandidatesFromManagerWorkers(candidates, managerSnapshot) {
  if (!Array.isArray(candidates)) throw new TypeError('SWTB17_CANDIDATE_LIST_INVALID');
  if (!needsManagerWorkerIdentitySnapshot(candidates)) return candidates;
  const workers=managerSnapshot?.workers;
  if (!Array.isArray(workers)) throw new TypeError('SWTB17_MANAGER_WORKER_SNAPSHOT_INVALID');
  const byId=new Map();
  for (const w of workers) {
    if (!w || typeof w !== 'object' || Array.isArray(w) || !requiredText(w.id) ||
        typeof w.application_id !== 'string')
      throw new TypeError('SWTB17_MANAGER_WORKER_RECORD_INVALID');
    if (byId.has(w.id)) throw new Error('SWTB17_DUPLICATE_WORKER_ID');
    byId.set(w.id,w);
  }
  return candidates.map(row => {
    if (!linked(row)) return row;
    const w=byId.get(row.worker_id);
    if (!w || !requiredText(row.id) || w.application_id !== row.id)
      throw new Error('SWTB17_WORKER_APPLICATION_JOIN_MISMATCH');
    const name=requiredText(w.name);
    if (!name) throw new Error('SWTB17_CURRENT_WORKER_NAME_MISSING');
    const major=requiredText(w.major) || requiredText(row.major);
    if (!major) throw new Error('SWTB17_CURRENT_WORKER_MAJOR_MISSING');
    // If a future single-RPC backend returns current values, do not silently
    // prefer one of two conflicting snapshots collected at different times.
    const alreadyName=requiredText(row.worker_effective_full_name);
    const alreadyMajor=requiredText(row.worker_effective_major);
    if ((alreadyName && alreadyName !== name) || (alreadyMajor && alreadyMajor !== major))
      throw new Error('SWTB17_CONFLICTING_AUTHORIZED_SNAPSHOTS');
    return {...row,worker_effective_full_name:name,worker_effective_major:major};
  });
}
