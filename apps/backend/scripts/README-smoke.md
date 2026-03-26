# Smoke Tests: /test Commands

Manual E2E tests E2E-FULL-01 to E2E-FULL-13. Each test is a `/test` command to run in Claude Code with the backend and frontend started.

## Prerequisites

```bash
./scripts/smoke-setup.sh   # Create fixture workspace
./scripts/smoke-start.sh   # Start backend (port 3099) + frontend (port 5173)
```

## Tests

### E2E-FULL-01: Email → existing job → action → audit

```
/test Simulate an incoming email event (POST /api/triage) from billing@example-client.com
(subject: "June timesheet"). Verify that:
1. The backend accepts the event (200)
2. The file workspace/invoices-acme/state.md is modified (new entry)
3. A session exists for "invoices-acme"
4. The file workspace/_audit/actions.log contains a recent entry
5. The web app on / shows an active session for "invoices-acme"
```

### E2E-FULL-02: New email → suggestion → approval → work → completed

```
/test Simulate an incoming email event (POST /api/triage) from tax@example-authority.gov
(subject: "Tax declaration deadline"). Verify that:
1. No "tax-filing" job is created in workspace/
2. A file workspace/_suggestions/tax-filing*.md exists with URGENCY: urgent
3. The web app on / shows the suggestion in the "Suggestions" section
4. Click "Create Job" in the web app
5. Verify that a workspace/tax-filing/ job now exists with a state.md
6. The suggestion has been removed from workspace/_suggestions/
7. The web app on /jobs shows the new job
```

### E2E-FULL-03: User instruction → job → checkpoint

```
/test In the web app, go to /new. Type the instruction "Annual insurance report 2025"
and click "Launch". Verify that:
1. A job workspace/insurance-report*/ is created with a state.md
2. The app redirects to the job page /job/<id>
3. The state.md contains the objective "insurance report"
4. A session exists for this job
5. A lock exists in /tmp/opentidy-locks/
```

### E2E-FULL-04: Sweep → deadline detection → autonomous work

```
/test Check the workspace: the job workspace/insurance-report/ has a state.md that
mentions a deadline in 3 days. Trigger a sweep via POST /api/sweep.
Verify that:
1. A session is launched for insurance-report
2. The state.md is updated after processing
3. The web app on / shows an active session for insurance-report
```

### E2E-FULL-05: Sweep → nothing to do → silence

```
/test Verify that all jobs in workspace/ have STATUS: COMPLETED or are up to date.
Trigger a sweep via POST /api/sweep. Verify that:
1. No new session is created
2. No notification is sent (check GET /api/notifications/recent → empty)
3. The web app on / shows zen mode (orb, "All good")
```

### E2E-FULL-06: Hook DENY → Claude adapts

```
/test Verify that a job with an active session exists. In that job's workspace,
verify that if Claude attempts a blocked action (e.g. email.send to an unknown recipient),
the hook returns DENY. Verify that:
1. The file workspace/_audit/actions.log contains a DENY entry
2. A checkpoint.md is created in the job (Claude asks for user help)
3. The web app shows the checkpoint in the "For you" section
4. The "Open terminal" button is present
```

### E2E-FULL-07: Idle timeout → resume → continuation

```
/test Verify that a job has a pending checkpoint.md and a .session-id file.
Simulate a timeout via POST /api/session/<id>/timeout. Verify that:
1. The state.md is updated with the save state
2. The lock is released
3. The .session-id is preserved
4. Trigger a resume via POST /api/job/<id>/resume
5. A new session is launched with --resume
6. The web app shows the session as active again
```

### E2E-FULL-08: 3 parallel sessions without interference

```
/test Create 3 jobs via the web app /new: "Test A", "Test B", "Test C".
Verify that:
1. 3 distinct jobs exist in workspace/
2. 3 distinct sessions are running
3. 3 distinct PID locks exist in /tmp/opentidy-locks/
4. The web app on / shows 3 active sessions
5. Each job has its own independent state.md
```

### E2E-FULL-09: Claude discovers a gap while working

```
/test Verify that a job has an active session. After Claude's work,
verify that:
1. workspace/_gaps/gaps.md contains a new entry (if Claude hit a limitation)
2. A checkpoint.md exists in the job (manual intervention needed)
3. The web app /improvements shows the new gaps entry
4. The web app / shows the checkpoint in "For you"
5. Both are independent (resolving the checkpoint doesn't resolve the gap)
```

### E2E-FULL-10: Claude never creates a job on its own

```
/test Simulate 5 different incoming email events with varied subjects (invoice, tax,
insurance, appointment, client request) via POST /api/triage.
No existing job matches these emails. After processing, verify that:
1. NO new job has been created in workspace/ (ls workspace/ without _*)
2. Suggestions exist in workspace/_suggestions/ (at least 3)
3. The web app / shows suggestions, not active jobs
4. Each suggestion has a .md file with URGENCY, SOURCE, Summary
```

### E2E-FULL-11: File exchange user ↔ Claude

```
/test Open a job that has a checkpoint requesting photos.
In the web app /job/<id>:
1. Upload 2 images via the upload form
2. Verify that the files appear in workspace/<job>/artifacts/
3. Verify that the files are listed in the job page sidebar
4. Trigger a session resume
5. Verify that the state.md mentions the received files after processing
```

### E2E-FULL-12: First launch, empty workspace

```
/test Delete the test workspace (rm -rf workspace/*).
Restart the backend (POST /api/restart or relaunch the process).
Open the web app. Verify that:
1. No crash, no errors in the console
2. The home shows zen mode (no checkpoints, no suggestions)
3. The /jobs page shows an empty state with a welcome message
4. Go to /new, create a job "First test"
5. The job is created, workspace/ contains the full structure
6. Back on / → the job appears in the active section
```

### E2E-FULL-13: Backend restart with active sessions

```
/test Verify that active sessions exist.
Note the current sessions and locks.
Restart the backend (kill + restart or POST /api/restart).
After restart, verify that:
1. Sessions are still active (independent of the backend)
2. Locks in /tmp/opentidy-locks/ are consistent with active sessions
3. The web app / shows active sessions correctly
4. No orphaned locks (dead PID) persist
```

## Cleanup

```bash
./scripts/smoke-cleanup.sh   # Kill processes + reset fixtures
```

## Notes

- The backend runs on port **3099** (not 5175) to avoid conflicts
- The frontend runs on port **5173** (Vite standard)
- Auto-sweep is disabled (`SWEEP_INTERVAL_MS=999999999`)
- Fixtures are in `apps/backend/fixtures/smoke-workspace/`
- `smoke-cleanup.sh` recreates fixtures to their initial state
