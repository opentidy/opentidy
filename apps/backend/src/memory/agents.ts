import fs from 'node:fs'
import path from 'node:path'
import type { ClaudeProcessType } from '@opentidy/shared'
import type { SpawnClaudeSimpleFn } from '../infra/spawn-claude.js'
import { createMemoryLock } from './lock.js'
import { createMemoryManager } from './manager.js'

const MIN_TRANSCRIPT_LINES = 20

interface InjectionInput {
  indexContent: string
  event: string
  stateContent: string
}

interface ExtractionInput {
  transcriptPath: string
  indexContent: string
  dossierId: string
  stateContent: string
}

export function createMemoryAgents(workspaceDir: string, deps: {
  spawnClaude: SpawnClaudeSimpleFn;
}) {
  const memDir = path.join(workspaceDir, '_memory')
  const lock = createMemoryLock(memDir)
  const manager = createMemoryManager(workspaceDir)

  function buildInjectionPrompt(input: InjectionInput): string {
    return `Tu es l'agent d'injection mémoire d'OpenTidy. Ton rôle est de synthétiser les informations pertinentes de la mémoire pour une session de travail.

## INDEX.md (mémoire disponible)
${input.indexContent}

## Événement déclencheur
${input.event}

## État du dossier (state.md)
${input.stateContent}

## Instructions
1. Lis les fichiers mémoire qui te semblent pertinents pour cette tâche (utilise Read)
2. Synthétise les informations pertinentes en un bloc concis
3. Retourne UNIQUEMENT le bloc à injecter, au format suivant :

## Contexte mémoire (injecté automatiquement — ne pas modifier)
Dernière injection : ${new Date().toISOString().split('T')[0]}

- Point pertinent 1
- Point pertinent 2

## Contraintes
- 30 lignes maximum
- Que les infos pertinentes pour la tâche
- Si aucune mémoire n'est pertinente, retourne "Aucun contexte mémoire pertinent."
- Privilégie les entrées les plus récentes en cas de conflit`
  }

  function buildExtractionPrompt(input: ExtractionInput): string {
    const today = new Date().toISOString().split('T')[0]
    return `Tu es l'agent post-session d'OpenTidy. Tu fais 3 choses en un seul passage après chaque session terminée.

## Contexte
- Dossier : ${input.dossierId}
- Transcript : ${input.transcriptPath}
- State.md actuel du dossier (ci-dessous)

## State.md
${input.stateContent}

## INDEX.md (mémoire actuelle)
${input.indexContent}

---

## TES 3 MISSIONS (toutes obligatoires)

### Mission 1 — Mémoire
Extrais les informations nouvelles à retenir dans la mémoire globale.

**À extraire :**
- Faits business (statut d'une société, nouveau contact, décision prise)
- Leçons apprises (approche échouée, préférer X à Y)
- Contexte temporel (projet en pause, client ne répond plus)
- Corrections d'infos précédentes

**À ignorer :**
- Détails d'exécution (commandes lancées, fichiers modifiés)
- Ce qui est déjà en mémoire et n'a pas changé
- Infos purement techniques sans valeur business

**Si quelque chose de nouveau :**
- Crée ou mets à jour les fichiers dans ${memDir}/ (utilise Write)
- Mets à jour INDEX.md
- Chaque entrée datée [${today}]
- Annote les contradictions avec ⚠️

**Format fichier mémoire :**
\`\`\`
---
created: YYYY-MM-DD
updated: YYYY-MM-DD
category: business|contacts|contexte|lecons
description: Une ligne de description
---

Contenu libre avec entrées datées.
\`\`\`

### Mission 2 — Auto-analyses (gaps)
Identifie les obstacles rencontrés pendant la session et génère des analyses ACTIONNABLES.

**Critère clé : ne crée un gap QUE si Lolo peut agir dessus.** Exemples :
- OUI : accès/credentials manquants → Lolo peut les fournir
- OUI : hook qui bloque une action légitime → Lolo peut ajuster la config
- OUI : MCP/outil cassé ou mal configuré → Lolo peut corriger
- OUI : process inefficace détecté → Lolo peut améliorer le workflow
- NON : limitation théorique sans impact concret
- NON : observation vague sans action claire
- NON : bug interne du code OpenTidy (ça va dans les issues, pas les gaps)

**Si des gaps actionnables sont trouvés :** ajoute un bloc structuré par gap dans ${path.join(workspaceDir, '_gaps', 'gaps.md')} (append, ne supprime rien).
Format pour chaque gap :
\`\`\`
---

## ${today} — <Titre court et clair>

**Problème:** <Ce qui s'est passé concrètement>
**Impact:** <Conséquence business ou opérationnelle>
**Catégorie:** <capability|access|config|process|data>
**Actions recommandées:**
- <Action concrète 1 que Lolo peut faire>
- <Action concrète 2 (optionnel)>
**Dossier:** ${input.dossierId}
**Session:** <session_id si tu le trouves dans le transcript>
**Source:** post-session
\`\`\`

**Si rien d'actionnable → n'écris rien.** C'est OK de ne trouver aucun gap.

### Mission 3 — Journal
Vérifie que le journal dans state.md reflète le travail fait dans le transcript.
Si le journal est vide ou incomplet par rapport au transcript (actions faites mais pas notées) :
- Mets à jour state.md en ajoutant les entrées manquantes dans la section \`## Journal\`
- Format : \`- ${today} : <action réalisée>\`
- Ne supprime rien du journal existant, ajoute seulement

---

## Comment travailler
1. Lis le transcript à ${input.transcriptPath} (utilise Read — c'est un fichier .jsonl, chaque ligne est un JSON)
2. Lis les fichiers mémoire existants si nécessaire
3. Effectue les 3 missions
4. Si rien à faire pour une mission, passe à la suivante`
  }

  function buildPromptAgentPrompt(text: string, indexContent: string): string {
    return `Tu es l'agent mémoire d'OpenTidy. Lolo te donne une instruction en langage naturel pour ajouter ou modifier la mémoire.

## Instruction de Lolo
"${text}"

## INDEX.md (mémoire actuelle)
${indexContent}

## Instructions
1. Lis les fichiers mémoire existants si nécessaire (utilise Read)
2. Détermine s'il faut créer un nouveau fichier ou mettre à jour un existant
3. Écris/mets à jour le fichier dans ${memDir}/ (utilise Write)
4. Mets à jour INDEX.md

## Format des fichiers mémoire
\`\`\`
---
created: YYYY-MM-DD
updated: YYYY-MM-DD
category: business|contacts|contexte|lecons
description: Une ligne de description
---

Contenu libre avec entrées datées [YYYY-MM-DD].
\`\`\``
  }

  function isTranscriptSubstantial(transcriptPath: string): boolean {
    try {
      const content = fs.readFileSync(transcriptPath, 'utf-8')
      const lines = content.split('\n').filter(l => l.trim())
      return lines.length >= MIN_TRANSCRIPT_LINES
    } catch {
      console.warn('[memory] cannot read transcript, skipping extraction')
      return false
    }
  }

  async function runAgent(systemPrompt: string, userPrompt: string, type?: ClaudeProcessType, description?: string): Promise<string> {
    const agentType = type ?? 'memory-extraction';
    const args = ['-p', '--allowedTools', 'Read,Write,Glob', '--system-prompt', systemPrompt, '--', userPrompt];
    return deps.spawnClaude({ args, cwd: workspaceDir, type: agentType, description });
  }

  async function runInjection(input: InjectionInput): Promise<string> {
    const prompt = buildInjectionPrompt(input)
    return runAgent(prompt, 'Analyse la mémoire et génère le bloc de contexte à injecter.', 'memory-injection', 'Injection contexte mémoire')
  }

  async function runExtraction(input: ExtractionInput): Promise<void> {
    await lock.acquire()
    try {
      const prompt = buildExtractionPrompt(input)
      await runAgent(prompt, `Analyse post-session du dossier ${input.dossierId}. Effectue les 3 missions : mémoire, gaps, journal.`, 'memory-extraction', 'Extraction mémoire post-session')
    } finally {
      lock.release()
    }
  }

  async function runPromptAgent(text: string): Promise<void> {
    const indexContent = manager.readIndexRaw()
    await lock.acquire()
    try {
      const prompt = buildPromptAgentPrompt(text, indexContent)
      await runAgent(prompt, text, 'memory-prompt', `Commande mémoire: ${text.slice(0, 100)}`)
    } finally {
      lock.release()
    }
  }

  return {
    buildInjectionPrompt,
    buildExtractionPrompt,
    buildPromptAgentPrompt,
    isTranscriptSubstantial,
    runInjection,
    runExtraction,
    runPromptAgent,
  }
}
