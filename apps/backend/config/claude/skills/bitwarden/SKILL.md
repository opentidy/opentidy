---
name: bitwarden
description: Retrieve passwords and credentials from Bitwarden/Vaultwarden via the bw CLI
---

Use the `bw` CLI to retrieve credentials from Bitwarden/Vaultwarden.

## Usage

```bash
bw get password "site-name"
bw get item "item-name" | jq '.login'
```

## Rules

- Never store retrieved passwords in state.md or any persistent file
- Use credentials only for the immediate task, then discard
