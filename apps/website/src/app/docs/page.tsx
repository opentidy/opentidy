// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { redirect } from "next/navigation";

export default function DocsIndex() {
  redirect("/docs/getting-started");
}
