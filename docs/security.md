# Security

OpenTidy gives an AI agent access to your email, browser, and filesystem. This is powerful, and dangerous if unchecked. Security isn't an afterthought; it's the most critical component of the system.

## The problem

The most dangerous scenario isn't Claude refusing to act; it's Claude being **confident and wrong**. It won't trigger its own safeguards because it thinks everything is fine.

Key stats:
- If an agent has 85% accuracy per action, a 10-step workflow succeeds only 20% of the time (compounding errors)
- LLMs remain confident even when wrong (CMU 2025)
- RLHF makes this worse: 49.71% accuracy with 39.25% calibration error

**You cannot rely on the AI to police itself.** OpenTidy's security model is built on system-level enforcement that Claude cannot see, access, or bypass.

## Permission system: unified, module-agnostic

OpenTidy uses a deterministic, human-controlled permission system. No AI gatekeeping,
no hidden token costs. Each module declares its own tool risk levels, and the user
chooses how to handle them.

### How it works

Each module's manifest categorizes its tools as `safe` (read-only, no side effects)
or `critical` (has real-world consequences). The user chooses a permission level per
module: `allow`, `confirm`, or `ask`.

```
Agent calls: gmail.send(to: "client@acme.com", subject: "Invoice reminder")
    |
    v
PreToolUse hook fires (system-level, agent can't skip it)
    |
    v
Backend checks module manifest:
    -> gmail.send is "critical", user level is "confirm"
    -> AI one-shot summarizes the action in one sentence
    -> Notification sent to user:
      "Task 'Invoice follow-up' wants to send an email
       To: client@acme.com, Subject: Invoice reminder
       [Approve] [Deny]"
    |
    +- User approves -> hook exits 0 -> email sent
    +- User denies  -> hook exits 2 -> agent told "action denied"
```

### Three permission levels

| Level | Behavior | User presence |
|-------|----------|--------------|
| **`allow`** | Execute immediately, audit log only | Not needed |
| **`confirm`** | Notification + wait for user response | Phone only |
| **`ask`** | Native agent CLI prompt in the terminal | Must be watching |

`safe` tools always pass regardless of level. Only `critical` tools are subject to it.

### Presets

| Preset | Default level | Philosophy |
|--------|--------------|------------|
| **Supervised** | `ask` | User validates everything from the web terminal |
| **Autonomous** | `confirm` | Agent works freely, pings user for critical actions |
| **Full auto** | `allow` | Agent does everything, user reviews audit log after |

Presets pre-fill all modules. The user can override per module in settings.

### Scope

Modules declare a `scope` for their critical tools:
- **`per-call`**: confirm every time (email: each send is distinct)
- **`per-task`**: confirm once, then all actions pass for that task (browser: navigation is continuous)

### No `--dangerously-skip-permissions`

The old approach disabled all permission prompts via `--dangerously-skip-permissions`
and relied on `type: "prompt"` hooks (a mini-Claude verifier) for security.

**Problems with that approach:**
- AI judging AI, with the same biases and failure modes
- Hidden token cost on every sensitive tool call
- No user control; the AI decided ALLOW/DENY autonomously
- Fragile, since prompt-based rules are subjective ("suspicious recipient")

**New approach:** `--allowedTools` lists explicitly approved tools. `type: "command"`
hooks call the backend deterministically. The human always decides for `confirm`-level
tools. Zero AI in the decision loop.

## Audit trail

Every tool call is logged via PostToolUse hooks. This includes:
- Tool name and parameters
- Permission decision (auto-allowed / user-approved / user-denied)
- Timestamp
- Session and task ID

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

1. **`per-task` scope trades granularity for usability.** Once browser is approved for a task, all browser actions pass. The audit trail catches unexpected navigation after the fact.

2. **`ask` mode requires presence.** Only works if the user is watching the web terminal. For background sessions, use `confirm` or `allow`.

3. **Module manifest trust.** The system trusts modules to correctly categorize their tools as `safe` or `critical`. A module that marks a dangerous tool as `safe` bypasses confirmation.

4. **AI summarizes, doesn't decide.** The one-shot summary for notifications costs tokens, but only fires for `confirm`-level critical tools, not for safe tools or `allow`-level modules.

5. **No system covers 100%.** The ultimate safety net is the audit trail + repairability. If something goes wrong, you can trace exactly what happened and undo it.

## Reporting vulnerabilities

See [SECURITY.md](../SECURITY.md) for our vulnerability reporting policy.

## Next steps

- [Architecture](architecture.md): full system overview
- [Configuration](configuration.md): hook configuration details
- [Specification](specification.md): complete product specification
