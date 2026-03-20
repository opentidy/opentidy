// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import SecurityPanel from './SecurityPanel';
import ServiceControlPanel from './ServiceControlPanel';
import DangerZonePanel from './DangerZonePanel';

export default function Settings() {
  return (
    <div className="p-6 md:p-8 space-y-8 overflow-y-auto h-full">
      <SecurityPanel />
      <div className="border-t border-border pt-8">
        <ServiceControlPanel />
      </div>
      <div className="border-t border-border pt-8">
        <DangerZonePanel />
      </div>
    </div>
  );
}
