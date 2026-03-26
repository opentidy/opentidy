## 2026-03-14 — MFA TOTP on insurance portal
Problem: The insurance portal requires MFA via a mobile authenticator app.
Impact: Cannot log in automatically to fill the annual report.
Suggestion: Add a skill to read TOTP codes from the authenticator app.

---

## 2026-03-12 — Email provider rate limit
Problem: Email provider returns 429 after ~50 requests in 1 minute.
Impact: Batch email processing is slowed, some emails may be missed.
Suggestion: Implement exponential backoff and a cache for already-read emails.

---

## ~~2026-03-08 — Expired SSL certificate on example.com~~ RESOLVED
Problem: The SSL certificate on example.com had expired.
Impact: HTTPS requests were failing.
Resolved: Certificate renewed via Let's Encrypt on 2026-03-09.
