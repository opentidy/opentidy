// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { docsNav } from "../src/lib/docs-nav";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR = path.resolve(__dirname, "../../../docs");
const PUBLIC_DIR = path.resolve(__dirname, "../public");
const PUBLIC_DOCS = path.join(PUBLIC_DIR, "docs");
const SITE_URL = "https://opentidy.ai";

const INCLUDED_SLUGS = docsNav.map((item) => item.slug);

function main() {
  fs.mkdirSync(PUBLIC_DOCS, { recursive: true });

  const docs: { slug: string; title: string; content: string }[] = [];

  for (const slug of INCLUDED_SLUGS) {
    const srcPath = path.join(DOCS_DIR, `${slug}.md`);
    if (!fs.existsSync(srcPath)) {
      console.warn(`[build-docs] WARNING: ${srcPath} not found, skipping`);
      continue;
    }

    const content = fs.readFileSync(srcPath, "utf-8");
    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? slug;

    fs.copyFileSync(srcPath, path.join(PUBLIC_DOCS, `${slug}.md`));
    docs.push({ slug, title, content });
  }

  // Generate llms.txt
  const llmsTxt = [
    "# OpenTidy",
    "",
    "> Your personal AI assistant that actually does the work.",
    "> Open-source autonomous AI assistant that manages admin tasks 24/7.",
    "",
    "## Documentation",
    "",
    ...docs.map((d) => `- [${d.title}](${SITE_URL}/docs/${d.slug}.md)`),
    "",
    `## Full documentation: ${SITE_URL}/llms-full.txt`,
    "",
  ].join("\n");

  fs.writeFileSync(path.join(PUBLIC_DIR, "llms.txt"), llmsTxt);

  // Generate llms-full.txt (all docs concatenated)
  const llmsFullTxt = docs.map((d) => d.content).join("\n\n---\n\n");

  fs.writeFileSync(path.join(PUBLIC_DIR, "llms-full.txt"), llmsFullTxt);

  // Generate search index (truncate large docs for bundle size)
  const searchIndex = docs.map((d) => ({
    slug: d.slug,
    title: d.title,
    content: d.content.slice(0, 30_000).replace(/[#*`\[\]()]/g, " "),
  }));

  fs.writeFileSync(
    path.join(PUBLIC_DIR, "search-index.json"),
    JSON.stringify(searchIndex),
  );

  console.log(
    `[build-docs] Generated: ${docs.length} docs, llms.txt, llms-full.txt, search-index.json`,
  );
}

main();
