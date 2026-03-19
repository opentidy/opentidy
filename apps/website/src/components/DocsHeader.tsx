// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import Link from "next/link";
import { SearchTrigger } from "./SearchTrigger";

export function DocsHeader() {
  return (
    <header className="fixed top-0 right-0 left-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl">
      {/* Subtle emerald glow under header */}
      <div
        className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"
        style={{
          width: "400px",
          height: "40px",
          background:
            "radial-gradient(ellipse at center, rgba(52, 211, 153, 0.08) 0%, transparent 70%)",
        }}
      />
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        {/* Left: Logo + nav */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="font-serif text-lg tracking-tight text-white"
          >
            OpenTidy
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Link
              href="/"
              className="rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
            >
              Home
            </Link>
            <Link
              href="/docs/getting-started"
              className="rounded-md border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5 text-sm text-emerald-400"
            >
              Docs
            </Link>
          </nav>
        </div>

        {/* Right: Search + GitHub */}
        <div className="flex items-center gap-3">
          <div className="w-56">
            <SearchTrigger />
          </div>
          <a
            href="https://github.com/opentidy/opentidy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-zinc-400 transition-colors hover:text-white"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <span className="hidden lg:inline">GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
