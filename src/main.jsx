import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AnalyticsBridge from './AnalyticsBridge'
import OpsApp from './OpsApp'
import { documentTitleForRoute } from './lib/routeTitles.mjs'
import { retireLegacyReportRoute } from './lib/retireLegacyReportRoute.mjs'
import './typography.css'
import './styles.css'
import './production-polish.css'

const params = new URLSearchParams(window.location.search)
const page = params.get('page')
// Retired anonymous report URLs open the authenticated manager entry.
// Do not mount any app or show former candidate PII while redirecting.
if (!retireLegacyReportRoute(window)) {
  document.title = documentTitleForRoute(page)
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      {page === 'operations' ? (
        <OpsApp mode="admin" />
      ) : page === 'worker' ? (
        <OpsApp mode="worker" />
      ) : (
        <AnalyticsBridge>
          <App />
        </AnalyticsBridge>
      )}
    </StrictMode>,
  )
}
