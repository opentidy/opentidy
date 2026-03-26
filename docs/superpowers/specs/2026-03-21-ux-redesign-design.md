# UX/Design Redesign — Specification

**Date:** 2026-03-21
**Status:** Draft
**Scope:** Full visual redesign of the OpenTidy web app — palette, typography, components, all pages

## Summary

Redesign the OpenTidy web app with a cohesive "Soft Dark" design language. No feature changes — purely visual/UX. The app should feel professional, modern, and polished. When people land on it, the reaction should be "this is serious software."

## Design Decisions (Validated)

- **Palette:** Soft Dark — warm charcoal (#1c1c1e), not cold blue-black. Inspired by Things 3 dark mode / Apple's dark UI.
- **Home layout:** Spacious — labeled sidebar, rounded cards, generous whitespace
- **Task Detail layout:** Split Panels — state.md left, terminal right, resize handle
- **Typography:** Inter (add via Google Fonts `<link>` in `index.html`)
- **Responsive:** Desktop + mobile equally important

---

## 1. Design System

### 1.1 Color Palette

Replace the current `@theme` block in `apps/web/src/index.css`:

```css
@theme {
  /* Surfaces */
  --color-bg:              #141416;   /* page background — slightly off-black */
  --color-surface:         #1c1c1e;   /* main surface (sidebar, panels) */
  --color-card:            #2c2c2e;   /* cards, inputs, containers */
  --color-card-hover:      #3a3a3c;   /* card hover state */
  --color-border:          #38383a;   /* default borders — visible against card bg */
  --color-border-subtle:   #2c2c2e;   /* subtle separators inside cards */

  /* Accent colors (iOS-inspired) */
  --color-accent:          #0a84ff;   /* primary blue — links, active nav, primary buttons */
  --color-green:           #30d158;   /* active, success, running */
  --color-red:             #ff453a;   /* danger, deny, stop */
  --color-orange:          #ff9f0a;   /* warning, waiting for user, blocked */
  --color-purple:          #bf5af2;   /* memory, secondary accent */

  /* Text hierarchy */
  --color-text:            #f5f5f7;   /* primary text — titles, important content */
  --color-text-secondary:  #86868b;   /* secondary — descriptions, metadata */
  --color-text-tertiary:   #636366;   /* tertiary — placeholders, disabled */
}
```

**Additional arbitrary colors** (used inline, not in @theme):
- `#48484a` — dim text (timestamps, section labels)
- `#3a3a3c` — ghost text (barely visible hints)
- `#161618` — darker panel background (state panel in task detail)
- `#0f0f11` — terminal background
- `#222224` — subtle row separators in lists

### 1.2 Typography

- **Font:** `'Inter', system-ui, -apple-system, sans-serif` — add `<link>` to `index.html`
- **Monospace:** `'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace` (terminal)
- **Scale:**
  - Page titles: `text-xl font-bold` (20px, 700)
  - Section headers: `text-[10px] font-semibold uppercase tracking-wider` (labels)
  - Card titles: `text-sm font-medium` (14px, 500)
  - Body text: `text-sm` (14px, 400) for descriptions, `text-xs` (12px) for metadata
  - Badges/tags: `text-[9px] font-medium`

### 1.3 Spacing

- **Page padding:** `p-5 md:p-7` (20px mobile, 28px desktop)
- **Card padding:** `p-3.5` (14px) standard, `p-4` (16px) for featured cards
- **Card gap:** `gap-1` (4px) for dense lists, `gap-2` (8px) for card lists
- **Section gap:** `mb-5` (20px) between sections
- **Card border-radius:** `rounded-xl` (12px) standard, `rounded-2xl` (16px) for featured

### 1.4 Component Patterns

#### Cards
```
Standard card:    bg-card rounded-xl p-3.5
Featured card:    bg-card rounded-xl p-3.5 border-l-[3px] border-orange
Hover:            hover:bg-card-hover transition-colors duration-150
Completed:        opacity-50
```

#### Buttons
```
Primary:   bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs
           shadow-[0_2px_8px_rgba(10,132,255,0.2)]
Secondary: bg-card text-text-secondary rounded-lg px-3.5 py-1.5 text-xs
Danger:    bg-card text-red hover:bg-red hover:text-white rounded-lg
Ghost:     text-text-tertiary hover:text-text-secondary
```

#### Status Dots
```
Active/running:     w-[7px] h-[7px] bg-green rounded-full shadow-[0_0_6px_rgba(48,209,88,0.4)]
Waiting for user:   w-[7px] h-[7px] bg-orange rounded-full shadow-[0_0_6px_rgba(255,159,10,0.4)] animate-pulse
Waiting for third:  w-[7px] h-[7px] bg-accent rounded-full
Completed:          w-[7px] h-[7px] bg-[#48484a] rounded-full
```

#### Status Badges
```
Active:    text-[9px] bg-green/10 text-green px-1.5 py-0.5 rounded
Waiting:   text-[9px] bg-orange/10 text-orange px-1.5 py-0.5 rounded
Done:      text-[9px] bg-card text-[#48484a] px-1.5 py-0.5 rounded
```

#### Section Headers
```html
<div class="flex items-center gap-1.5 mb-2.5">
  <!-- colored status dot -->
  <span class="text-[10px] font-semibold uppercase tracking-wider text-orange">
    Waiting for you
  </span>
  <span class="text-[10px] text-[#48484a] ml-1">1</span>
</div>
```

#### Input Fields
```
bg-card rounded-lg px-3 py-2 text-sm text-text placeholder:text-text-tertiary
focus:outline-none focus:ring-1 focus:ring-accent
```

### 1.5 Common States

**Loading:** Skeleton cards — `bg-card rounded-xl p-3.5 animate-pulse` with inner `bg-[#3a3a3c] rounded h-3 w-*` placeholder bars.

**Empty states:** Centered in content area:
- Icon: 48x48, `text-[#3a3a3c]`
- Title: `text-sm text-text-secondary`
- Description: `text-xs text-text-tertiary`
- Optional CTA: primary button

**Error banner:** Sticky top of main content:
- `bg-red/10 border border-red/20 rounded-lg px-4 py-2 text-sm text-red`
- Dismiss button on right

**Focus/keyboard:** All interactive elements get `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg`

---

## 2. Layout Structure

### 2.1 Desktop Layout

```
┌──────────────────────────────────────────────┐
│ ┌──────────┬────────────────────────────────┐ │
│ │ Sidebar  │ Main Content                    │ │
│ │ 200px    │ flex-1                          │ │
│ │          │                                 │ │
│ │ Logo     │ Page Title        [Actions]     │ │
│ │          │                                 │ │
│ │ ─ Nav ─  │ [Content sections]              │ │
│ │ Home     │                                 │ │
│ │ Suggest. │                                 │ │
│ │ Schedule │                                 │ │
│ │          │                                 │ │
│ │ ─System─ │                                 │ │
│ │ Terminal │                                 │ │
│ │ Memory   │                                 │ │
│ │ Modules  │                                 │ │
│ │ Improv.  │                                 │ │
│ │          │                                 │ │
│ │ Settings │                                 │ │
│ └──────────┴────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

**Sidebar** (`w-[200px]`, `bg-surface`, `border-r border-border`):
- **Header:** "OpenTidy" in `text-[11px] font-semibold uppercase tracking-[0.15em] text-[#48484a]`
- **Nav items:** `text-[13px]` with inline SVG icons (16x16, stroke-width 1.5)
  - Active: `text-text bg-accent/[.08] rounded-lg font-medium`
  - Inactive: `text-text-tertiary hover:text-text-secondary`
  - With counter: right-aligned `text-[9px] bg-card text-[#48484a] px-1.5 rounded-full`
- **Sections:** Separated by `h-px bg-border-subtle my-2`
  - Section 1 (Primary): Home, Suggestions, Schedule
  - Section 2 (System): Terminal, Memory, Modules, Improvements
  - Bottom (pinned): Settings
- **Footer:** Search bar `bg-card rounded-lg px-2.5 py-1.5 text-[11px] text-[#48484a]` with `⌘K` hint right-aligned. Search opens a command palette overlay (future feature — just the hint for now).

### 2.2 Mobile Layout

- **No sidebar** — bottom tab bar instead
- **Tab bar** (`bg-surface border-t border-border`):
  - 5 slots: Home, Suggestions, [+ FAB], Memory, More
  - FAB: `w-9 h-9 bg-accent rounded-full shadow-[0_4px_12px_rgba(10,132,255,0.25)]`, raised `mt-[-16px]`, `+` icon centered
  - Active tab: accent color icon + `text-[9px]` label
  - Inactive: `text-[#48484a]`
- **More menu:** Bottom sheet (`bg-surface rounded-t-2xl`) with remaining nav items (Terminal, Modules, Schedule, Settings, Improvements). Backdrop overlay `bg-black/50`. Slide up animation 200ms.
- **Page headers:** Sticky top with back button where needed

### 2.3 Navigation Icons

All icons: 16x16, `stroke="currentColor"`, `stroke-width="1.5"`, `fill="none"`.

| Page | Icon |
|------|------|
| Home | 4-square grid (2x2 rounded rects) |
| Suggestions | Checkmark path |
| Schedule | Circle with clock hands |
| Terminal | Terminal prompt rect |
| Memory | Person silhouette (circle head + body path) |
| Modules | Stacked blocks or puzzle |
| Improvements | Trending up arrow |
| Settings | Gear (circle + rays) |
| New task | Plus in circle |
| Search | Magnifying glass |

---

## 3. Pages

### 3.1 Home

**URL:** `/`

**Header row:**
- Left: Page title "Home" (`text-xl font-bold text-text`)
- Right: Checkup status (`text-[9px] text-[#48484a]`, e.g. "Checkup 5m ago"), "Run checkup" ghost button (hidden mobile), "+ New task" primary button

**Sections (top to bottom):**

1. **Welcome card** (conditional, first-run only)
   - `bg-card rounded-2xl p-5`
   - Title, description, 3 pillar cards in grid, action buttons
   - Same content as current, just restyled

2. **Waiting for you** (if any)
   - Section header: orange pulsing dot + "WAITING FOR YOU" uppercase label + count
   - Cards: `bg-card rounded-xl p-3.5 border-l-[3px] border-orange` with icon, task title, subtitle "Claude is waiting for your response", "Open →" text
   - Clickable → navigates to `/task/:id`

3. **Waiting for response** (if any)
   - Section header: accent dot + "WAITING FOR RESPONSE" uppercase label + count
   - Cards: same style but `border-l-[3px] border-accent`, `opacity-70`
   - Shows waiting details from task metadata

4. **Tasks list**
   - Header row: "TASKS" section label + filter pills ("Active 3" / "Done 12") + search input (desktop only)
   - Filter pills: active = `bg-card text-text rounded-md px-2.5 py-0.5`, inactive = `text-[#48484a] px-2.5 py-0.5`
   - Task cards (`TaskCard`): `bg-card rounded-xl p-3` with status dot, title, objective line, terminal indicator (green dot + "Terminal" text if active session), timestamp
   - Completed tasks: `opacity-50`
   - Empty state: icon + "No active tasks" + "Create your first task" CTA

### 3.2 Task Detail

**URL:** `/task/:id`

**Header bar** (`border-b border-border px-4 py-2.5`):
- Back button: `← Home` text link in `text-text-tertiary`
- Vertical divider: `w-px h-4 bg-border`
- Task title: `text-sm font-semibold text-text`
- Status: colored dot + status text
- Duration: `text-[10px] text-[#48484a] bg-card px-2 py-0.5 rounded`
- Actions (right): "Stop" and "Complete" secondary buttons

**Split panel layout** (desktop, using `react-resizable-panels`):
- Left panel: 25% default, min 200px
  - Background: `bg-[#161618]`
  - Padding: `p-3.5`
  - Content: StateRenderer output (markdown sections from state.md)
    - `## headers`: `text-[10px] font-semibold uppercase tracking-wider text-[#48484a] mb-1`
    - Body text: `text-xs text-text-secondary leading-relaxed`
    - List items: `text-xs text-text-secondary` with bullet
    - File links: `text-accent text-[11px]` with file SVG icon
  - Scrollable independently

- Resize handle: `w-[3px] bg-surface hover:bg-accent transition-colors cursor-col-resize` with centered grip dot

- Right panel: flex-1
  - **Active session:** Terminal view
    - Header bar: `border-b border-[#222224] px-3 py-1.5` with green dot + "Session active" label
    - Terminal: `bg-[#0f0f11]` full height, monospace font
  - **No session:** Empty state centered
    - Arrow icon (48px, `text-[#3a3a3c]`)
    - "No active session" text
    - Action button: "Start a session" or "Reopen task" (if completed)

**Mobile:**
- No split — stacked vertically
- State section on top (collapsible with chevron toggle)
- Terminal below (takes remaining viewport)

**Instruction bar** (sticky bottom, all viewports):
- `bg-surface border-t border-border px-3 py-2 flex gap-2 items-center`
- Text input: `bg-card rounded-lg flex-1 px-3 py-2 text-sm`
- File upload button: `w-7 h-7 bg-card rounded-md` with paperclip icon
- Send button: `w-7 h-7 bg-accent rounded-md` with arrow-up icon, `opacity-40` when disabled

### 3.3 Nouveau (New Task)

**URL:** `/nouveau`

**Layout:** Centered, `max-w-xl mx-auto`

- Page title: "New task"
- Instruction textarea: `bg-card rounded-xl p-4 text-sm min-h-32 w-full resize-none`
- Confirm mode toggle: `mt-3`, label + pill toggle
- Example chips: `mt-4 flex flex-wrap gap-2`, each `bg-card rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-card-hover cursor-pointer`
- File upload: attachment button inline
- Submit: `mt-4 w-full bg-accent text-white font-semibold rounded-xl py-3 text-sm disabled:opacity-40`
- Post-creation banner: `bg-green/10 border border-green/20 rounded-xl p-4 text-sm text-green`

### 3.4 Terminal (Processes)

**URL:** `/terminal`

- Title: "Processes"
- Filter pills: "Active", "Queue", "All"
- Process cards: `bg-card rounded-xl p-3.5`
  - Status dot + type label + task reference + status badge + timestamp
  - Click to expand: output in `bg-[#0f0f11] rounded-lg p-3 font-mono text-xs text-text-secondary max-h-64 overflow-y-auto mt-2`
- Empty state: "No processes running"

### 3.5 Memory

**URL:** `/memory`

- Input: `bg-card rounded-xl p-4` with placeholder + "Save" button
- List header: "Stored memories" + count
- Memory cards: `bg-card rounded-xl p-3.5`
  - Title + content preview (truncated)
  - Hover actions: Edit, Archive icons
  - Expand: full content in `bg-[#161618] rounded-lg p-3`
- Empty state: "No memories stored yet"

### 3.6 Suggestions

**URL:** `/suggestions`

- Title: "Suggestions" + count badge
- Cards: `bg-card rounded-xl p-4 border-l-4` (urgency color: red/accent/text-tertiary)
  - Title + urgency badge + source badge
  - Description, expandable original context
  - Actions: "Create task" primary + "Ignore" secondary
- Empty state: "No suggestions — your inbox is clear"

### 3.7 Modules

**URL:** `/modules`

- Title: "Modules"
- Module cards grid: `grid grid-cols-1 md:grid-cols-2 gap-3`
  - Each: `bg-card rounded-xl p-4` with icon, name, description, toggle, status dot
  - Configure expand: auth status, MCP servers, tool list
- Agent section: below modules, current agent + connection status
- Empty state: N/A (always shows available modules)

### 3.8 Improvements

**URL:** `/ameliorations`

- Title: "Improvements"
- Filter pills: "Open", "Resolved", "Ignored"
- Cards: `bg-card rounded-xl p-3.5`
  - Category badge colors: capability=#0a84ff, access=#ff9f0a, config=#bf5af2, process=#30d158, data=#64d2ff
  - Impact badge: high=red, medium=orange, low=text-tertiary
  - Actions: "Resolve" / "Ignore"
- Empty state: "No improvements detected yet"

### 3.9 Schedule

**URL:** `/schedule`

- Title: "Schedule"
- Event cards: `bg-card rounded-xl p-3.5`
  - Label + human-readable schedule + type badge + toggle + timestamps
- Create form: inline at top or expandable section
- Empty state: "No scheduled events"

### 3.10 Settings

**URL:** `/settings`

Grouped sections in `bg-card rounded-xl overflow-hidden`:
1. **Security**: Bearer token (masked + copy) — single row
2. **Service**: Start/stop status + restart button
3. **Agent**: Current agent + connection status
4. **Danger Zone**: `bg-red/5 border border-red/10 rounded-xl p-4` — Reset with confirmation

### 3.11 Setup Wizard

**URL:** `/setup`

- Centered `max-w-md`, step dots at top (5 dots, active = accent, done = green, pending = `#3a3a3c`)
- Each step: title + description + form + "Continue" primary + "Back" ghost
- Steps: User info → Agent → Permissions → Modules → Done

---

## 4. Animations & Transitions

Keep minimal — snappy, not bouncy.

- **Page transitions:** none (instant)
- **Card hover:** `transition-colors duration-150`
- **Status dot pulse:** `animate-pulse` on "waiting for user" only
- **Terminal output:** append only, auto-scroll
- **Panel resize:** real-time, no animation
- **Modal/dialog:** fade in 150ms via Headless UI
- **Tab switches:** instant content swap
- **Mobile bottom sheet:** slide up 200ms ease-out

---

## 5. Responsive Breakpoints

- **Mobile:** `< md` (< 768px) — bottom tab bar, stacked layouts, no sidebar, no split panels
- **Desktop:** `>= md` (>= 768px) — sidebar + main content, split panels in task detail

Key responsive changes:
- Home: sidebar → bottom tabs, search hidden, checkup button hidden
- Task Detail: split panels → stacked (state on top collapsible, terminal below)
- Nouveau: already centered, works on both
- All other pages: same structure, padding adjusts

---

## 6. Implementation Notes

### Files that change
- `apps/web/index.html` — add Inter font `<link>`
- `apps/web/src/index.css` — new `@theme` block (palette)
- `apps/web/src/shared/Layout.tsx` — sidebar + mobile nav structure
- `apps/web/src/shared/DesktopNav.tsx` — full redesign (labeled sidebar with icons)
- `apps/web/src/shared/MobileNav.tsx` — redesign with FAB button + bottom sheet
- `apps/web/src/shared/NavIcon.tsx` — update SVG icons
- `apps/web/src/shared/ErrorBanner.tsx` — restyle
- `apps/web/src/shared/InstructionBar.tsx` — restyle
- `apps/web/src/shared/SuggestionCard.tsx` — restyle
- `apps/web/src/features/home/Home.tsx` — restyle all sections
- `apps/web/src/features/home/WelcomeCard.tsx` — restyle
- `apps/web/src/features/tasks/TaskDetail.tsx` — restyle header, panels, instruction bar
- `apps/web/src/features/tasks/TaskCard.tsx` — restyle card
- `apps/web/src/features/tasks/StateRenderer.tsx` — restyle markdown rendering
- All other feature page components: restyle with new palette/components

### What doesn't change
- All TypeScript logic, state management, API calls
- Zustand store, SSE integration
- Routing, i18n keys
- Feature directory structure (VSA)

### Approach
1. Update `@theme` in index.css + add Inter font (instant palette change)
2. Redesign Layout + DesktopNav + MobileNav
3. Redesign Home page + TaskCard
4. Redesign TaskDetail page + StateRenderer + InstructionBar
5. Redesign remaining pages one by one
6. Polish: empty states, loading skeletons, hover states, focus states
