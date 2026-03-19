// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

"use client";

export function SearchTrigger() {
  return (
    <button
      onClick={() =>
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "k", metaKey: true }),
        )
      }
      className="flex w-full items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-1.5 text-left text-[13px] text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-400"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
      <span className="flex-1">Search...</span>
      <kbd className="rounded border border-zinc-700/60 bg-zinc-800/60 px-1.5 py-0.5 text-[10px] text-zinc-600">
        ⌘K
      </kbd>
    </button>
  );
}
