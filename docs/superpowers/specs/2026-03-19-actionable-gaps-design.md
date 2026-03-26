# Actionable Gaps — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Scope:** Enrich the gap detection system so gaps become actionable — either as GitHub Issues (code problems) or as config-fix suggestions (config/prompt problems).

## Problem

Gaps detected by Claude during sessions are written to `_gaps/gaps.md` and remain a passive backlog. Nobody looks at them. Since OpenTidy is now open-source, code-related gaps should be surfaced as GitHub Issues where the community can pick them up.

## Design

### Classification

The post-session agent classifies each gap into one of three fix types:

| Fix type | Meaning | Action |
|----------|---------|--------|
| `code` | Problem in OpenTidy's source code | Create/update GitHub Issue |
| `config` | Problem in Claude's config/prompts | Create suggestion → user approves → dossier |
| `external` | External limitation (third-party access, etc.) | No action — passive gap |

### Sanitization

Since the repo and issues are public, every gap destined for GitHub must be sanitized by the post-session agent:

- Remove all PII: names, emails, phone numbers, account IDs, company names
- Remove all context linking to specific dossiers or personal admin tasks
- Keep only the generic technical problem description
- If the gap cannot be described without PII → classify as `external`, no issue created

**Defense-in-depth:** Before creating a GitHub issue, the backend runs a lightweight PII regex check on `sanitizedTitle` and `sanitizedBody` (email patterns, phone numbers, common PII formats). If matches are found, the issue is NOT created and an error is logged. This catches obvious prompt failures without replacing the prompt-based sanitization.

### Data Model Changes

`Amelioration` type in `packages/shared/src/types.ts` gains:

```typescript
type AmeliorationFixType = 'code' | 'config' | 'external';

interface Amelioration {
  // ... existing fields
  fixType?: AmeliorationFixType;
  sanitizedTitle?: string;
  sanitizedBody?: string;
  githubIssueNumber?: number;
  suggestionSlug?: string;
}
```

`AmeliorationFixType` is a named type (SSOT), consistent with existing `AmeliorationStatus`, `AmeliorationSource`, `AmeliorationCategory`.

Zod schema in `packages/shared/src/schemas.ts`:

```typescript
const AmeliorationFixTypeSchema = z.enum(['code', 'config', 'external']);
```

Config type in `packages/shared/src/types.ts`:

```typescript
interface OpenTidyConfig {
  // ... existing fields
  github?: {
    token: string;
    owner?: string;  // defaults to 'opentidy'
    repo?: string;   // defaults to 'opentidy'
  };
}
```

`gaps.md` structured format gains:

```markdown
**Fix type:** code
**Sanitized:** Cannot authenticate on portals requiring MFA TOTP.
**GitHub Issue:** #42
```

### Post-Session Agent Changes

Location: `features/memory/agents.ts` (`buildExtractionPrompt` / `runExtraction`)

The current architecture: the post-session agent (memory extraction) uses `claude -p` with tools (`Read`, `Write`, `Glob`, `Grep`). Claude writes gaps **directly to `_gaps/gaps.md`** as markdown — it does NOT return structured JSON. This design preserves that pattern.

**Changes to the extraction prompt** (`buildExtractionPrompt`):

The Mission 2 (gaps analysis) section is extended. Claude is instructed to write each gap with the new fields:

```markdown
**Fix type:** code|config|external
**Sanitized:** <PII-free one-line technical summary — ONLY if fixType is code>
```

Rules injected into the prompt:
- `code`: the problem is in OpenTidy's source code (a bug, missing feature, architectural limitation)
- `config`: the problem is in Claude's configuration, prompts, or workspace setup
- `external`: the problem is an external limitation (third-party access, API restrictions, physical constraints)
- `Sanitized` field must contain ZERO PII — no names, emails, phone numbers, account IDs, company names, dossier-specific context. Only the generic technical problem.
- If a gap cannot be described without PII → set `fixType: external`, omit `Sanitized`

**Post-write routing** (in `runExtraction`, after Claude finishes):

1. Backend re-reads `_gaps/gaps.md` using the existing parser
2. For each gap with new fields (no `githubIssueNumber` yet):
   - `fixType === 'code'` → call GitHub Issue module
   - `fixType === 'config'` → call SuggestionsManager
   - `fixType === 'external'` → no action
3. On success, write back `githubIssueNumber` or `suggestionSlug` to the gap entry

No new `ClaudeProcessType` needed — this runs within the existing `memory-extraction` process.

### GitHub Issue Module

New file: `features/ameliorations/github-issue.ts`

```typescript
function createGitHubIssueManager(deps: { config: Config }) {
  return {
    findExistingIssue(sanitizedTitle: string): Promise<GitHubIssue | null>,
    createIssue(gap: SanitizedGap): Promise<number>,
    commentOnIssue(issueNumber: number, comment: string): Promise<void>,
    containsPII(text: string): boolean,
  }
}
```

**Dedup flow:**
1. Backend fetches open issues with label `auto-gap` via `fetch()`: `GET /repos/{owner}/{repo}/issues?labels=auto-gap&state=open`
2. The list of existing issue titles + numbers is injected into the extraction prompt so Claude can decide during gap writing whether there's a match and reference the issue number
3. Match found + new info → backend adds comment to existing issue
4. Match found + nothing new → do nothing
5. No match → create new issue

**Issue format:**
```markdown
Title: MFA TOTP authentication not supported
Labels: auto-gap, category:capability
Body:
**Problem:** Cannot authenticate on portals requiring MFA TOTP.
**Impact:** Dossiers involving these portals cannot be processed automatically.
**Suggested fix:** Add TOTP code generation capability via MCP tool or library.

---
*Automatically created by OpenTidy from gap detection.*
*Source: post-session | Date: 2026-03-14*
```

No `[auto-gap]` prefix in title — the `auto-gap` label is sufficient for filtering.

**Auth:** GitHub token stored in `~/.config/opentidy/config.json` under `github.token`. Configured during `opentidy setup` (optional step). `owner` and `repo` are configurable with defaults (`opentidy`/`opentidy`).

**No `gh` CLI dependency** — all calls via `fetch` to `https://api.github.com`.

**Graceful degradation:** No token configured → gap written to `gaps.md` normally, no issue created. Log: `[ameliorations] No GitHub token configured, skipping issue creation`.

**Error handling:** The gap is ALWAYS written to `gaps.md` first, before any GitHub API call. Issue creation is best-effort:
- Network error, 401, 403, 422 → logged with `[ameliorations]` prefix, gap remains without `githubIssueNumber`
- No retry on failure — the gap is recorded locally regardless
- PII check failure → logged as error, issue NOT created

### Config Fix → Suggestion (Existing Flow)

When `fixType === 'config'`:

1. Check `suggestionsManager.isDuplicateSuggestion(title)` (exact case-insensitive match — acceptable for MVP)
2. If no duplicate → write `.md` file to `_suggestions/` with `source: "post-session"`
3. Update gap in `gaps.md` with `suggestionSlug`
4. User approves from web UI → dossier created → Claude fixes its config

No new code needed for this path — reuses existing suggestion infrastructure.

### Gap Write-Back

After GitHub issue creation or suggestion creation, the backend writes back to `gaps.md`:

- `githubIssueNumber` → `**GitHub Issue:** #42`
- `suggestionSlug` → `**Suggestion:** slug-name`

This requires a new method in `gaps.ts`: `updateGapFields(index, fields)` — finds the gap by index in the structured format and appends/updates the field lines.

## What Changes

| Component | Change |
|-----------|--------|
| `packages/shared/src/types.ts` | `AmeliorationFixType` type + 5 new fields on `Amelioration` + `github` on `OpenTidyConfig` |
| `packages/shared/src/schemas.ts` | `AmeliorationFixTypeSchema` |
| `features/ameliorations/gaps.ts` | Parse/write new fields + `updateGapFields()` method |
| `features/memory/agents.ts` | Extended extraction prompt (Mission 2) + post-write routing |
| `features/ameliorations/github-issue.ts` | **New file** — GitHub API integration + PII check |
| `shared/config.ts` | Read `github.token`/`owner`/`repo` from config |
| `cli/setup.ts` | Optional GitHub token setup step |

## What Does NOT Change

- `gaps.md` format (additive — new fields, backward compatible)
- Suggestion flow (reused as-is)
- Checkup sweep (not involved)
- Frontend (no UI changes in MVP)
- Legacy bullet format support (still parsed, just won't have new fields)
- `features/sessions/post-session.ts` (session cleanup only — not the extraction agent)

## Testing Strategy

- **Unit tests** for `github-issue.ts`: mock `fetch`, test create/find/comment/PII-check flows
- **Unit tests** for extended `gaps.ts` parser: verify new fields are read/written correctly, test `updateGapFields()`
- **Unit tests** for post-write routing in `agents.ts`: verify `code` → GitHub, `config` → suggestion, `external` → noop
- **Integration test**: full extraction flow with mocked Claude output and mocked GitHub API
- **PII defense test**: verify `containsPII()` catches email/phone patterns
- **Edge cases**: no GitHub token, duplicate issue detection, GitHub API failures, malformed gap fields

## Security Considerations

- GitHub token stored in `~/.config/opentidy/config.json` (gitignored), never in repo
- Sanitization is critical — the extraction prompt must be explicit about PII removal
- Defense-in-depth: `containsPII()` regex check before any GitHub API call
- `owner`/`repo` configurable with safe defaults — prevents accidental issue creation on wrong repo
- Rate limiting: GitHub API has 5000 req/h for authenticated users — not a concern for gap frequency
- Error handling: all failures are logged, never silently swallowed, never block gap writing
