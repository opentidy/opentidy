#!/bin/bash
set -euo pipefail

FIXTURE_DIR="$(cd "$(dirname "$0")/.." && pwd)/fixtures/smoke-workspace"

echo "[smoke-setup] Creating fixture workspace at $FIXTURE_DIR"

# Clean existing
rm -rf "$FIXTURE_DIR"

# Create directory structure
mkdir -p "$FIXTURE_DIR/factures-sopra/artifacts"
mkdir -p "$FIXTURE_DIR/exali-rapport"
mkdir -p "$FIXTURE_DIR/_suggestions"
mkdir -p "$FIXTURE_DIR/_gaps"
mkdir -p "$FIXTURE_DIR/_audit"

# --- factures-sopra/state.md ---
cat > "$FIXTURE_DIR/factures-sopra/state.md" << 'STATE'
# Factures Sopra 2025-2026

## Objectif
Générer et envoyer les factures mensuelles Sopra Steria.

## État actuel
STATUT: EN COURS
Dernière action: 2026-03-13

## Ce qui est fait
- Jan 2025: facture #2025-001 envoyée le 05/02 ✓
- Fév 2025: facture #2025-002 envoyée le 03/03 ✓
- Mar 2025: facture #2025-003 envoyée le 04/04 ✓

## Ce qui reste à faire
- Avr 2025: timesheet trouvé (152h), facture à créer
- Mai 2025: timesheet MANQUANT — email envoyé à Sopra le 12/03

## En attente
- Réponse de Sopra pour le timesheet de mai (relancer si pas de réponse avant le 16/03)

## Contacts
- Sopra billing: billing@soprasteria.com

## Notes
- Taux: 80€/h HT, devise EUR
- Format facture: utiliser /comptable avec template Sopra

## Journal
- 2026-03-13 — Relance envoyée à billing@soprasteria.com pour timesheet mai
- 2026-03-10 — Facture mars envoyée, confirmation reçue
STATE

# .gitkeep for artifacts
touch "$FIXTURE_DIR/factures-sopra/artifacts/.gitkeep"

# --- exali-rapport/state.md (deadline proche) ---
DEADLINE=$(date -v+3d '+%Y-%m-%d' 2>/dev/null || date -d '+3 days' '+%Y-%m-%d')
cat > "$FIXTURE_DIR/exali-rapport/state.md" << STATE
# Rapport annuel Exali

## Objectif
Remplir et soumettre le rapport annuel d'activité sur exali.com.

## État actuel
STATUT: EN COURS
Dernière action: 2026-03-12
DEADLINE: $DEADLINE

## Ce qui est fait
- Connexion à exali.com réussie
- Téléchargement du formulaire PDF

## Ce qui reste à faire
- Remplir les champs chiffre d'affaires et effectifs
- Uploader les justificatifs
- Soumettre avant la deadline du $DEADLINE

## En attente
- Rien

## Contacts
- Exali support: support@exali.de

## Journal
- 2026-03-12 — Formulaire téléchargé, début du remplissage
- 2026-03-10 — Première connexion, navigation du portail
STATE

# --- _suggestions/impots-chypre.md ---
cat > "$FIXTURE_DIR/_suggestions/impots-chypre.md" << 'SUGGESTION'
# Suggestion — Relance impôts chypriotes

URGENCE: urgent
SOURCE: Email reçu de tax@cyprus.gov.cy le 12/03
DATE: 2026-03-14

## Résumé
Email des impôts chypriotes reçu il y a 2 semaines, sans réponse.
Deadline fiscale fin mars approche.

## Pourquoi
Deadline fiscale fin mars. Pas de dossier existant pour le suivi.
Risque de pénalités si non traité rapidement.

## Ce que je ferais
Créer un dossier, analyser l'email, préparer les documents demandés,
et soumettre la déclaration avant la deadline.
SUGGESTION

# --- _gaps/gaps.md ---
cat > "$FIXTURE_DIR/_gaps/gaps.md" << 'GAPS'
## 2026-03-14 — MFA TOTP exali.com
Problème: Le site exali.com demande un code MFA par app mobile (authenticator).
Impact: Je ne peux pas me connecter automatiquement pour remplir le rapport annuel.
Suggestion: Ajouter un skill pour lire les codes TOTP depuis l'app d'authentification.

---

## 2026-03-12 — Rate limit Gmail API
Problème: L'API Gmail retourne 429 après ~50 requêtes en 1 minute.
Impact: Le traitement de lots d'emails est ralenti, certains emails peuvent être manqués.
Suggestion: Implémenter un backoff exponentiel et un cache des emails déjà lus.

---

## ~~2026-03-08 — Certificat SSL expiré example.com~~ ✅ RÉSOLU
Problème: Le certificat SSL du site example.com avait expiré.
Impact: Les requêtes HTTPS échouaient.
Résolu: Certificat renouvelé via Let's Encrypt le 2026-03-09.
GAPS

# --- _audit/actions.log ---
cat > "$FIXTURE_DIR/_audit/actions.log" << 'AUDIT'
{"sessionId":"sess-abc-001","toolName":"mcp__gmail__search","toolInput":{"query":"from:billing@soprasteria.com"},"decision":"ALLOW","timestamp":"2026-03-13T10:15:00.000Z"}
{"sessionId":"sess-abc-001","toolName":"mcp__gmail__read","toolInput":{"messageId":"msg-123"},"decision":"ALLOW","timestamp":"2026-03-13T10:15:05.000Z"}
{"sessionId":"sess-abc-001","toolName":"mcp__gmail__send","toolInput":{"to":"billing@soprasteria.com","subject":"Relance timesheet mai"},"decision":"ALLOW","result":"sent","timestamp":"2026-03-13T10:16:00.000Z"}
{"sessionId":"sess-def-002","toolName":"Bash","toolInput":{"command":"curl https://exali.com/login"},"decision":"ALLOW","timestamp":"2026-03-12T14:30:00.000Z"}
{"sessionId":"sess-def-002","toolName":"mcp__camofox__navigate","toolInput":{"url":"https://exali.com/report"},"decision":"ALLOW","timestamp":"2026-03-12T14:31:00.000Z"}
AUDIT

echo "[smoke-setup] Fixture workspace created successfully"
echo "  - factures-sopra/ (active dossier)"
echo "  - exali-rapport/ (deadline in 3 days)"
echo "  - _suggestions/impots-chypre.md (urgent suggestion)"
echo "  - _gaps/gaps.md (3 entries, 1 resolved)"
echo "  - _audit/actions.log (5 audit entries)"
