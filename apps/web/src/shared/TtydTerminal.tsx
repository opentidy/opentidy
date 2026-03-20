// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

interface TtydTerminalProps {
  port: number;
  title?: string;
}

export function TtydTerminal({ port, title = 'Terminal' }: TtydTerminalProps) {
  return (
    <iframe
      src={`http://localhost:${port}`}
      className="block w-full h-full border-0 bg-black"
      title={title}
      allow="clipboard-read; clipboard-write"
    />
  );
}
