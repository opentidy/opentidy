// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import ModulesPanel from '../settings/ModulesPanel';
import AgentsPanel from '../settings/AgentsPanel';

export default function ModulesPage() {
  return (
    <div className="p-6 md:p-8 space-y-8 overflow-y-auto h-full">
      <ModulesPanel />
      <div className="border-t border-border pt-8">
        <AgentsPanel />
      </div>
    </div>
  );
}
