import React, { Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import PopupProviders from '@/components/popup/PopupProviders'
import PopupView from '@/components/popup/PopupView'

interface PopupErrorBoundaryState {
  error: Error | null
}

class PopupErrorBoundary extends Component<{ children: ReactNode }, PopupErrorBoundaryState> {
  state: PopupErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): PopupErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('SuperTunnel popup failed to render', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-w-[320px] bg-background p-4 text-foreground">
          <h1 className="text-lg font-semibold">SuperTunnel could not start</h1>
          <p className="mt-2 text-sm text-muted-foreground">{this.state.error.message}</p>
          <button
            type="button"
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Reload popup
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

const container = document.getElementById('root')
if (!container) {
  throw new Error('Popup root element is missing')
}

createRoot(container).render(
  <PopupErrorBoundary>
    <PopupProviders>
      <PopupView />
    </PopupProviders>
  </PopupErrorBoundary>,
)


