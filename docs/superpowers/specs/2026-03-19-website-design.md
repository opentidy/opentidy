# Design: opentidy.ai Website

**Date**: 2026-03-19
**Status**: Approved

## Overview

New `apps/website/` package in the monorepo. Next.js 15 static export deployed to GitHub Pages on custom domain `opentidy.ai`. Documentation Markdown files from `docs/` are the single source of truth — rendered as HTML for humans and served as raw `.md` for LLMs.

## Domains

- **opentidy.ai** — primary domain, hosts the site
- **opentidy.com** — DNS redirect to opentidy.ai

## Structure

```
apps/website/
├── scripts/
│   └── build-docs.ts             # Prebuild: copies docs to public/, generates llms.txt + llms-full.txt
├── src/app/
│   ├── page.tsx                   # Landing page (modern/polish)
│   ├── docs/[...slug]/page.tsx    # Doc pages rendered from docs/
│   └── not-found.tsx              # Custom 404 page
├── src/components/                # UI components (hero, features, footer…)
├── src/lib/
│   └── docs.ts                    # Reads docs/*.md, derives title from first # heading
├── next.config.ts                 # output: 'export', images: { unoptimized: true }
├── postcss.config.ts              # @tailwindcss/postcss
└── package.json
```

## Landing Page

Single-page, modern/polish design:

- **Hero** — tagline ("Your personal AI assistant that actually does the work.") + CTA buttons (Quick Start / GitHub)
- **What makes it different** — 5 differentiators from README with visual treatment
- **Architecture diagram** — the ASCII flow from README as a polished SVG/graphic (standard `<img>`, no next/image optimization)
- **Quick Start** — `brew install` in 3 lines
- **Footer** — GitHub link, license info, documentation links

## Documentation

- **Source**: top-level `docs/*.md` only (getting-started, architecture, security, configuration, contributing). Subdirectories (`design/`, `plans/`, `reports/`, `superpowers/`) are internal and excluded.
- **Metadata**: derived from the file — title from the first `#` heading, slug from the filename. No frontmatter required. Page ordering defined in a `docs-nav.ts` config array.
- **Build**: Next.js `generateStaticParams()` reads files at build time, renders as HTML with syntax highlighting + auto-generated sidebar
- **Rendering**: `next-mdx-remote/rsc` (App Router compatible, docs live outside the app directory)
- **Navigation**: sidebar generated from `docs-nav.ts` ordering, table of contents per page
- **Search**: client-side FlexSearch, index generated at build. Large docs (>30KB) truncated in the search index to keep bundle size reasonable.
- **`specification.md`**: excluded from the public site — it's an internal engineering document. The public docs (architecture, security, getting-started) cover what users need.

## LLM Integration

Following the [llms.txt standard](https://llmstxt.org/):

- **`/llms.txt`** — structured index: project title, description, list of all doc pages with URLs to raw `.md` files
- **`/llms-full.txt`** — complete documentation concatenated into a single Markdown file (for LLMs that prefer full ingestion)
- **`/docs/[slug].md`** — each doc page served as raw Markdown (copied to `public/docs/` at build time by `scripts/build-docs.ts`)

All three files are generated at build time by `scripts/build-docs.ts` (prebuild step), placed in `public/`. No route handlers needed — fully compatible with static export.

Flow: an LLM can `fetch('https://opentidy.ai/llms.txt')`, read the structure, then fetch individual pages or everything via `llms-full.txt`.

## Deployment

- **GitHub Actions**: new `website.yml` workflow (separate from `release.yml`), triggered on push to `main` with path filter (`docs/**`, `apps/website/**`). Builds `apps/website/`, deploys to `gh-pages` branch.
- **Custom domain**: `opentidy.ai` via CNAME file in build output
- **Redirect**: `opentidy.com` → `opentidy.ai` via DNS CNAME or Cloudflare redirect rule

## Tech Stack

- Next.js 15 (static export, `output: 'export'`)
- Tailwind CSS v4 (CSS-first config via `@import "tailwindcss"` in globals.css + `@tailwindcss/postcss`)
- `next-mdx-remote/rsc` for Markdown rendering
- FlexSearch for client-side search
- No dependency on `@opentidy/shared` (no Zod schemas or shared types needed)
- No CMS, no database, no server

## Design Principles

- **Single source of truth**: docs live in `docs/`, the site consumes them. No duplication.
- **LLM-maintainable**: an LLM can update docs by editing Markdown files in the repo — the site rebuilds automatically.
- **LLM-consumable**: `llms.txt` + raw Markdown endpoints for AI agent ingestion.
- **Zero runtime cost**: fully static, GitHub Pages, no serverless functions needed.
- **No frontmatter coupling**: docs remain plain Markdown, metadata derived from content and filename.
