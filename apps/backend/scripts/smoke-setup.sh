#!/bin/bash
set -euo pipefail

FIXTURE_DIR="$(cd "$(dirname "$0")/.." && pwd)/fixtures/smoke-workspace"

echo "[smoke-setup] Creating fixture workspace at $FIXTURE_DIR"

# Clean existing
rm -rf "$FIXTURE_DIR"

# Create directory structure
mkdir -p "$FIXTURE_DIR/invoices-acme/artifacts"
mkdir -p "$FIXTURE_DIR/insurance-report"
mkdir -p "$FIXTURE_DIR/_suggestions"
mkdir -p "$FIXTURE_DIR/_gaps"
mkdir -p "$FIXTURE_DIR/_audit"

# --- invoices-acme/state.md ---
cat > "$FIXTURE_DIR/invoices-acme/state.md" << 'STATE'
# Invoices Acme Corp 2025-2026

## Objective
Generate and send monthly invoices to Acme Corp.

## Current State
STATUS: IN PROGRESS
Last action: 2026-03-13

## Completed
- Jan 2025: invoice #2025-001 sent on 02/05
- Feb 2025: invoice #2025-002 sent on 03/03
- Mar 2025: invoice #2025-003 sent on 04/04

## Remaining
- Apr 2025: timesheet found (152h), invoice to create
- May 2025: timesheet MISSING (email sent to client on 03/12)

## Waiting For
- Response from Acme Corp for May timesheet (follow up if no response by 03/16)

## Contacts
- Acme billing: billing@example-client.com

## Notes
- Rate: 80/h, currency EUR
- Invoice format: use accounting template

## Journal
- 2026-03-13: Follow-up sent to billing@example-client.com for May timesheet
- 2026-03-10: March invoice sent, confirmation received
STATE

# .gitkeep for artifacts
touch "$FIXTURE_DIR/invoices-acme/artifacts/.gitkeep"

# --- insurance-report/state.md (deadline soon) ---
DEADLINE=$(date -v+3d '+%Y-%m-%d' 2>/dev/null || date -d '+3 days' '+%Y-%m-%d')
cat > "$FIXTURE_DIR/insurance-report/state.md" << STATE
# Annual Insurance Report

## Objective
Fill and submit the annual activity report on the insurance portal.

## Current State
STATUS: IN PROGRESS
Last action: 2026-03-12
DEADLINE: $DEADLINE

## Completed
- Login to insurance portal successful
- Downloaded the PDF form

## Remaining
- Fill in revenue and headcount fields
- Upload supporting documents
- Submit before $DEADLINE deadline

## Waiting For
- Nothing

## Contacts
- Insurance support: support@example-insurance.com

## Journal
- 2026-03-12: Form downloaded, started filling
- 2026-03-10: First login, portal navigation
STATE

# --- _suggestions/tax-filing-followup.md ---
cat > "$FIXTURE_DIR/_suggestions/tax-filing-followup.md" << 'SUGGESTION'
# Suggestion: Tax Filing Follow-up

URGENCY: urgent
SOURCE: Email received from tax@example-authority.gov on 03/12
DATE: 2026-03-14

## Summary
Email from tax authority received 2 weeks ago, no response.
Filing deadline end of March approaching.

## Why
Tax deadline end of March. No existing job for tracking.
Risk of penalties if not handled promptly.

## What I Would Do
Create a job, analyze the email, prepare the requested documents,
and submit the filing before the deadline.
SUGGESTION

# --- _gaps/gaps.md ---
cat > "$FIXTURE_DIR/_gaps/gaps.md" << 'GAPS'
## 2026-03-14: MFA TOTP on insurance portal
Problem: The insurance portal requires MFA via a mobile authenticator app.
Impact: Cannot log in automatically to fill the annual report.
Suggestion: Add a skill to read TOTP codes from the authenticator app.

---

## 2026-03-12: Email provider rate limit
Problem: Email provider returns 429 after ~50 requests in 1 minute.
Impact: Batch email processing is slowed, some emails may be missed.
Suggestion: Implement exponential backoff and a cache for already-read emails.

---

## ~~2026-03-08: Expired SSL certificate on example.com~~ RESOLVED
Problem: The SSL certificate on example.com had expired.
Impact: HTTPS requests were failing.
Resolved: Certificate renewed via Let's Encrypt on 2026-03-09.
GAPS

# --- _audit/actions.log ---
cat > "$FIXTURE_DIR/_audit/actions.log" << 'AUDIT'
{"sessionId":"sess-abc-001","toolName":"mcp__email__search","toolInput":{"query":"from:billing@example-client.com"},"decision":"ALLOW","timestamp":"2026-03-13T10:15:00.000Z"}
{"sessionId":"sess-abc-001","toolName":"mcp__email__read","toolInput":{"messageId":"msg-123"},"decision":"ALLOW","timestamp":"2026-03-13T10:15:05.000Z"}
{"sessionId":"sess-abc-001","toolName":"mcp__email__send","toolInput":{"to":"billing@example-client.com","subject":"Follow-up May timesheet"},"decision":"ALLOW","result":"sent","timestamp":"2026-03-13T10:16:00.000Z"}
{"sessionId":"sess-def-002","toolName":"Bash","toolInput":{"command":"curl https://insurance-portal.example.com/login"},"decision":"ALLOW","timestamp":"2026-03-12T14:30:00.000Z"}
{"sessionId":"sess-def-002","toolName":"mcp__camofox__navigate","toolInput":{"url":"https://insurance-portal.example.com/report"},"decision":"ALLOW","timestamp":"2026-03-12T14:31:00.000Z"}
AUDIT

echo "[smoke-setup] Fixture workspace created successfully"
echo "  - invoices-acme/ (active job)"
echo "  - insurance-report/ (deadline in 3 days)"
echo "  - _suggestions/tax-filing-followup.md (urgent suggestion)"
echo "  - _gaps/gaps.md (3 entries, 1 resolved)"
echo "  - _audit/actions.log (5 audit entries)"
