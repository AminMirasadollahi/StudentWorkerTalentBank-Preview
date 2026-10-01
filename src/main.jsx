import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AnalyticsBridge from './AnalyticsBridge'
import ReportApp from './ReportApp'
import './typography.css'
import './styles.css'
import './production-polish.css'

const params = new URLSearchParams(window.location.search)
const isReportPage = params.get('page') === 'report'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isReportPage ? (
      <ReportApp />
    ) : (
      <AnalyticsBridge>
        <App />
      </AnalyticsBridge>
    )}
  </StrictMode>,
)
