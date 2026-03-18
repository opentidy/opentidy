# Security

OpenTidy gives an AI agent access to your email, browser, and filesystem. This is powerful — and dangerous if unchecked. Security isn't an afterthought; it's the most critical component of the system.

## The problem

The most dangerous scenario isn't Claude refusing to act — it's Claude being **confident and wrong**. It won't trigger its own safeguards because it thinks everything is fine.

Key stats:
- If an agent has 85% accuracy per action, a 10-step workflow succeeds only 20% of the time (compounding errors)
- LLMs remain confident even when wrong (CMU 2025)
- RLHF makes this worse: 49.71% accuracy with 39.25% calibration error

**You cannot rely on the AI to police itself.** OpenTidy's security model is built on system-level enforcement that Claude cannot see, access, or bypass.

## PreToolUse hooks — the guardrail system

Claude Code has a built-in hook system: code that runs **automatically, at the system level**, before every tool call. This is not a prompt instruction. Claude doesn't call these hooks, can't skip them, and doesn't know they exist.

```
Claude decides: "I'll send this email"
    │
    ▼
Claude calls: gmail.send(...)
    │
    ▼
AUTOMATICALLY, BEFORE EXECUTION:
    → PreToolUse hook fires
    → Independent mini-Claude evaluates the action (separate context)
    → Decision: ALLOW / DENY / ASK
    │
    ├─ ALLOW → action executes
    ├─ DENY  → Claude gets "action refused: [reason]"
    └─ ASK   → user is notified and must approve
```

The `type: "prompt"` hook is a mini-Claude verifier with its own separate context. It is NOT the same session checking itself.

### Two types of hooks

| Type | Role | Blocking? |
|------|------|-----------|
| `type: "prompt"` | **Guardrails** — mini-Claude evaluates ALLOW/DENY/ASK | Yes |
| `type: "command"` | **Detection + audit** — notifies the backend | No |

Both can coexist on the same matcher and run in parallel.

### Hook configuration

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__gmail__send|mcp__gmail__reply|mcp__gmail__draft",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Verify this email action. Rules: never make payments without approval, check amount and recipient coherence, flag any anomaly.",
            "timeout": 30
          },
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:5175/api/hooks -d @-"
          }
        ]
      },
      {
        "matcher": "mcp__browser__click|mcp__browser__fill_form|mcp__browser__evaluate_js",
        "hooks": [
          {
            "type": "prompt",
            "prompt": "Verify this browser action. If it's a payment button, financial submission, or irreversible confirmation, DENY. Otherwise ALLOW.",
            "timeout": 10
          },
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:5175/api/hooks -d @-"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "mcp__gmail__|mcp__browser__",
        "hooks": [
          {
            "type": "command",
            "command": "curl -s -X POST http://localhost:5175/api/hooks -d @-"
          }
        ]
      }
    ]
  }
}
```

### Coverage

| Tool | Hook? | Timeout | Rationale |
|------|-------|---------|-----------|
| Email send/reply/draft | Yes (prompt) | 30s | Irreversible external actions |
| Browser click/fill_form | Yes (prompt) | 10s | Can trigger payments/submissions |
| Browser evaluate_js | Yes (prompt) | 10s | Arbitrary JS execution |
| Bash (network patterns) | Yes (command) | 10s | curl POST, ssh, scp = external actions |
| Email search/read | No | — | Read-only, zero risk |
| Browser navigate/snapshot | No | — | Navigation/reading, zero risk |
| Read/Grep/Glob/Write (local) | No | — | Local operations, zero risk |

### The four DNA rules

1. **Every irreversible action → human approval** (hook ASK)
2. **Every external action → verified before execution** (hook ALLOW/DENY)
3. **Every anomaly detected → flagged** (hook + notification)
4. **Everything is logged → repairable after the fact** (PostToolUse audit trail)

## `--dangerously-skip-permissions`

All Claude Code sessions run with `--dangerously-skip-permissions`. This disables Claude Code's built-in permission prompts — because security is enforced by PreToolUse hooks instead.

**Why not use the built-in permission system?**
- Built-in permissions are designed for interactive use (human approves each action)
- OpenTidy runs autonomously — there's no human at the keyboard
- PreToolUse hooks provide the same protection with more intelligence (a verifier Claude that understands context, not just "is this tool allowed?")
- Hooks fire BEFORE the permission check, so they remain active regardless

## Audit trail

Every external action is logged to `workspace/_audit/actions.log`. This includes:
- Tool name and parameters
- Hook decision (ALLOW/DENY/ASK)
- Timestamp
- Session and dossier ID

The audit trail is the ultimate safety net. Even if something slips through, it's logged and traceable.

## Authentication

### API authentication

All API endpoints require a bearer token: `Authorization: Bearer <token>`. The token is auto-generated during `opentidy setup` and stored in `~/.config/opentidy/config.json`.

Same-origin requests from the web SPA are exempt from bearer token auth (the SPA is served by the same backend).

### Claude Code isolation

OpenTidy sessions use a separate Claude Code configuration directory (`CLAUDE_CONFIG_DIR`). This means:
- OpenTidy's Claude sessions don't share your personal Claude Code settings, permissions, or history
- Auth credentials are isolated
- Hook configurations are isolated

### Remote access

When using Cloudflare Tunnel for remote access:
- All traffic goes through Cloudflare's network (encrypted)
- No ports opened on your router
- Bearer token required for all API calls
- Cloudflare Zero Trust can add additional authentication layers

## Honest limitations

1. **The mini-Claude can also be wrong.** But two independent Claudes making the same mistake is significantly less likely than one.

2. **Browser actions are the weakest point.** The `element` field helps a lot, but a "Submit" button doesn't always reveal what's being submitted.

3. **Browser hook latency** — ~10s per significant click. Acceptable for admin tasks that aren't time-sensitive.

4. **Prompt hooks use Claude context** — each hook verification costs tokens. Monitor usage if running many sessions.

5. **No system covers 100%.** The ultimate safety net is the audit trail + repairability. If something goes wrong, you can trace exactly what happened and undo it.

## Reporting vulnerabilities

See [SECURITY.md](../SECURITY.md) for our vulnerability reporting policy.

## Next steps

- [Architecture](architecture.md) — full system overview
- [Configuration](configuration.md) — hook configuration details
- [Specification](specification.md) — complete product specification
