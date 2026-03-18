# Comment executer le plan Alfred

## Pre-requis

- Claude Code installe avec Claude Max
- pnpm installe (`npm install -g pnpm`)
- Le repo `alfred` clone localement

## Execution chunk par chunk

Chaque chunk se lance dans un **nouveau terminal clean** avec `/ralf`.
Un chunk doit etre termine et tous ses tests verts avant de passer au suivant.

### Chunk 1 — Foundation (Tasks 1-4)

```bash
cd ~/Documents/alfred
claude
```

Puis dans Claude Code :
```
/ralf "$(cat ralf/chunk-1.md)" --max-iterations 30
```

**Quand c'est fini** : verifier que `pnpm build` passe et que le health check repond.

### Chunk 2 — Infrastructure (Tasks 5-8)

```bash
cd ~/Documents/alfred
claude
```

```
/ralf "$(cat ralf/chunk-2.md)" --max-iterations 40
```

**Quand c'est fini** : `pnpm test` doit montrer tous les tests locks/dedup/audit/workspace verts.

### Chunk 3 — Launcher, Receiver, Hooks (Tasks 9-15)

```bash
cd ~/Documents/alfred
claude
```

```
/ralf "$(cat ralf/chunk-3.md)" --max-iterations 50
```

C'est le chunk le plus gros. Ralph aura besoin de plus d'iterations.
**Quand c'est fini** : `pnpm test` passe, le backend demarre et repond sur tous les endpoints.

### Chunk 4 — Frontend (Tasks 16-24)

```bash
cd ~/Documents/alfred
claude
```

```
/ralf "$(cat ralf/chunk-4.md)" --max-iterations 40
```

**Quand c'est fini** : `pnpm build` passe (backend + frontend), l'app est navigable.

### Chunk 5 — Tests E2E + Edge cases + Infra (Tasks 25-28)

```bash
cd ~/Documents/alfred
claude
```

```
/ralf "$(cat ralf/chunk-5.md)" --max-iterations 40
```

**Quand c'est fini** : TOUT passe — unit tests, Playwright E2E, build, infrastructure en place.

## Si un chunk echoue

- Ralph boucle automatiquement tant que les tests ne passent pas
- Si Ralph atteint le max iterations sans reussir, il s'arrete
- Dans ce cas : ouvrir un nouveau `claude`, lire les logs, diagnostiquer, relancer `/ralf` avec le meme chunk

## Verification finale

Apres les 5 chunks :

```bash
cd ~/Documents/alfred
pnpm build                    # tout compile
pnpm test                     # tous les unit tests
pnpm dev &                    # lance backend + frontend
pnpm test:e2e                 # Playwright E2E
```
