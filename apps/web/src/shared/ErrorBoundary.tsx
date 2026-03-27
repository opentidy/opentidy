// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] uncaught error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0f0f11] p-6">
          <div className="w-full max-w-md rounded-xl border border-red-500/20 bg-red-500/5 p-8 text-center">
            <div className="mb-4 text-4xl">!</div>
            <h1 className="mb-2 text-lg font-semibold text-white">
              Une erreur est survenue
            </h1>
            <p className="mb-6 text-sm text-neutral-400 break-words">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-white/10 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
            >
              Recharger
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
