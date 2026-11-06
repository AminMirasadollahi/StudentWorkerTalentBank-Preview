// Legacy public report is retired.
export function retireLegacyReportRoute(browser) {
  const url=new URL(browser.location.href)
  if(url.searchParams.get('page')!=='report')return false
  try{browser.sessionStorage?.removeItem('student-worker-report:access:v1')}catch{}
  url.search='?page=operations'
  url.hash=''
  browser.location.replace(url.toString())
  return true
}
