# UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the OpenTidy web app with a "Soft Dark" design language — warm charcoal palette, spacious layout, polished components. No feature changes.

**Architecture:** Pure CSS/JSX changes across ~45 files. Phase 1 swaps the color palette (instant change via Tailwind @theme). Phase 2 redesigns layout/nav. Phase 3-5 restyle each page. All TypeScript logic, state management, routing, and i18n stay untouched.

**Tech Stack:** React 19, Tailwind CSS v4 (CSS-first @theme), Inter font (Google Fonts), existing component structure.

**Spec:** `docs/superpowers/specs/2026-03-21-ux-redesign-design.md`

---

## File Structure

### Modified files (no new files created)

| File | Responsibility |
|------|---------------|
| `apps/web/index.html` | Add Inter font `<link>` |
| `apps/web/src/index.css` | New `@theme` block (Soft Dark palette) |
| `apps/web/src/shared/Layout.tsx` | Root layout flex structure |
| `apps/web/src/shared/DesktopNav.tsx` | Labeled sidebar with icons |
| `apps/web/src/shared/MobileNav.tsx` | Bottom tab bar with FAB |
| `apps/web/src/shared/NavIcon.tsx` | Updated SVG icon set |
| `apps/web/src/shared/ErrorBanner.tsx` | Restyled error banner |
| `apps/web/src/shared/HelpTooltip.tsx` | Restyled tooltip |
| `apps/web/src/shared/InstructionBar.tsx` | Restyled instruction bar |
| `apps/web/src/shared/SuggestionCard.tsx` | Restyled suggestion card |
| `apps/web/src/shared/ModuleList.tsx` | Restyled module list |
| `apps/web/src/shared/TerminalDrawer.tsx` | Restyled terminal drawer |
| `apps/web/src/shared/TtydTerminal.tsx` | Restyled ttyd bridge |
| `apps/web/src/features/home/Home.tsx` | Restyled home page sections |
| `apps/web/src/features/home/WelcomeCard.tsx` | Restyled welcome card |
| `apps/web/src/features/tasks/TaskCard.tsx` | Restyled task card |
| `apps/web/src/features/tasks/TaskDetail.tsx` | Restyled split panel detail |
| `apps/web/src/features/tasks/StateRenderer.tsx` | Restyled markdown rendering |
| `apps/web/src/features/tasks/Sidebar.tsx` | Restyled task sidebar |
| `apps/web/src/features/nouveau/Nouveau.tsx` | Restyled new task page |
| `apps/web/src/features/nouveau/ExampleChips.tsx` | Restyled example chips |
| `apps/web/src/features/terminal/Terminal.tsx` | Restyled processes page |
| `apps/web/src/features/terminal/ProcessOutput.tsx` | Restyled process output |
| `apps/web/src/features/terminal/PlainTextOutput.tsx` | Restyled plain text output |
| `apps/web/src/features/terminal/LiveProcessOutput.tsx` | Restyled live process output |
| `apps/web/src/features/sessions/SessionOutput.tsx` | Restyled session output |
| `apps/web/src/features/sessions/SessionCard.tsx` | Restyled session card |
| `apps/web/src/features/memory/Memory.tsx` | Restyled memory page |
| `apps/web/src/features/ameliorations/Ameliorations.tsx` | Restyled filter tabs |
| `apps/web/src/features/ameliorations/AmeliorationCard.tsx` | Restyled improvement card |
| `apps/web/src/features/suggestions/Suggestions.tsx` | Restyled suggestions page |
| `apps/web/src/features/schedule/SchedulePage.tsx` | Restyled schedule grid |
| `apps/web/src/features/modules/ModulesPage.tsx` | Restyled modules wrapper |
| `apps/web/src/features/settings/ModuleCard.tsx` | Restyled module card |
| `apps/web/src/features/settings/Settings.tsx` | Restyled settings wrapper |
| `apps/web/src/features/settings/SecurityPanel.tsx` | Restyled security panel |
| `apps/web/src/features/settings/ServiceControlPanel.tsx` | Restyled service panel |
| `apps/web/src/features/settings/DangerZonePanel.tsx` | Restyled danger zone |
| `apps/web/src/features/settings/AgentsPanel.tsx` | Restyled agents panel |
| `apps/web/src/features/settings/ModulesPanel.tsx` | Restyled modules panel |
| `apps/web/src/features/settings/AddModuleDialog.tsx` | Restyled add module dialog |
| `apps/web/src/features/settings/ModuleConfigDialog.tsx` | Restyled module config dialog |
| `apps/web/src/features/setup/SetupWizard.tsx` | Restyled wizard shell |
| `apps/web/src/features/setup/UserInfoStep.tsx` | Restyled user info step |
| `apps/web/src/features/setup/AgentStep.tsx` | Restyled agent step |
| `apps/web/src/features/setup/PermissionsStep.tsx` | Restyled permissions step |
| `apps/web/src/features/setup/ModulesStep.tsx` | Restyled modules step |
| `apps/web/src/features/setup/DoneStep.tsx` | Restyled done step |
| `apps/web/src/shared/utils/status-colors.ts` | Updated color mappings |

---

## Task 1: Foundation — Palette & Font

**Files:**
- Modify: `apps/web/index.html`
- Modify: `apps/web/src/index.css`

- [ ] **Step 1: Add Inter font to index.html**

Add before `</head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Replace @theme block in index.css**

Replace the entire `@theme { ... }` block with:
```css
@theme {
  --color-bg:              #141416;
  --color-surface:         #1c1c1e;
  --color-card:            #2c2c2e;
  --color-card-hover:      #3a3a3c;
  --color-border:          #38383a;
  --color-border-subtle:   #2c2c2e;

  --color-accent:          #0a84ff;
  --color-green:           #30d158;
  --color-red:             #ff453a;
  --color-orange:          #ff9f0a;
  --color-purple:          #bf5af2;

  --color-text:            #f5f5f7;
  --color-text-secondary:  #86868b;
  --color-text-tertiary:   #636366;
}
```

Update body font-family to:
```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

Note: `--color-surface` and `--color-border-subtle` are **new** variables (not in current theme). They enable `bg-surface` and `border-border-subtle` Tailwind utilities once added to `@theme`.

- [ ] **Step 3: Verify visually**

Run: `pnpm --filter @opentidy/web dev`

Open http://localhost:5173. The entire app should now show the new Soft Dark palette — warmer charcoal tones instead of cold blue-blacks. Verify:
- Background is warm dark (#141416), not blue-black
- Cards are #2c2c2e
- Text is #f5f5f7
- Accent blue is now iOS-style #0a84ff
- Inter font is loaded (check Network tab for fonts.googleapis.com)

- [ ] **Step 4: Commit**

```bash
git add apps/web/index.html apps/web/src/index.css
git commit -m "refactor(web): apply Soft Dark palette and Inter font"
```

---

## Task 2: Status Colors Utility

**Files:**
- Modify: `apps/web/src/shared/utils/status-colors.ts`

- [ ] **Step 1: Read current status-colors.ts and understand the mapping**

The file maps job/session statuses to Tailwind color classes. Update all color references to match the new palette. Key changes:
- Replace any hardcoded hex colors with theme variables
- Ensure status dot shadows use the new green (#30d158), orange (#ff9f0a), accent (#0a84ff)
- Keep the same export interface

- [ ] **Step 2: Update the color mappings**

Update dot colors, badge backgrounds, and text colors to use the Soft Dark palette classes. Example changes:
- `bg-green-500` → `bg-green`
- `text-green-400` → `text-green`
- `bg-orange-500` → `bg-orange`
- Any `bg-blue-500` → `bg-accent`

- [ ] **Step 3: Verify**

Check Home page — status dots and badges on task cards should show correct colors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/shared/utils/status-colors.ts
git commit -m "refactor(web): update status color mappings for Soft Dark"
```

---

## Task 3: Layout Shell

**Files:**
- Modify: `apps/web/src/shared/Layout.tsx`

- [ ] **Step 1: Update Layout.tsx**

Change the root container and main content area styling:
- Root: `flex h-screen overflow-hidden bg-bg` (keep as-is, bg-bg now maps to #141416)
- Main content area: ensure it uses `bg-bg` background (the slightly darker page background)
- Mobile bottom padding: keep `pb-20 md:pb-0` for mobile tab bar clearance
- The layout structure itself doesn't change — just verify colors pass through correctly

- [ ] **Step 2: Verify**

App should render with new background color. Sidebar and content area both visible.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shared/Layout.tsx
git commit -m "refactor(web): update Layout shell for Soft Dark"
```

---

## Task 4: Desktop Navigation (Sidebar)

**Files:**
- Modify: `apps/web/src/shared/DesktopNav.tsx`
- Modify: `apps/web/src/shared/NavIcon.tsx`

- [ ] **Step 1: Redesign DesktopNav.tsx**

Full rewrite of the sidebar component. Key changes:

**Container:** Replace current dual-width (60px/220px) with fixed 200px labeled sidebar:
```
hidden md:flex flex-col w-[200px] bg-surface border-r border-border shrink-0
```

**Header:** Replace logo block with text:
```
text-[11px] font-semibold uppercase tracking-[0.15em] text-[#48484a] px-5 pt-4 pb-2
```
Content: "OpenTidy"

**Nav items:** Each item is a NavLink with icon + label:
```
flex items-center gap-2.5 px-3 py-2 mx-2 rounded-lg text-[13px] transition-colors
```
Active state: `bg-accent/[.08] text-text font-medium`
Inactive: `text-text-tertiary hover:text-text-secondary`

Remove the left accent bar indicator. Remove the icon-only collapsed state.

**Sections:** Two groups separated by `h-px bg-border-subtle mx-4 my-2`:
- Primary: Home, Suggestions, Schedule
- System: Terminal, Memory, Modules, Improvements

**Bottom (pinned):** Settings nav item + search hint bar:
```
bg-card rounded-lg mx-3 px-2.5 py-1.5 text-[11px] text-[#48484a] flex items-center gap-1.5
```
With magnifying glass icon + "Search" text + right-aligned "⌘K" hint.

**Counters:** Right-aligned on nav items that have counts (Suggestions, Memory):
```
text-[9px] bg-card text-[#48484a] px-1.5 rounded-full ml-auto
```

- [ ] **Step 2: Update NavIcon.tsx**

Update all SVG icons to be 16x16, stroke-width 1.5, consistent style. Keep the same icon names/props interface. Update paths for cleaner rendering at 16px.

- [ ] **Step 3: Verify visually**

Sidebar should be 200px wide, warm dark background (#1c1c1e), labeled items with icons, proper active/hover states. Check:
- Active route has blue-tinted background
- Hover shows color change
- Section dividers visible
- Search bar at bottom

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/shared/DesktopNav.tsx apps/web/src/shared/NavIcon.tsx
git commit -m "refactor(web): redesign desktop sidebar navigation"
```

---

## Task 5: Mobile Navigation

**Files:**
- Modify: `apps/web/src/shared/MobileNav.tsx`

- [ ] **Step 1: Redesign MobileNav.tsx**

Replace current bottom tab bar with new design:

**Container:**
```
md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border flex justify-around items-center h-16 z-50
```

**5 slots:** Home, Suggestions, [FAB], Memory, More

**Regular tabs:** Icon (20x20) + label (9px). Active = accent color, inactive = #48484a.

**FAB (center):**
```
w-9 h-9 bg-accent rounded-full shadow-[0_4px_12px_rgba(10,132,255,0.25)] flex items-center justify-center mt-[-16px]
```
Plus icon in white. Links to `/nouveau`.

**More tab:** Opens a state-managed bottom sheet (use existing Headless UI Dialog or a simple toggle div):
- Sheet: `fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl p-4 z-50` with backdrop `bg-black/50`
- Items: Terminal, Modules, Schedule, Settings, Improvements — same style as sidebar nav items
- Close on backdrop click or item click

**Badge on Suggestions:** Same pattern as current but with new colors.

- [ ] **Step 2: Verify on mobile viewport**

Use browser devtools responsive mode (375px width). Tab bar should show 5 items, FAB raised, More opens sheet.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shared/MobileNav.tsx
git commit -m "refactor(web): redesign mobile navigation with FAB"
```

---

## Task 6: Error Banner & Help Tooltip

**Files:**
- Modify: `apps/web/src/shared/ErrorBanner.tsx`
- Modify: `apps/web/src/shared/HelpTooltip.tsx`

- [ ] **Step 1: Restyle ErrorBanner**

Change to:
```
bg-red/10 border border-red/20 rounded-lg mx-4 mt-2 px-4 py-2 text-sm text-red flex items-center justify-between
```

- [ ] **Step 2: Restyle HelpTooltip**

Update button circle to use new tertiary colors. Tooltip bg to `bg-card`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shared/ErrorBanner.tsx apps/web/src/shared/HelpTooltip.tsx
git commit -m "refactor(web): restyle error banner and help tooltip"
```

---

## Task 7: Home Page

**Files:**
- Modify: `apps/web/src/features/home/Home.tsx`
- Modify: `apps/web/src/features/home/WelcomeCard.tsx`

- [ ] **Step 1: Restyle Home.tsx header**

Update the header row:
- Title: `text-xl font-bold text-text` (unchanged)
- Right controls: checkup status in `text-[9px] text-[#48484a]`, "Run checkup" as ghost button, "+ New task" as `bg-accent text-white font-semibold rounded-lg px-3.5 py-1.5 text-xs shadow-[0_2px_8px_rgba(10,132,255,0.2)]`

- [ ] **Step 2: Restyle Waiting For You section**

Update section header: orange pulsing dot (7px with shadow) + uppercase label + count.

Update waiting cards:
```
bg-card rounded-xl p-3.5 border-l-[3px] border-orange hover:bg-card-hover transition-colors cursor-pointer
```

Add icon container (32x32 rounded-lg with orange/10 background), task title, subtitle, "Open →" text.

- [ ] **Step 3: Restyle Waiting For Response section**

Same pattern as above but with accent color border and opacity-70.

- [ ] **Step 4: Restyle Tasks list section**

Update section header with "TASKS" label, filter pills, and search.

Filter pills: active = `bg-card text-text rounded-md px-2.5 py-0.5 text-[11px]`, inactive = `text-[#48484a] px-2.5 py-0.5 text-[11px]`.

Empty states: centered icon + text + CTA button.

- [ ] **Step 5: Restyle WelcomeCard.tsx**

Update card: `bg-card rounded-2xl p-5 md:p-6 border border-border-subtle`
Pillar cards: `bg-surface rounded-xl p-4 text-center`
Action buttons: primary + ghost styles.

- [ ] **Step 6: Verify visually**

Home page should show spacious layout with warm charcoal cards, proper waiting sections, styled filters. Check both desktop and mobile viewports.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/home/Home.tsx apps/web/src/features/home/WelcomeCard.tsx
git commit -m "refactor(web): redesign Home page with Soft Dark"
```

---

## Task 8: Task Card

**Files:**
- Modify: `apps/web/src/features/tasks/TaskCard.tsx`

- [ ] **Step 1: Restyle TaskCard**

Update card container:
```
bg-card rounded-xl p-3 cursor-pointer hover:bg-card-hover transition-colors duration-150
```
Completed: add `opacity-50`.

Status dot: `w-[7px] h-[7px] rounded-full` with color from status-colors + shadow for active dots.

Title: `text-sm font-medium text-text truncate`
Objective: `text-xs text-text-secondary mt-0.5 truncate`

Status badge: `text-[9px] px-1.5 py-0.5 rounded` with bg/text from status-colors.

Terminal indicator: `flex items-center gap-1 text-[9px] text-green` with 4px pulsing green dot.

Timestamp: `text-[9px] text-[#48484a]`

- [ ] **Step 2: Verify on Home page**

Task cards should render with new styling. Check active, waiting, and completed states.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/tasks/TaskCard.tsx
git commit -m "refactor(web): restyle TaskCard for Soft Dark"
```

---

## Task 9: Task Detail — Header & Split Panels

**Files:**
- Modify: `apps/web/src/features/tasks/TaskDetail.tsx`

- [ ] **Step 1: Restyle header bar**

```
px-4 py-2.5 border-b border-border flex items-center gap-2.5
```

Back button: `text-text-tertiary hover:text-text-secondary flex items-center gap-1 text-xs`
Title: `text-sm font-semibold text-text truncate`
Status: colored dot + text
Duration: `text-[10px] text-[#48484a] bg-card px-2 py-0.5 rounded`
Stop/Complete buttons: `bg-card text-text-secondary rounded-lg px-2.5 py-1 text-xs hover:text-red hover:border-red`

- [ ] **Step 2: Restyle split panel structure**

Left panel background: `bg-[#161618]`
Resize handle: `w-[3px] bg-surface hover:bg-accent transition-colors cursor-col-resize` with a small centered grip indicator.
Right panel (terminal area): `bg-[#0f0f11]` when active, `bg-surface` for empty state.

Terminal header bar: `px-3 py-1.5 border-b border-[#222224]` with green dot + "Session active" label.

Empty state: centered arrow icon (48px, `text-[#3a3a3c]`) + "No active session" text + action button.

- [ ] **Step 3: Verify**

Navigate to a task detail. Check split panels render, resize handle works, colors are correct. Check empty state when no session.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/tasks/TaskDetail.tsx
git commit -m "refactor(web): redesign TaskDetail header and split panels"
```

---

## Task 10: State Renderer

**Files:**
- Modify: `apps/web/src/features/tasks/StateRenderer.tsx`

- [ ] **Step 1: Restyle markdown rendering**

Update heading styles:
- `##` headers: `text-[10px] font-semibold uppercase tracking-wider text-[#48484a] mt-4 mb-1`
- `###` headers: `text-xs font-semibold text-text-secondary mt-3 mb-1`
- Body text: `text-xs text-text-secondary leading-relaxed`
- List items: `text-xs text-text-secondary` with `text-text-tertiary` bullet

Update structured rendering (fallback):
- Last action box: `rounded-xl p-3.5 bg-green/10 border border-green/20` (completed) or `bg-accent/10 border border-accent/20`
- Section headers: same uppercase label pattern
- File links: `text-accent text-[11px] hover:underline` with file icon SVG

- [ ] **Step 2: Verify**

Open a task detail with state.md content. Headings, lists, and file links should render in the new style.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/tasks/StateRenderer.tsx
git commit -m "refactor(web): restyle StateRenderer for Soft Dark"
```

---

## Task 11: Task Sidebar & Instruction Bar

**Files:**
- Modify: `apps/web/src/features/tasks/Sidebar.tsx`
- Modify: `apps/web/src/shared/InstructionBar.tsx`

- [ ] **Step 1: Restyle Sidebar.tsx**

Update container and section styles to match new palette. Session status, file links, action buttons.

- [ ] **Step 2: Restyle InstructionBar.tsx**

```
bg-surface border-t border-border px-3 py-2 flex gap-2 items-center
```
Input: `bg-card rounded-lg flex-1 px-3 py-2 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent`
File button: `w-7 h-7 bg-card rounded-md flex items-center justify-center text-text-tertiary hover:text-text-secondary`
Send button: `w-7 h-7 bg-accent rounded-md flex items-center justify-center disabled:opacity-40`

- [ ] **Step 3: Verify**

Check instruction bar at bottom of task detail. Input, upload button, send button all render correctly.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/tasks/Sidebar.tsx apps/web/src/shared/InstructionBar.tsx
git commit -m "refactor(web): restyle task Sidebar and InstructionBar"
```

---

## Task 12: Nouveau (New Task) Page

**Files:**
- Modify: `apps/web/src/features/nouveau/Nouveau.tsx`
- Modify: `apps/web/src/features/nouveau/ExampleChips.tsx`

- [ ] **Step 1: Restyle Nouveau page**

Container: `p-5 md:p-7 max-w-xl mx-auto`
Title: `text-xl font-bold text-text`
Textarea: `w-full bg-card rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-tertiary resize-none h-40 focus:outline-none focus:ring-1 focus:ring-accent border-none`
Confirm toggle: restyle label + switch
Example chips: `bg-card rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-card-hover cursor-pointer transition-colors`
Submit: `w-full bg-accent text-white font-semibold rounded-xl py-3 text-sm shadow-[0_2px_8px_rgba(10,132,255,0.2)] disabled:opacity-40`

Change green launch button → accent blue (the primary action color).

Add post-creation success banner: `bg-green/10 border border-green/20 rounded-xl p-4 text-sm text-green`

- [ ] **Step 2: Restyle ExampleChips.tsx**

Update chip styling: `bg-card rounded-lg px-3 py-1.5 text-xs text-text-secondary hover:bg-card-hover cursor-pointer transition-colors`

- [ ] **Step 3: Verify**

Navigate to /nouveau. Textarea, chips, and submit button should render with new style.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/nouveau/Nouveau.tsx apps/web/src/features/nouveau/ExampleChips.tsx
git commit -m "refactor(web): redesign Nouveau page for Soft Dark"
```

---

## Task 13: Terminal / Processes Page

**Files:**
- Modify: `apps/web/src/features/terminal/Terminal.tsx`
- Modify: `apps/web/src/features/terminal/ProcessOutput.tsx`
- Modify: `apps/web/src/features/terminal/PlainTextOutput.tsx`
- Modify: `apps/web/src/features/terminal/LiveProcessOutput.tsx`
- Modify: `apps/web/src/features/sessions/SessionOutput.tsx`
- Modify: `apps/web/src/features/sessions/SessionCard.tsx`
- Modify: `apps/web/src/shared/TtydTerminal.tsx`

- [ ] **Step 1: Restyle Terminal.tsx**

Update filter buttons: active = `bg-accent text-white px-2 py-0.5 rounded text-xs`, inactive = `text-text-tertiary px-2 py-0.5 rounded text-xs hover:text-text-secondary`

Process list items: `bg-card rounded-xl p-3.5` with status dot, type badge, timestamp.

Selected state: `bg-accent/[.08] ring-1 ring-accent/30`

Process output area: `bg-[#0f0f11] rounded-lg p-3 font-mono text-xs text-text-secondary max-h-64 overflow-y-auto mt-2`

- [ ] **Step 2: Restyle terminal sub-components**

Update `ProcessOutput.tsx`, `PlainTextOutput.tsx`, `LiveProcessOutput.tsx`:
- Output containers: `bg-[#0f0f11] rounded-lg p-3 font-mono text-xs text-text-secondary`
- Use monospace font stack: `font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace`
- Replace any hardcoded dark colors with theme equivalents

- [ ] **Step 3: Restyle SessionOutput.tsx and SessionCard.tsx**

SessionOutput: `bg-bg font-mono text-sm overflow-y-auto p-4`. Line styling: timestamp in tertiary, tool_use in accent.

SessionCard: Update card styling to match new palette — status dots, text colors, hover states.

- [ ] **Step 4: Restyle TtydTerminal.tsx**

Update any hardcoded background colors to `bg-[#0f0f11]`. Update border colors.

- [ ] **Step 5: Verify**

Navigate to /terminal. Process cards, filters, output areas, and session cards all styled correctly.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/terminal/ apps/web/src/features/sessions/ apps/web/src/shared/TtydTerminal.tsx
git commit -m "refactor(web): restyle Terminal, Sessions, and process outputs"
```

---

## Task 14: Suggestion Card & Suggestions Page

**Files:**
- Modify: `apps/web/src/shared/SuggestionCard.tsx`
- Modify: `apps/web/src/features/suggestions/Suggestions.tsx`

- [ ] **Step 1: Restyle SuggestionCard.tsx**

Card: `bg-card rounded-xl border-l-4 p-4` (border color by urgency: red/accent/text-tertiary)
Urgency dot: 7px with color from urgency map
Urgency badge: `text-[9px] px-1.5 py-0.5 rounded`
Source badge: `text-[9px] px-1.5 py-0.5 rounded bg-card-hover text-text-secondary`
Context expand: `bg-[#161618] rounded-lg p-3 text-xs text-text-secondary font-mono border border-border-subtle`
Buttons: "Create task" = primary button, "Ignore" = secondary button

- [ ] **Step 2: Restyle Suggestions.tsx**

Page container: `p-5 md:p-7`
Title + count badge: `text-xl font-bold text-text` with `text-[9px] px-2 py-0.5 rounded-full bg-accent/10 text-accent`
Empty state: "No suggestions — your inbox is clear"

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/shared/SuggestionCard.tsx apps/web/src/features/suggestions/Suggestions.tsx
git commit -m "refactor(web): restyle SuggestionCard and Suggestions page"
```

---

## Task 15: Memory Page

**Files:**
- Modify: `apps/web/src/features/memory/Memory.tsx`

- [ ] **Step 1: Restyle Memory.tsx**

Container: `p-5 md:p-7`
Title: `text-xl font-bold text-text`
Input/textarea: `w-full bg-card rounded-xl px-4 py-3 text-sm text-text placeholder:text-text-tertiary border-none focus:outline-none focus:ring-1 focus:ring-accent`
Table rows: `border-b border-border-subtle cursor-pointer hover:bg-card-hover transition-colors`
Category badge: `text-[9px] px-1.5 py-0.5 rounded-full bg-purple/10 text-purple`
Editor panel: `bg-card rounded-xl p-4 border border-border`
Buttons: primary pattern for Save, secondary for Cancel.

- [ ] **Step 2: Verify**

Navigate to /memory. Input area, memory list, and editor panel render correctly.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/memory/Memory.tsx
git commit -m "refactor(web): restyle Memory page for Soft Dark"
```

---

## Task 16: Ameliorations Page

**Files:**
- Modify: `apps/web/src/features/ameliorations/Ameliorations.tsx`
- Modify: `apps/web/src/features/ameliorations/AmeliorationCard.tsx`

- [ ] **Step 1: Restyle Ameliorations.tsx**

Container: `p-5 md:p-7`
Filter pills: same pattern as Home (active = bg-card text-text, inactive = text-dim)

- [ ] **Step 2: Restyle AmeliorationCard.tsx**

Card: `bg-card rounded-xl p-3.5 border-l-4` with category-based border color.

Category badge colors (update from current to new):
- capability: `bg-accent/10 text-accent`
- access: `bg-orange/10 text-orange`
- config: `bg-purple/10 text-purple`
- process: `bg-green/10 text-green`
- data: `bg-[#64d2ff]/10 text-[#64d2ff]`

Impact badge: high = `bg-red/10 text-red`, medium = `bg-orange/10 text-orange`, low = `bg-card text-text-tertiary`

Action buttons: secondary style.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/ameliorations/Ameliorations.tsx apps/web/src/features/ameliorations/AmeliorationCard.tsx
git commit -m "refactor(web): restyle Ameliorations page for Soft Dark"
```

---

## Task 17: Schedule Page

**Files:**
- Modify: `apps/web/src/features/schedule/SchedulePage.tsx`

- [ ] **Step 1: Restyle SchedulePage.tsx**

Update the calendar grid to use new palette:
- Grid borders: `border-border-subtle` instead of `border-white/[0.06]`
- Day headers background: `bg-bg`
- Active day circle: `bg-accent text-white`
- Time labels: `text-text-tertiary`
- Event buttons: keep left border colors (hash-based), update background to `bg-card hover:bg-card-hover`
- System schedule footer: `text-[10px] text-[#48484a]`

- [ ] **Step 2: Verify**

Navigate to /schedule. Calendar grid should use warm charcoal tones.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/schedule/SchedulePage.tsx
git commit -m "refactor(web): restyle Schedule page for Soft Dark"
```

---

## Task 18: Modules & Settings Pages

**Files:**
- Modify: `apps/web/src/features/modules/ModulesPage.tsx`
- Modify: `apps/web/src/features/settings/ModuleCard.tsx`
- Modify: `apps/web/src/shared/ModuleList.tsx`
- Modify: `apps/web/src/features/settings/Settings.tsx`
- Modify: `apps/web/src/features/settings/SecurityPanel.tsx`
- Modify: `apps/web/src/features/settings/ServiceControlPanel.tsx`
- Modify: `apps/web/src/features/settings/DangerZonePanel.tsx`
- Modify: `apps/web/src/features/settings/AgentsPanel.tsx`
- Modify: `apps/web/src/features/settings/ModulesPanel.tsx`
- Modify: `apps/web/src/features/settings/AddModuleDialog.tsx`
- Modify: `apps/web/src/features/settings/ModuleConfigDialog.tsx`
- Modify: `apps/web/src/shared/TerminalDrawer.tsx`

- [ ] **Step 1: Restyle ModulesPage.tsx**

Container: `p-5 md:p-7 space-y-6 overflow-y-auto h-full`
Section divider: `border-t border-border pt-6`

- [ ] **Step 2: Restyle ModuleCard.tsx**

Card: `flex items-center gap-4 px-4 py-3 rounded-xl transition-colors`
States: installed = `bg-card border border-border-subtle`, broken = `bg-red/5 border border-red/20`, disabled = `bg-surface border border-border-subtle opacity-60`
Install button: `bg-accent text-white rounded-lg px-3.5 py-1.5 text-xs font-medium`
Permission dropdown: `bg-card border border-border rounded-lg px-2 py-1.5 text-xs`

- [ ] **Step 3: Restyle ModuleList.tsx**

Preset buttons: active = `border-accent bg-accent/[.08] text-text`, inactive = `border-border bg-surface hover:bg-card text-text-secondary`
Section headers: standard uppercase label pattern.

- [ ] **Step 4: Restyle Settings.tsx and all sub-panels**

Same container as ModulesPage. Then restyle each sub-panel:
- `SecurityPanel.tsx`: Bearer token display, masked input, copy button — use `bg-card rounded-xl` grouped container
- `ServiceControlPanel.tsx`: Start/stop controls — secondary buttons
- `DangerZonePanel.tsx`: `bg-red/5 border border-red/10 rounded-xl p-4` with danger button
- `AgentsPanel.tsx`: Agent card + connection status — use `bg-card rounded-xl p-4`
- `ModulesPanel.tsx`: Module list wrapper — pass-through to ModuleList
- `AddModuleDialog.tsx`: Dialog inputs and buttons — `bg-surface rounded-2xl` overlay
- `ModuleConfigDialog.tsx`: Config form — same dialog pattern

- [ ] **Step 5: Restyle TerminalDrawer.tsx**

Update drawer background to `bg-surface` instead of hardcoded `#1a1a2e`.
Border: `border-l border-border`
Header: `border-b border-border`

- [ ] **Step 6: Verify**

Navigate to /modules and /settings. Cards, toggles, and settings sections render with new palette.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/modules/ModulesPage.tsx apps/web/src/features/settings/ apps/web/src/shared/ModuleList.tsx apps/web/src/shared/TerminalDrawer.tsx
git commit -m "refactor(web): restyle Modules, Settings, and TerminalDrawer"
```

---

## Task 19: Setup Wizard

**Files:**
- Modify: `apps/web/src/features/setup/SetupWizard.tsx`
- Modify: `apps/web/src/features/setup/UserInfoStep.tsx`
- Modify: `apps/web/src/features/setup/AgentStep.tsx`
- Modify: `apps/web/src/features/setup/PermissionsStep.tsx`
- Modify: `apps/web/src/features/setup/ModulesStep.tsx`
- Modify: `apps/web/src/features/setup/DoneStep.tsx`

- [ ] **Step 1: Restyle SetupWizard.tsx shell**

Background: `bg-bg` (passes through from theme)
Progress bar fill: `bg-accent`
Step dots: active = `bg-accent`, completed = `bg-green`, pending = `bg-[#3a3a3c]`

- [ ] **Step 2: Restyle all step components**

Common changes across all 4 steps:
- Form container: `mx-auto flex w-full max-w-md flex-col gap-6`
- Title: `text-xl font-bold text-text`
- Subtitle: `mt-1 text-text-secondary text-sm`
- Labels: `text-sm font-medium text-text`
- Inputs: `rounded-lg border border-border bg-card px-3 py-2 text-text placeholder:text-text-tertiary focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent`
- Primary button: `rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-40`
- Back button: `rounded-lg border border-border px-4 py-2.5 font-medium text-text-secondary hover:bg-card`

Step-specific:
- AgentStep: agent cards `bg-card rounded-xl border border-border p-4`, connected badge `text-green text-xs`
- PermissionsStep: granted state `border-green/30 bg-green/5`, step numbers `bg-accent/20 text-accent`
- DoneStep: success state with green accent, "Open OpenTidy" CTA as primary button
- Replace any `bg-bg-secondary` or `text-fg` / `text-fg-muted` references with the new theme variables (`bg-card`, `text-text`, `text-text-secondary`)

- [ ] **Step 3: Verify**

If possible, trigger the setup wizard (or temporarily visit /setup). Check all steps render correctly with new colors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/setup/
git commit -m "refactor(web): restyle Setup Wizard for Soft Dark"
```

---

## Task 20: Focus States & Loading Skeletons

**Files:**
- Modify: All interactive components (buttons, cards, links, inputs)

- [ ] **Step 1: Add focus-visible styles to interactive elements**

Add `focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg` to:
- All buttons (primary, secondary, ghost)
- All clickable cards (TaskCard, SuggestionCard, AmeliorationCard, waiting cards)
- All inputs and textareas
- All nav links

This can be done as a quick sweep through each file, adding the focus-visible utility classes.

- [ ] **Step 2: Add loading skeleton patterns**

Where `animate-pulse` placeholder loading is used (Home page, Memory, Suggestions), update skeleton styling to:
```
bg-card rounded-xl p-3.5 animate-pulse
```
With inner placeholder bars: `bg-[#3a3a3c] rounded h-3 w-*`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/
git commit -m "refactor(web): add focus-visible states and loading skeletons"
```

---

## Task 21: Final Polish Pass

**Files:**
- All previously modified files — review pass

- [ ] **Step 1: Audit remaining hardcoded colors**

Search for any remaining old palette references:
```bash
grep -rn '#0f1117\|#1a1d27\|#22252f\|#2a2d37\|#3b82f6\|#22c55e\|#ef4444\|#f59e0b\|#9ca3af\|#6b7280\|#f9fafb' apps/web/src/ --include='*.tsx' --include='*.ts'
```

Replace any remaining old palette colors with new theme variable equivalents. Some hardcoded hex values are intentional (like `#0f0f11` for terminal background) — leave those.

- [ ] **Step 2: Check all pages visually**

Navigate through every page on desktop (1440px) and mobile (375px):
- [ ] Home
- [ ] Task Detail (with active session and empty state)
- [ ] Nouveau
- [ ] Terminal
- [ ] Memory
- [ ] Suggestions
- [ ] Ameliorations
- [ ] Schedule
- [ ] Modules
- [ ] Settings
- [ ] Setup Wizard

For each, verify:
- Colors match Soft Dark palette
- No old blue-black tones remaining
- Hover states work
- Focus-visible rings show on Tab key navigation
- Empty states are styled
- Text is readable (contrast)

- [ ] **Step 3: Fix any broken tests**

```bash
pnpm test
```

If tests fail due to class name assertions or snapshot changes, update the test expectations. Then:

```bash
pnpm build
```

Ensure clean build.

- [ ] **Step 4: Final commit**

```bash
git add apps/web/src/
git commit -m "refactor(web): final polish pass for Soft Dark redesign"
```
