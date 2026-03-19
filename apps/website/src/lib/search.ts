// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import FlexSearch from "flexsearch";

export interface SearchEntry {
  slug: string;
  title: string;
  content: string;
}

let index: FlexSearch.Index | null = null;
let entries: SearchEntry[] = [];

export async function loadSearchIndex() {
  if (index) return;
  const res = await fetch("/search-index.json");
  entries = await res.json();
  index = new FlexSearch.Index({ tokenize: "forward" });
  entries.forEach((entry: SearchEntry, i: number) => {
    index!.add(i, `${entry.title} ${entry.content}`);
  });
}

export function search(query: string): SearchEntry[] {
  if (!index) return [];
  const results = index.search(query, { limit: 10 });
  return (results as number[]).map((i) => entries[i]);
}
