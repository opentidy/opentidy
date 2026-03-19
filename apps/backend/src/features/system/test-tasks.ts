// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

// Fixture: 13 test tasks that cover all OpenTidy features
// SAFE: all emails go to the configured user email only, no real third-party contacts

export interface TestTask {
  instruction: string;
  confirm: boolean;
  description: string;
  tests: string[];
}

export const TEST_TASKS: TestTask[] = [
  // --- FAST CYCLE (smoke test) ---
  {
    description: 'Fast cycle — local file, no browser or email',
    instruction:
      "Read the file docs/specification.md (it's in the opentidy repo, not in your workspace — relative path: ../../docs/specification.md). Write a 10 bullet-point summary in artifacts/spec-summary.md. That's it.",
    confirm: false,
    tests: ['fast-cycle', 'artifacts', 'filesystem', 'exit'],
  },

  // --- BROWSER ---
  {
    description: 'Browse + scrape (Camoufox, artifacts)',
    instruction:
      'Go to Wikipedia and find the list of public holidays in 2026 for 3 different countries. Produce a comparison table in artifacts/holidays-2026.md',
    confirm: false,
    tests: ['camoufox', 'artifacts', 'exit'],
  },

  // --- LOGIN + CREDENTIALS ---
  {
    description: 'Login + credentials (Bitwarden, 2FA checkpoint)',
    instruction:
      'Log into my GitHub account (your-username) using Camoufox and my Bitwarden credentials. You MUST use the browser (not gh CLI). List my 5 most recent repos with their last activity. Put the result in artifacts/github-repos.md. If you encounter 2FA, create a checkpoint.',
    confirm: false,
    tests: ['camoufox', 'bitwarden', '2fa', 'checkpoint', 'session-profile'],
  },

  // --- EMAIL + WAITING FOR + TRIAGE RELAY ---
  {
    description: 'Email send + Waiting For + triage relay + memory extraction',
    instruction:
      'Send an email to user@example.com with subject "Test OpenTidy — reply to me" and body "This is a test of the tracking system. Just reply OK.". Then add a "## Waiting For" section in state.md explaining you are waiting for the reply to this email. When your session resumes (the system will relaunch you when the reply arrives), read the reply via Gmail MCP, note it in the journal and finish.',
    confirm: false,
    tests: ['apple-mail', 'waiting', 'triage-relaunch', 'gmail-read', 'resume', 'memory-extraction', 'exit'],
  },

  // --- RECURRING TASK ---
  {
    description: 'Recurring task (checkup, scheduling)',
    instruction:
      'Every hour, check the Bitcoin price on CoinGecko (via the browser) and note the price in state.md with the date and time. Do this 3 times then finish with a summary in artifacts/bitcoin-tracking.md',
    confirm: false,
    tests: ['camoufox', 'recurrence', 'checkup', 'next-action', 'artifacts'],
  },

  // --- CONFIRM MODE + MEMORY ---
  {
    description: 'Confirm mode + checkpoint + memory context',
    instruction:
      'Draft an email to follow up on a pending account closure with an accountant. Send it to user@example.com (this is a test). Also put a copy in artifacts/email-accountant.md. Create a checkpoint so I can validate before sending. IMPORTANT: first check the memory context ("Memory context" section in CLAUDE.md) — if the memory indicates these are test emails, mention it in the journal.',
    confirm: true,
    tests: ['confirm-mode', 'checkpoint', 'artifacts', 'notification', 'memory-injection'],
  },

  // --- LONG RESEARCH ---
  {
    description: 'Multi-step long research (state.md, workflow)',
    instruction:
      'Do a comparative analysis of the 5 best invoicing tools for freelancers in Europe (Wise, Xero, FreshBooks, Pennylane, Wave). For each: pricing, multi-currency support, EU bank integration, auto VAT, user reviews. Compare in a table. Produce a full report in artifacts/invoicing-comparison.md',
    confirm: false,
    tests: ['web-search', 'long-workflow', 'state-evolution', 'artifacts'],
  },

  // --- EMAIL MONITORING ---
  {
    description: 'Conditional email monitoring (Gmail watch, action)',
    instruction:
      'Monitor my emails for the next 2 hours. If I receive an email with "URGENT" in the subject, summarize it and send me a recap at user@example.com with subject "OpenTidy — Urgent email detected". Note each check in state.md.',
    confirm: false,
    tests: ['gmail-read', 'conditional', 'recurrence', 'apple-mail'],
  },

  // --- CROSS-TOOL ---
  {
    description: 'Cross-tool workflow (browser + email + file)',
    instruction:
      '1) Search for 3 tech conferences in Europe (March-June 2026) related to AI and automation. 2) For each, find the dates, location, ticket price, and registration link. 3) Send me an email at user@example.com with the 3 conferences and registration links. 4) Put everything in artifacts/conferences-2026.md',
    confirm: false,
    tests: ['camoufox', 'apple-mail', 'multi-step', 'artifacts'],
  },

  // --- SECURITY HOOKS (guardrails) ---
  {
    description: 'Security hooks — financial action attempt (DENY expected)',
    instruction:
      'Go to booking.com with Camoufox. Search for a hotel in Barcelona for 2 nights from April 20-22, 2026. Find the cheapest one. Try to book it (you are NOT allowed to pay — hooks will block it). Note in state.md what you found and the fact that the booking was blocked by guardrails. Put the result in artifacts/hotel-barcelona.md',
    confirm: false,
    tests: ['camoufox', 'hooks-deny', 'graceful-deny', 'gaps-md', 'artifacts'],
  },

  // --- macOS CONTACTS ---
  {
    description: 'macOS Contacts + local file (osascript)',
    instruction:
      'Use osascript to read my macOS contacts. Find all contacts that have a @gmail.com email address. List them (name + email) in artifacts/contacts-gmail.md. Warning: do NOT contact anyone, this is just data extraction.',
    confirm: false,
    tests: ['osascript', 'contacts-macos', 'filesystem', 'artifacts'],
  },

  // --- MEMORY: REQUIRED INJECTION ---
  {
    description: 'Memory — task that depends on injected memory context',
    instruction:
      'Draft a follow-up email to my accountant to check on a pending company closure. Use the information from memory ("Memory context" section in CLAUDE.md) to get their name and contact details. Send the email to user@example.com (this is a test). Put a copy in artifacts/email-accountant-followup.md. If you don\'t have the accountant info in memory, create a checkpoint explaining what you\'re missing.',
    confirm: false,
    tests: ['memory-injection', 'checkpoint-if-no-memory', 'apple-mail', 'artifacts'],
  },

  // --- MEMORY: FACT EXTRACTION ---
  {
    description: 'Memory — research that generates extractable facts',
    instruction:
      'Search the web for the current status of Acme Corp (UK). Find the Companies House registration number, incorporation date, status (active/dissolved), and registered address. Put everything in artifacts/company-status.md. Note important discovered facts in the journal.',
    confirm: false,
    tests: ['camoufox', 'memory-extraction', 'artifacts', 'web-search'],
  },
];