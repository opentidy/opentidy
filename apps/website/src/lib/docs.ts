// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docsNav } from "./docs-nav";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, "../../../../docs");

export interface DocPage {
  slug: string;
  title: string;
  content: string;
}

/** Get all doc slugs that are in the nav config */
export function getDocSlugs(): string[] {
  return docsNav.map((item) => item.slug);
}

/** Read a single doc by slug */
export function getDoc(slug: string): DocPage | null {
  const filePath = path.join(DOCS_DIR, `${slug}.md`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, "utf-8");
  const title = extractTitle(raw, slug);
  return { slug, title, content: raw };
}

/** Get all docs in nav order */
export function getAllDocs(): DocPage[] {
  return getDocSlugs()
    .map(getDoc)
    .filter((doc): doc is DocPage => doc !== null);
}

/** Extract title from first # heading, fallback to slug */
function extractTitle(content: string, slug: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : slug;
}
