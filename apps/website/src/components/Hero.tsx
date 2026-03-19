// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import Link from "next/link";

export function Hero() {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6">
      {/* Radial glow */}
      <div
        className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "800px",
          height: "600px",
          background:
            "radial-gradient(ellipse at center, rgba(16, 185, 129, 0.08) 0%, transparent 70%)",
          animation: "glow-pulse 6s ease-in-out infinite",
        }}
      />

      {/* Grid lines background */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        {/* Badge */}
        <div
          className="animate-fade-in-up mb-8 inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/60 px-4 py-1.5 text-sm text-zinc-400 backdrop-blur-sm"
          style={{ animationDelay: "0s" }}
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Open source &middot; Self-hosted &middot; Private
        </div>

        {/* Headline */}
        <h1
          className="animate-fade-in-up font-serif text-5xl leading-tight tracking-tight text-white sm:text-7xl md:text-8xl"
          style={{ animationDelay: "0.1s" }}
        >
          Your AI assistant
          <br />
          that actually{" "}
          <span className="italic text-emerald-400">does the work</span>
        </h1>

        {/* Subheadline */}
        <p
          className="animate-fade-in-up mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-zinc-400 sm:text-xl"
          style={{ animationDelay: "0.2s" }}
        >
          OpenTidy manages your admin tasks autonomously — emails, forms,
          invoices, follow-ups. It runs 24/7 in the background and only pings
          you when it genuinely needs your input.
        </p>

        {/* CTA buttons */}
        <div
          className="animate-fade-in-up mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          style={{ animationDelay: "0.3s" }}
        >
          <Link
            href="/docs/getting-started"
            className="group relative inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-all hover:bg-emerald-400"
          >
            Get Started
            <svg
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
          <a
            href="https://github.com/opentidy/opentidy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-6 py-3 text-sm font-medium text-zinc-300 transition-all hover:border-zinc-700 hover:text-white"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            View on GitHub
          </a>
        </div>

        {/* Install command */}
        <div
          className="animate-fade-in-up mt-16 inline-flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-900/40 px-5 py-3 font-mono text-sm backdrop-blur-sm"
          style={{ animationDelay: "0.4s" }}
        >
          <span className="text-zinc-500">$</span>
          <span className="text-zinc-300">brew install opentidy/opentidy/opentidy</span>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce">
        <svg
          className="h-5 w-5 text-zinc-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3"
          />
        </svg>
      </div>
    </section>
  );
}
