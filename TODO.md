# TODO — Future Considerations

## Naming

- [x] **Rename "dossier" → "job"** — done. All types, routes, UI, i18n, backend, workspace, and docs renamed.
- [ ] **Rename backend jobs/processes** — revoir le nommage des process backend (triage, checkup, post-session) pour éviter toute confusion avec le terme "job".

## Module System

- [ ] **Multi-instance modules** — allow multiple instances of the same module with different configs (e.g., two Gmail accounts: perso + pro). Requires `multiInstance: true` in manifest, `name:instanceId` keying in config, and `nameTemplate` for MCP server naming.
- [ ] **Reference counting** — when multiple modules reference the same MCP, track which modules keep it alive and notify user on disable ("Camoufox remains active, used by Module X").
- [ ] **Module dependency graph** — modules that depend on other modules (e.g., "Email Analytics" depends on "Gmail" being active).
