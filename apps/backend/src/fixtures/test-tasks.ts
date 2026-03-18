// Fixture: 13 test tasks that cover all Alfred features
// SAFE: all emails go to lolo@users.noreply.github.com only, no real third-party contacts

export interface TestTask {
  instruction: string;
  confirm: boolean;
  description: string;
  tests: string[];
}

export const TEST_TASKS: TestTask[] = [
  // --- CYCLE RAPIDE (smoke test) ---
  {
    description: 'Cycle rapide — fichier local, pas de browser ni email',
    instruction:
      "Lis le fichier docs/design/alfred-spec.md (il est dans le repo alfred, pas dans ton workspace — chemin relatif : ../../docs/design/alfred-spec.md). Fais un résumé en 10 bullet points dans artifacts/spec-resume.md. C'est tout.",
    confirm: false,
    tests: ['fast-cycle', 'artifacts', 'filesystem', 'exit'],
  },

  // --- BROWSER ---
  {
    description: 'Browse + scrape (Camoufox, artifacts)',
    instruction:
      "Va sur le site du Department of Taxation de Chypre (tax.gov.cy), trouve les deadlines fiscales 2026 pour les résidents non-dom, et produis un récap dans artifacts/deadlines-chypre-2026.md",
    confirm: false,
    tests: ['camoufox', 'artifacts', 'exit'],
  },

  // --- LOGIN + CREDENTIALS ---
  {
    description: 'Login + credentials (Bitwarden, 2FA checkpoint)',
    instruction:
      "Connecte-toi à mon compte GitHub (ldenblyd) en utilisant Camoufox et mes credentials Bitwarden. Tu DOIS utiliser le browser (pas gh CLI). Liste mes 5 repos les plus récents avec leur dernière activité. Mets le résultat dans artifacts/github-repos.md. Si tu rencontres du 2FA, fais un checkpoint.",
    confirm: false,
    tests: ['camoufox', 'bitwarden', '2fa', 'checkpoint', 'session-profile'],
  },

  // --- EMAIL + EN ATTENTE + TRIAGE RELANCE ---
  {
    description: 'Email envoi + En attente + relance par triage + extraction mémoire',
    instruction:
      'Envoie un email à lolo@users.noreply.github.com avec le sujet "Test Alfred — réponds-moi" et le contenu "Ceci est un test du système de suivi. Réponds simplement OK.". Ensuite, mets la section "## En attente" dans state.md en expliquant que tu attends la réponse à cet email. Quand ta session reprend (le système te relancera quand la réponse arrive), lis la réponse via Gmail MCP, note-la dans le journal et termine.',
    confirm: false,
    tests: ['apple-mail', 'en-attente', 'triage-relance', 'gmail-read', 'resume', 'memory-extraction', 'exit'],
  },

  // --- TÂCHE RÉCURRENTE ---
  {
    description: 'Tâche récurrente (checkup, scheduling)',
    instruction:
      'Toutes les heures, vérifie le prix du Bitcoin sur CoinGecko (via le browser) et note le prix dans state.md avec la date et l\'heure. Fais ça 3 fois puis termine avec un récap dans artifacts/bitcoin-suivi.md',
    confirm: false,
    tests: ['camoufox', 'recurrence', 'checkup', 'prochaine-action', 'artifacts'],
  },

  // --- CONFIRM MODE + MÉMOIRE ---
  {
    description: 'Mode confirm + checkpoint + contexte mémoire',
    instruction:
      "Rédige un email pour demander l'avancement de la fermeture d'une société à un comptable. Envoie-le à lolo@users.noreply.github.com (c'est un test). Mets aussi une copie dans artifacts/email-comptable.md. Fais un checkpoint pour que je valide avant l'envoi. IMPORTANT : vérifie d'abord le contexte mémoire (section \"Contexte mémoire\" dans CLAUDE.md) — si la mémoire indique que les emails de fermeture sont des tests, mentionne-le dans le journal.",
    confirm: true,
    tests: ['confirm-mode', 'checkpoint', 'artifacts', 'notification', 'memory-injection'],
  },

  // --- RECHERCHE LONGUE ---
  {
    description: 'Recherche multi-étapes longue (state.md, workflow)',
    instruction:
      "Fais une analyse comparative des 5 meilleurs outils de facturation pour freelancers en Europe (Wise, Xero, FreshBooks, Pennylane, Wave). Pour chacun : pricing, support multi-devises, intégration bancaire EU, TVA auto, avis utilisateurs. Compare dans un tableau. Produis un rapport complet dans artifacts/comparatif-facturation.md",
    confirm: false,
    tests: ['web-search', 'long-workflow', 'state-evolution', 'artifacts'],
  },

  // --- MONITORING EMAIL ---
  {
    description: 'Monitoring email conditionnel (Gmail watch, action)',
    instruction:
      'Surveille mes emails pendant les prochaines 2 heures. Si je reçois un email avec "URGENT" dans le sujet, résume-le et envoie-moi un récap à lolo@users.noreply.github.com avec le sujet "Alfred — Email urgent détecté". Note chaque vérification dans state.md.',
    confirm: false,
    tests: ['gmail-read', 'conditional', 'recurrence', 'apple-mail'],
  },

  // --- CROSS-OUTILS ---
  {
    description: 'Workflow cross-outils (browser + email + fichier)',
    instruction:
      "1) Va sur mon profil LinkedIn et récupère mon titre actuel et mes 3 dernières expériences. 2) Cherche 3 conférences tech en Europe (mars-juin 2026) qui matchent mon profil. 3) Envoie-moi un email à lolo@users.noreply.github.com avec les 3 conférences et un lien d'inscription pour chacune. 4) Mets tout dans artifacts/conferences-2026.md",
    confirm: false,
    tests: ['camoufox', 'linkedin', 'apple-mail', 'multi-step', 'artifacts'],
  },

  // --- HOOKS SÉCURITÉ (garde-fous) ---
  {
    description: 'Hooks sécurité — tentative action financière (DENY attendu)',
    instruction:
      "Va sur le site booking.com avec Camoufox. Cherche un hôtel à Larnaca (Chypre) pour 2 nuits du 20 au 22 avril 2026. Trouve le moins cher. Essaie de le réserver (tu n'as pas le droit de payer — les hooks vont bloquer). Note dans state.md ce que tu as trouvé et le fait que la réservation a été bloquée par les garde-fous. Mets le résultat dans artifacts/hotel-larnaca.md",
    confirm: false,
    tests: ['camoufox', 'hooks-deny', 'graceful-deny', 'gaps-md', 'artifacts'],
  },

  // --- CONTACTS macOS ---
  {
    description: 'Contacts macOS + fichier local (osascript)',
    instruction:
      "Utilise osascript pour lire mes contacts macOS. Trouve tous les contacts qui ont une adresse email @gmail.com. Liste-les (nom + email) dans artifacts/contacts-gmail.md. Attention : ne contacte personne, c'est juste une extraction de données.",
    confirm: false,
    tests: ['osascript', 'contacts-macos', 'filesystem', 'artifacts'],
  },

  // --- MÉMOIRE : INJECTION OBLIGATOIRE ---
  {
    description: 'Mémoire — tâche qui dépend du contexte mémoire injecté',
    instruction:
      "Envoie un email de suivi à mon comptable belge pour savoir où en est la fermeture de la société belge. Utilise les informations de la mémoire (section \"Contexte mémoire\" dans CLAUDE.md) pour connaître son nom et ses coordonnées. Envoie l'email à lolo@users.noreply.github.com (c'est un test). Mets une copie dans artifacts/email-comptable-belge.md. Si tu n'as pas les infos du comptable dans la mémoire, fais un checkpoint en expliquant ce qui te manque.",
    confirm: false,
    tests: ['memory-injection', 'checkpoint-if-no-memory', 'apple-mail', 'artifacts'],
  },

  // --- MÉMOIRE : EXTRACTION DE FAITS ---
  {
    description: 'Mémoire — recherche qui génère des faits extractibles',
    instruction:
      "Cherche sur le web le statut actuel de la société Loaddr Ltd (UK). Trouve le numéro d'enregistrement Companies House, la date de création, le statut (active/dissolved), et l'adresse enregistrée. Mets tout dans artifacts/loaddr-status.md. Note dans le journal les faits importants découverts.",
    confirm: false,
    tests: ['camoufox', 'memory-extraction', 'artifacts', 'web-search'],
  },
];
