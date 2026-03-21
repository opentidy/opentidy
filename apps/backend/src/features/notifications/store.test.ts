// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase } from '../../shared/database.js';
import { createNotificationStore } from './store.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opentidy-notification-store-test-'));
}

describe('notification-store', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  it('records a notification and returns it', () => {
    const db = createDatabase(tmpDir);
    const store = createNotificationStore(db);
    const rec = store.record({ message: 'Test', link: '/test', taskId: 'abc' });
    expect(rec.id).toBeDefined();
    expect(rec.message).toBe('Test');
    expect(rec.link).toBe('/test');
    expect(rec.taskId).toBe('abc');
    expect(rec.timestamp).toBeDefined();
  });

  it('lists notifications in reverse chronological order', () => {
    const db = createDatabase(tmpDir);
    const store = createNotificationStore(db);
    store.record({ message: 'A', link: '/a' });
    store.record({ message: 'B', link: '/b' });
    store.record({ message: 'C', link: '/c' });
    const list = store.list();
    expect(list).toHaveLength(3);
    expect(list[0].message).toBe('C');
    expect(list[1].message).toBe('B');
    expect(list[2].message).toBe('A');
  });

  it('persists across function calls', () => {
    const db = createDatabase(tmpDir);
    const store1 = createNotificationStore(db);
    store1.record({ message: 'Persisted', link: '/persist' });

    // Create a new store instance using the same db — data must still be there
    const store2 = createNotificationStore(db);
    const list = store2.list();
    expect(list).toHaveLength(1);
    expect(list[0].message).toBe('Persisted');
  });
});