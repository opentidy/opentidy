// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

interface TocItem {
  id: string;
  text: string;
  level: number;
}

function extractHeadings(content: string): TocItem[] {
  const headings: TocItem[] = [];
  const pattern = /^(#{2,3})\s+(.+)$/gm;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const text = match[2].trim();
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    headings.push({ id, text, level: match[1].length });
  }
  return headings;
}

export function TableOfContents({ content }: { content: string }) {
  const headings = extractHeadings(content);
  if (headings.length === 0) return null;

  return (
    <nav className="hidden w-56 shrink-0 xl:block">
      <div className="sticky top-24">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          On this page
        </h3>
        <ul className="space-y-1 text-sm">
          {headings.map((h) => (
            <li key={h.id} style={{ paddingLeft: `${(h.level - 2) * 12}px` }}>
              <a
                href={`#${h.id}`}
                className="block py-1 text-zinc-400 transition-colors hover:text-zinc-200"
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
