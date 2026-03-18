import { SessionOutput } from './SessionOutput';

interface TerminalPaneProps {
  dossierId: string;
}

export default function TerminalPane({ dossierId }: TerminalPaneProps) {
  return <SessionOutput dossierId={dossierId} />;
}
