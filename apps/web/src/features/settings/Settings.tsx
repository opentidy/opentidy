// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import SecurityPanel from './SecurityPanel';
import TunnelPanel from './TunnelPanel';
import ServiceControlPanel from './ServiceControlPanel';
import DangerZonePanel from './DangerZonePanel';

export default function Settings() {
  return (
    <div className="p-5 md:p-7 space-y-6 overflow-y-auto h-full">
      <SecurityPanel />
      <div className="border-t border-border pt-6">
        <TunnelPanel />
      </div>
      <div className="border-t border-border pt-6">
        <ServiceControlPanel />
      </div>
      <div className="border-t border-border pt-6">
        <DangerZonePanel />
      </div>
    </div>
  );
}
