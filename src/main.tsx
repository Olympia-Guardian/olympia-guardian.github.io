import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initAutoRefresh } from './autoRefresh'
import './styles.css'

initAutoRefresh()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
