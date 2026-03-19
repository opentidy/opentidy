// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-zinc-800/60 px-6 py-16">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 sm:flex-row">
        <div>
          <p className="font-serif text-xl text-white">OpenTidy</p>
          <p className="mt-1 text-sm text-zinc-600">
            AGPL-3.0 &middot; Loaddr Ltd
          </p>
        </div>

        <nav className="flex flex-wrap items-center gap-6 text-sm text-zinc-500">
          <Link
            href="/docs/getting-started"
            className="transition-colors hover:text-zinc-300"
          >
            Docs
          </Link>
          <a
            href="https://github.com/opentidy/opentidy"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-zinc-300"
          >
            GitHub
          </a>
          <Link
            href="/docs/contributing"
            className="transition-colors hover:text-zinc-300"
          >
            Contributing
          </Link>
          <Link
            href="/docs/security"
            className="transition-colors hover:text-zinc-300"
          >
            Security
          </Link>
        </nav>
      </div>
    </footer>
  );
}
