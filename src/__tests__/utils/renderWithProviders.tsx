// src/__tests__/utils/renderWithProviders.tsx
//
// Wraps component renders in the same providers the real app mounts at
// the root (QueryClientProvider + SafeAreaProvider) so screen tests
// don't need to manage that boilerplate themselves. Fresh QueryClient
// per test; retries disabled so tests don't sleep on transient errors.

import React, { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export function makeTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: Infinity,
        staleTime: Infinity,
      },
      mutations: { retry: false },
    },
  });
}

const SAFE_AREA_INITIAL_METRICS = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions & { client?: QueryClient },
) {
  const client = options?.client ?? makeTestQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={SAFE_AREA_INITIAL_METRICS}>
        {children}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
  return { client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
