// Document titles are route-specific, never inferred from a cached user role.
// The first title is applied before React mounts to avoid a stale tab label.
const routeTitles = Object.freeze({
  worker: 'پنل اختصاصی دانشجوکار | SWTB',
  operations: 'مدیریت دانشجوکارها | SWTB',
  report: 'گزارش همکاری دانشجویی | SWTB',
  intake: 'درخواست همکاری دانشجویی | SWTB',
})
export function documentTitleForRoute(route) {
  return routeTitles[route] || routeTitles.intake
}

// Authentication is authoritative, not the address the user happened to
// bookmark. Both operations routes share the same secured identity flow.
// Before a server-verified identity exists, use the intended entry route.
export function documentTitleForOperationsIdentity(role, entryMode) {
  if (role === 'admin') return documentTitleForRoute('operations')
  if (role === 'worker' || role === 'worker_disabled')
    return documentTitleForRoute('worker')
  return documentTitleForRoute(entryMode === 'worker' ? 'worker' : 'operations')
}
