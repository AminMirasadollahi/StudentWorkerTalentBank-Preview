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
