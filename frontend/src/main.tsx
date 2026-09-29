import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from '@/App'
import { AppStateProvider } from '@/app/AppState'
import { BackendStatusProvider } from '@/app/BackendStatus'
import { Toaster } from '@/components/ui/sonner'
import { ConsoleSessionProvider } from '@/features/console/ConsoleSession'
import { RedTeamSessionProvider } from '@/features/redteam/RedTeamSession'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <BackendStatusProvider>
          <ConsoleSessionProvider>
            <RedTeamSessionProvider>
              <TooltipProvider delayDuration={300}>
                <App />
                <Toaster />
              </TooltipProvider>
            </RedTeamSessionProvider>
          </ConsoleSessionProvider>
        </BackendStatusProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
)
