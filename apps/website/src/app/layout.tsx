// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenTidy — Your personal AI assistant that actually does the work",
  description:
    "Open-source autonomous AI assistant that manages your admin tasks 24/7. Emails, forms, invoices, follow-ups — handled.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="noise-bg bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
