import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from '@/App'
import { AppStateProvider } from '@/app/AppState'
import { BackendStatusProvider } from '@/app/BackendStatus'
import { Toaster } from '@/components/ui/sonner'
import { ConsoleSessionProvider } from '@/features/console/ConsoleSession'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <BackendStatusProvider>
          <ConsoleSessionProvider>
            <TooltipProvider delayDuration={300}>
              <App />
              <Toaster />
            </TooltipProvider>
          </ConsoleSessionProvider>
        </BackendStatusProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
)
