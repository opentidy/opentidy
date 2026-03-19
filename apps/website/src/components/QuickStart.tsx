// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

const lines = [
  { prompt: true, text: "brew tap opentidy/opentidy" },
  { prompt: true, text: "brew install opentidy" },
  { prompt: true, text: "opentidy setup" },
  { prompt: false, text: "✓ Telegram configured" },
  { prompt: false, text: "✓ Claude Code authenticated" },
  { prompt: false, text: "✓ Webhooks connected" },
  { prompt: true, text: "opentidy start" },
  { prompt: false, text: "OpenTidy is running. Dashboard → http://localhost:5175" },
];

export function QuickStart() {
  return (
    <section className="relative px-6 py-32">
      <div className="absolute top-0 left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-400">
            Quick start
          </p>
          <h2 className="font-serif text-4xl text-white sm:text-5xl">
            Up and running in minutes
          </h2>
        </div>

        {/* Terminal window */}
        <div className="overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-900/60 shadow-2xl shadow-black/20 backdrop-blur-sm">
          {/* Title bar */}
          <div className="flex items-center gap-2 border-b border-zinc-800/60 px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-zinc-700" />
            <div className="h-3 w-3 rounded-full bg-zinc-700" />
            <div className="h-3 w-3 rounded-full bg-zinc-700" />
            <span className="ml-3 text-xs text-zinc-600">Terminal</span>
          </div>

          {/* Terminal content */}
          <div className="p-6 font-mono text-sm leading-loose">
            {lines.map((line, i) => (
              <div key={i} className="flex gap-2">
                {line.prompt ? (
                  <>
                    <span className="select-none text-emerald-500">$</span>
                    <span className="text-zinc-200">{line.text}</span>
                  </>
                ) : (
                  <span className="pl-4 text-zinc-500">{line.text}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Requirements note */}
        <p className="mt-8 text-center text-sm text-zinc-600">
          Requires Node.js &ge; 22, Claude Code with Claude Max, and a Telegram
          bot for notifications.
        </p>
      </div>
    </section>
  );
}
