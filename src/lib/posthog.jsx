import React, { createContext, useContext } from 'react'
import { PostHogProvider, usePostHog } from '@posthog/react'

const PostHogClientContext = createContext(null)

function PostHogBridge({ children }) {
  const client = usePostHog()
  return (
    <PostHogClientContext.Provider value={client}>
      {children}
    </PostHogClientContext.Provider>
  )
}

export function AppPostHogProvider({ children }) {
  const apiKey = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN
  const apiHost = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com'

  if (!apiKey) {
    return (
      <PostHogClientContext.Provider value={null}>
        {children}
      </PostHogClientContext.Provider>
    )
  }

  return (
    <PostHogProvider
      apiKey={apiKey}
      options={{
        api_host: apiHost,
        defaults: '2026-05-30',
        capture_pageview: false,
        capture_pageleave: true,
      }}
    >
      <PostHogBridge>{children}</PostHogBridge>
    </PostHogProvider>
  )
}

export function useAppPostHog() {
  return useContext(PostHogClientContext)
}
