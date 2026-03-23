// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { Entry } from '@napi-rs/keyring';

const SERVICE = 'opentidy';

export interface KeychainAdapter {
  setPassword(moduleName: string, key: string, value: string): void;
  getPassword(moduleName: string, key: string): string | null;
  deletePassword(moduleName: string, key: string): void;
}

export function createKeychainAdapter(): KeychainAdapter {
  function account(moduleName: string, key: string): string {
    return `${moduleName}-${key}`;
  }

  return {
    setPassword(moduleName, key, value) {
      const entry = new Entry(SERVICE, account(moduleName, key));
      entry.setPassword(value);
      console.log(`[keychain] Stored ${moduleName}/${key}`);
    },

    getPassword(moduleName, key) {
      try {
        const entry = new Entry(SERVICE, account(moduleName, key));
        return entry.getPassword();
      } catch {
        return null;
      }
    },

    deletePassword(moduleName, key) {
      try {
        const entry = new Entry(SERVICE, account(moduleName, key));
        entry.deletePassword();
        console.log(`[keychain] Deleted ${moduleName}/${key}`);
      } catch {
        // Key not found — that's fine
      }
    },
  };
}
