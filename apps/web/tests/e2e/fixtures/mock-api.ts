import { Page } from '@playwright/test';

export const mockDossiers = [
  {
    id: 'factures-sopra',
    title: 'Factures Sopra',
    status: 'EN COURS',
    objective: 'Generer les factures',
    lastAction: '2026-03-14',
    hasActiveSession: true,
    artifacts: ['facture-2025-04.pdf'],
  },
  {
    id: 'exali-rapport',
    title: 'Exali Rapport',
    status: 'EN COURS',
    objective: 'Rapport annuel',
    lastAction: '2026-03-13',
    hasActiveSession: true,
    artifacts: [],
  },
  {
    id: 'impots-done',
    title: 'Impots 2025',
    status: 'TERMIN\u00c9',
    objective: 'Declaration fiscale',
    lastAction: '2026-02-01',
    hasActiveSession: false,
    artifacts: ['declaration.pdf'],
  },
  {
    id: 'bloque-test',
    title: 'Test Bloque',
    status: 'BLOQU\u00c9',
    objective: 'Test',
    lastAction: '2026-03-10',
    hasActiveSession: false,
    artifacts: [],
  },
];

export const mockSuggestions = [
  {
    slug: 'impots-chypre',
    title: 'Impots Chypre',
    urgency: 'urgent',
    summary: 'Deadline tax declaration',
    source: 'Gmail',
    date: '2026-03-14',
    why: 'Deadline approaching',
    whatIWouldDo: 'Start declaration',
  },
  {
    slug: 'timesheet-juin',
    title: 'Timesheet Juin',
    urgency: 'normal',
    summary: 'Timesheet a soumettre',
    source: 'Checkup',
    date: '2026-03-13',
    why: 'Monthly task',
    whatIWouldDo: 'Submit timesheet',
  },
  {
    slug: 'assurance-auto',
    title: 'Assurance Auto',
    urgency: 'faible',
    summary: 'Renouvellement assurance',
    source: 'Gmail',
    date: '2026-03-12',
    why: 'Renewal coming up',
    whatIWouldDo: 'Renew insurance',
  },
];

export const mockSessions = [
  {
    id: 'alfred-factures-sopra',
    dossierId: 'factures-sopra',
    status: 'active',
    startedAt: '2026-03-14T08:00:00Z',
  },
  {
    id: 'alfred-exali-rapport',
    dossierId: 'exali-rapport',
    status: 'idle',
    startedAt: '2026-03-14T07:00:00Z',
  },
  {
    id: 'alfred-bloque-test',
    dossierId: 'bloque-test',
    status: 'mfa',
    startedAt: '2026-03-14T06:00:00Z',
  },
];

export const mockAmeliorations = [
  {
    id: '0',
    date: '2026-03-14',
    title: 'MFA TOTP exali',
    problem: 'Cannot handle TOTP',
    impact: 'Cannot access exali.com',
    suggestion: 'Add TOTP support',
    dossierId: 'exali-rapport',
    resolved: false,
  },
  {
    id: '1',
    date: '2026-03-13',
    title: 'Rate limit Gmail',
    problem: 'Too many API calls',
    impact: 'Delays in processing',
    suggestion: 'Add backoff',
    dossierId: null,
    resolved: false,
  },
  {
    id: '2',
    date: '2026-03-10',
    title: 'Old issue fixed',
    problem: 'Was broken',
    impact: 'None now',
    suggestion: 'Fixed',
    dossierId: null,
    resolved: true,
  },
];

export async function setupMockApi(
  page: Page,
  overrides?: Partial<{
    dossiers: typeof mockDossiers;
    suggestions: typeof mockSuggestions;
    sessions: typeof mockSessions;
    ameliorations: typeof mockAmeliorations;
  }>,
) {
  const dossiers = overrides?.dossiers ?? mockDossiers;
  const suggestions = overrides?.suggestions ?? mockSuggestions;
  const sessions = overrides?.sessions ?? mockSessions;
  const ameliorations = overrides?.ameliorations ?? mockAmeliorations;

  // GET routes
  await page.route('**/api/dossiers', (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: dossiers });
    }
    return route.fallback();
  });

  await page.route('**/api/dossier/*', (route) => {
    const url = route.request().url();
    const method = route.request().method();

    // POST /api/dossier (create)
    if (method === 'POST' && url.endsWith('/api/dossier')) {
      return route.fulfill({ json: { created: true } });
    }

    // GET /api/dossier/:id
    if (method === 'GET') {
      const segments = url.split('/api/dossier/')[1]?.split('/');
      const id = segments?.[0];
      const dossier = dossiers.find((d) => d.id === id);
      if (dossier) return route.fulfill({ json: dossier });
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
  await page.route('**/api/dossier', (route) => {
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

  await page.route('**/api/dossier/*/instruction', (route) =>
    route.fulfill({ json: { launched: true } }),
  );

  await page.route('**/api/dossier/*/resume', (route) =>
    route.fulfill({ json: { resumed: true } }),
  );

  await page.route('**/api/amelioration/*/resolve', (route) =>
    route.fulfill({ json: { resolved: true } }),
  );

  await page.route('**/api/checkup', (route) =>
    route.fulfill({ json: { ok: true } }),
  );
}
