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

## ~~2026-03-08 — Certificat SSL expiré loaddr.com~~ ✅ RÉSOLU
Problème: Le certificat SSL du site loaddr.com avait expiré.
Impact: Les requêtes HTTPS échouaient.
Résolu: Certificat renouvelé via Let's Encrypt le 2026-03-09.
