import { Page } from '@playwright/test';

export const mockTasks = [
  {
    id: 'invoices-acme',
    title: 'Invoices Acme',
    status: 'IN_PROGRESS',
    objective: 'Generate monthly invoices',
    lastAction: '2026-03-14',
    hasActiveSession: true,
    artifacts: ['invoice-2025-04.pdf'],
  },
  {
    id: 'insurance-report',
    title: 'Insurance Report',
    status: 'IN_PROGRESS',
    objective: 'Annual report',
    lastAction: '2026-03-13',
    hasActiveSession: true,
    artifacts: [],
  },
  {
    id: 'taxes-done',
    title: 'Tax Filing 2025',
    status: 'COMPLETED',
    objective: 'Tax declaration',
    lastAction: '2026-02-01',
    hasActiveSession: false,
    artifacts: ['declaration.pdf'],
  },
  {
    id: 'blocked-test',
    title: 'Test Blocked',
    status: 'IN_PROGRESS',
    objective: 'Test',
    lastAction: '2026-03-10',
    hasActiveSession: false,
    artifacts: [],
  },
];

export const mockSuggestions = [
  {
    slug: 'tax-filing-followup',
    title: 'Tax Filing Follow-up',
    urgency: 'urgent',
    summary: 'Deadline tax declaration',
    source: 'Gmail',
    date: '2026-03-14',
    why: 'Deadline approaching',
    whatIWouldDo: 'Start declaration',
  },
  {
    slug: 'timesheet-june',
    title: 'Timesheet June',
    urgency: 'normal',
    summary: 'Timesheet to submit',
    source: 'Checkup',
    date: '2026-03-13',
    why: 'Monthly task',
    whatIWouldDo: 'Submit timesheet',
  },
  {
    slug: 'car-insurance',
    title: 'Car Insurance',
    urgency: 'low',
    summary: 'Insurance renewal',
    source: 'Gmail',
    date: '2026-03-12',
    why: 'Renewal coming up',
    whatIWouldDo: 'Renew insurance',
  },
];

export const mockSessions = [
  {
    id: 'opentidy-invoices-acme',
    taskId: 'invoices-acme',
    status: 'active',
    startedAt: '2026-03-14T08:00:00Z',
  },
  {
    id: 'opentidy-insurance-report',
    taskId: 'insurance-report',
    status: 'idle',
    startedAt: '2026-03-14T07:00:00Z',
  },
  {
    id: 'opentidy-blocked-test',
    taskId: 'blocked-test',
    status: 'mfa',
    startedAt: '2026-03-14T06:00:00Z',
  },
];

export const mockAmeliorations = [
  {
    id: '0',
    date: '2026-03-14',
    title: 'MFA TOTP insurance portal',
    problem: 'Cannot handle TOTP',
    impact: 'Cannot access insurance portal',
    suggestion: 'Add TOTP support',
    taskId: 'insurance-report',
    resolved: false,
  },
  {
    id: '1',
    date: '2026-03-13',
    title: 'Rate limit Gmail',
    problem: 'Too many API calls',
    impact: 'Delays in processing',
    suggestion: 'Add backoff',
    taskId: null,
    resolved: false,
  },
  {
    id: '2',
    date: '2026-03-10',
    title: 'Old issue fixed',
    problem: 'Was broken',
    impact: 'None now',
    suggestion: 'Fixed',
    taskId: null,
    resolved: true,
  },
];

export async function setupMockApi(
  page: Page,
  overrides?: Partial<{
    tasks: typeof mockTasks;
    suggestions: typeof mockSuggestions;
    sessions: typeof mockSessions;
    ameliorations: typeof mockAmeliorations;
  }>,
) {
  const tasks = overrides?.tasks ?? mockTasks;
  const suggestions = overrides?.suggestions ?? mockSuggestions;
  const sessions = overrides?.sessions ?? mockSessions;
  const ameliorations = overrides?.ameliorations ?? mockAmeliorations;

  // GET routes
  await page.route('**/api/tasks', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: tasks });
    }
    return route.fallback();
  });

  await page.route('**/api/task/*', (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // POST /api/task (create)
    if (method === 'POST' && url.endsWith('/api/task')) {
      return route.fulfill({ json: { created: true } });
    }

    // GET /api/task/:id
    if (method === 'GET') {
      const segments = url.split('/api/task/')[1]?.split('/');
      const id = segments?.[0];
      const task = tasks.find((d) => d.id === id);
      if (task) return route.fulfill({ json: task });
      return route.fulfill({ status: 404, json: { error: 'not found' } });
    }

    return route.fallback();
  });

  await page.route('**/api/suggestions', (route) =>
    route.fulfill({ json: suggestions }),
  );

  await page.route('**/api/sessions', (route) =>
    route.fulfill({ json: sessions }),
  );

  await page.route('**/api/ameliorations', (route) =>
    route.fulfill({ json: ameliorations }),
  );

  await page.route('**/api/events', (route) =>
    route.fulfill({
      status: 200,
      body: '',
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );

  // POST routes
  await page.route('**/api/task', (route) => {
    if (route.request().method() === 'POST') {
      return route.fulfill({ json: { created: true } });
    }
    return route.fallback();
  });

  await page.route('**/api/suggestion/*/approve', (route) =>
    route.fulfill({ json: { approved: true } }),
  );

  await page.route('**/api/suggestion/*/ignore', (route) =>
    route.fulfill({ json: { ignored: true } }),
  );

  await page.route('**/api/task/*/instruction', (route) =>
    route.fulfill({ json: { launched: true } }),
  );

  await page.route('**/api/task/*/resume', (route) =>
    route.fulfill({ json: { resumed: true } }),
  );

  await page.route('**/api/amelioration/*/resolve', (route) =>
    route.fulfill({ json: { resolved: true } }),
  );

  await page.route('**/api/checkup', (route) =>
    route.fulfill({ json: { ok: true } }),
  );
}
