import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './typography.css'
import './styles.css'
import './production-polish.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
