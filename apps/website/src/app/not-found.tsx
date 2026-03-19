// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="font-serif text-7xl text-zinc-300">404</h1>
      <p className="mt-4 text-lg text-zinc-500">Page not found</p>
      <Link
        href="/"
        className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900/50 px-5 py-2.5 text-sm text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
      >
        Back to home
      </Link>
    </div>
  );
}
