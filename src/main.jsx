import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { PostHogProvider } from '@posthog/react'

const posthogKey = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
const posthogHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

const app = <App />

ReactDOM.createRoot(document.getElementById('root')).render(
  posthogKey
    ? (
      <PostHogProvider
        apiKey={posthogKey}
        options={{
          api_host: posthogHost,
          defaults: '2026-05-30',
          capture_pageview: false,
          capture_pageleave: true,
        }}
      >
        {app}
      </PostHogProvider>
    )
    : app
)

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}
