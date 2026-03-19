// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import Link from "next/link";
import { docsNav } from "@/lib/docs-nav";

export function DocsPagination({ currentSlug }: { currentSlug: string }) {
  const currentIndex = docsNav.findIndex((item) => item.slug === currentSlug);
  const prev = currentIndex > 0 ? docsNav[currentIndex - 1] : null;
  const next =
    currentIndex < docsNav.length - 1 ? docsNav[currentIndex + 1] : null;

  return (
    <nav className="mt-16 flex items-center justify-between border-t border-zinc-800/60 pt-6">
      {prev ? (
        <Link
          href={`/docs/${prev.slug}`}
          className="group flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          <svg
            className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
            />
          </svg>
          {prev.label}
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/docs/${next.slug}`}
          className="group flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
        >
          {next.label}
          <svg
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
            />
          </svg>
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}
