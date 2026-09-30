import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'

import App from '@/App'
import { AppStateProvider } from '@/app/AppState'
import { AuthProvider } from '@/app/Auth'
import { BackendStatusProvider } from '@/app/BackendStatus'
import { DomainProvider, PerDomain } from '@/app/Domain'
import { Toaster } from '@/components/ui/sonner'
import { ConsoleSessionProvider } from '@/features/console/ConsoleSession'
import { RedTeamSessionProvider } from '@/features/redteam/RedTeamSession'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <AuthProvider>
        <BackendStatusProvider>
          <DomainProvider>
            <PerDomain>
              <ConsoleSessionProvider>
                <RedTeamSessionProvider>
                  <TooltipProvider delayDuration={300}>
                    <App />
                    <Toaster />
                  </TooltipProvider>
                </RedTeamSessionProvider>
              </ConsoleSessionProvider>
            </PerDomain>
          </DomainProvider>
        </BackendStatusProvider>
        </AuthProvider>
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
)
