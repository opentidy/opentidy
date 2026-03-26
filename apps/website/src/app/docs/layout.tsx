// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { DocsHeader } from "@/components/DocsHeader";
import { SearchDialog } from "@/components/SearchDialog";

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DocsHeader />

      {/* Subtle emerald glow, top right, matching homepage vibe */}
      <div
        className="pointer-events-none fixed top-0 right-0 -z-10"
        style={{
          width: "600px",
          height: "400px",
          background:
            "radial-gradient(ellipse at center, rgba(16, 185, 129, 0.05) 0%, transparent 70%)",
        }}
      />

      {/* Grid lines (same as homepage) */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.02]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="mx-auto flex max-w-7xl gap-10 px-6 pt-14">
        {children}
      </div>
      <SearchDialog />
    </>
  );
}
