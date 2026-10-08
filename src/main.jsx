import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import AnalyticsBridge from './AnalyticsBridge'
import ReportApp from './ReportApp'
import OpsApp from './OpsApp'
import './typography.css'
import './styles.css'
import './production-polish.css'

const params = new URLSearchParams(window.location.search)
const page = params.get('page')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {page === 'report' ? (
      <ReportApp />
    ) : page === 'operations' ? (
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
