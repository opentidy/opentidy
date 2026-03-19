// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

const steps = [
  {
    label: "Events arrive",
    detail: "Email, SMS, Calendar, You",
    color: "bg-zinc-800 border-zinc-700",
  },
  {
    label: "Receiver",
    detail: "Dedup + Claude triage",
    color: "bg-zinc-800 border-zinc-700",
  },
  {
    label: "Launcher",
    detail: "Spawns focused Claude session",
    color: "bg-zinc-800 border-emerald-500/30",
  },
  {
    label: "Claude Code",
    detail: "Works autonomously + hooks verify",
    color: "bg-emerald-500/10 border-emerald-500/40",
    highlight: true,
  },
  {
    label: "Workspace",
    detail: "state.md, artifacts, memory",
    color: "bg-zinc-800 border-zinc-700",
  },
  {
    label: "Notification",
    detail: '"Done" or "I need your input"',
    color: "bg-zinc-800 border-zinc-700",
  },
];

export function Architecture() {
  return (
    <section className="relative px-6 py-32">
      {/* Subtle divider */}
      <div className="absolute top-0 left-1/2 h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-400">
            How it works
          </p>
          <h2 className="font-serif text-4xl text-white sm:text-5xl">
            Events in, results out
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            Each dossier gets its own isolated Claude Code session with only the
            context it needs. Sessions run in parallel without interfering.
          </p>
        </div>

        {/* Flow diagram */}
        <div className="flex flex-col items-center gap-3">
          {steps.map((step, i) => (
            <div key={i} className="flex w-full max-w-md flex-col items-center">
              <div
                className={`w-full rounded-xl border p-5 text-center transition-all ${step.color} ${
                  step.highlight
                    ? "shadow-lg shadow-emerald-500/5"
                    : ""
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    step.highlight ? "text-emerald-400" : "text-white"
                  }`}
                >
                  {step.label}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{step.detail}</p>
              </div>
              {i < steps.length - 1 && (
                <div className="flex h-6 items-center">
                  <svg
                    className={`h-4 w-4 ${
                      step.highlight ? "text-emerald-500/60" : "text-zinc-700"
                    }`}
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
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
