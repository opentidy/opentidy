// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

const features = [
  {
    title: "Long-lived tasks, not conversations",
    description:
      "Each task is a persistent task that lives for days or weeks. OpenTidy picks it up, works on it, puts it down, and picks it back up — just like a real assistant.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z"
        />
      </svg>
    ),
  },
  {
    title: "Truly autonomous",
    description:
      "It doesn't wait for you to type. It receives events — emails, messages, schedules — triages them, routes them to the right task, and gets to work.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    ),
  },
  {
    title: "Claude does the thinking",
    description:
      "No fragile decision trees, no rigid workflows, no prompt chains. Claude Code is the execution engine — with full access to browser, filesystem, and tools.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z"
        />
      </svg>
    ),
  },
  {
    title: "Security guardrails AI can't bypass",
    description:
      "PreToolUse hooks intercept every sensitive action before it happens. Claude doesn't know they exist, can't see them, can't skip them. System-level enforcement.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
        />
      </svg>
    ),
  },
  {
    title: "Self-improving",
    description:
      "When OpenTidy can't do something, it logs the gap. Over time, these gaps become your natural backlog — driven by real usage, not guesswork.",
    icon: (
      <svg
        className="h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941"
        />
      </svg>
    ),
  },
];

export function Features() {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-6xl">
        {/* Section header */}
        <div className="mb-20 max-w-2xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-400">
            What makes it different
          </p>
          <h2 className="font-serif text-4xl text-white sm:text-5xl">
            Not a chatbot.
            <br />
            <span className="text-zinc-500">A real assistant.</span>
          </h2>
        </div>

        {/* Feature grid */}
        <div className="grid gap-px overflow-hidden rounded-2xl border border-zinc-800/60 bg-zinc-800/30 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <div
              key={i}
              className="group bg-zinc-950 p-8 transition-colors hover:bg-zinc-900/80"
            >
              <div className="mb-4 inline-flex rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-emerald-400 transition-colors group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10">
                {feature.icon}
              </div>
              <h3 className="mb-3 text-lg font-semibold text-white">
                {feature.title}
              </h3>
              <p className="text-sm leading-relaxed text-zinc-400">
                {feature.description}
              </p>
            </div>
          ))}

          {/* Empty cell for grid alignment */}
          <div className="hidden bg-zinc-950 p-8 lg:block">
            <div className="flex h-full items-center justify-center">
              <p className="font-serif text-2xl italic text-zinc-700">
                More to come...
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
