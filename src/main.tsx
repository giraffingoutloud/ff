import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Use ModernApp for the new UI, or switch back to App for classic UI
import ModernApp from './ModernApp.tsx'
// import App from './App.tsx'
import { ThemeProvider } from './contexts/ThemeContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ModernApp />
    </ThemeProvider>
  </StrictMode>,
)
