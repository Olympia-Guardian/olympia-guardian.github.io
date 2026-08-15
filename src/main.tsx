import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initAutoRefresh } from './autoRefresh'
import { ErrorBoundary } from './ErrorBoundary'
import './styles.css'

initAutoRefresh()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
