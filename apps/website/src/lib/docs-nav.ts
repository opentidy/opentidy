// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

export interface NavItem {
  slug: string;
  label: string;
}

export const docsNav: NavItem[] = [
  { slug: "getting-started", label: "Getting Started" },
  { slug: "configuration", label: "Configuration" },
  { slug: "architecture", label: "Architecture" },
  { slug: "security", label: "Security" },
  { slug: "contributing", label: "Contributing" },
];
