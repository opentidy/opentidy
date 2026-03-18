import { readFileSync } from 'fs';
import { resolve } from 'path';

const COMMANDS = ['start', 'setup', 'doctor', 'status', 'update', 'logs', 'uninstall'] as const;
type Command = typeof COMMANDS[number] | 'version' | 'help';

export function route(args: string[]): Command {
  const cmd = args[0];
  if (cmd === '--version' || cmd === '-v') return 'version';
  if (cmd === '--help' || cmd === '-h') return 'help';
  if (COMMANDS.includes(cmd as any)) return cmd as Command;
  if (!cmd) return 'start';
  return 'help';
}

export function getVersion(): string {
  try {
    // Production (Homebrew): dist/cli.js at libexec/dist/, VERSION at libexec/VERSION
    return readFileSync(resolve(import.meta.dirname, '../VERSION'), 'utf-8').trim();
  } catch {
    try {
      // Dev: read from package.json
      const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../package.json'), 'utf-8'));
      return pkg.version || 'dev';
    } catch {
      return 'dev';
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = route(args);

  switch (cmd) {
    case 'version':
      console.log(`alfred ${getVersion()}`);
      break;
    case 'start': {
      const { boot } = await import('./index.js');
      await boot();
      break;
    }
    case 'setup': {
      const { runSetup } = await import('./cli/setup.js');
      await runSetup(args[1]); // optional: module name or --all
      break;
    }
    case 'doctor': {
      const { runDoctor } = await import('./cli/doctor.js');
      await runDoctor();
      break;
    }
    case 'status': {
      const { runStatus } = await import('./cli/status.js');
      await runStatus();
      break;
    }
    case 'update': {
      const { runUpdate } = await import('./cli/update.js');
      await runUpdate();
      break;
    }
    case 'logs': {
      const { runLogs } = await import('./cli/logs.js');
      await runLogs();
      break;
    }
    case 'uninstall': {
      const { runUninstall } = await import('./cli/uninstall.js');
      await runUninstall(args.slice(1));
      break;
    }
    case 'help':
      console.log(`Usage: alfred <command>

Commands:
  start       Start the backend server (default)
  setup       Interactive first-time setup
  doctor      Verify deps, permissions, config
  status      Show service state, version, uptime
  update      Check and apply updates
  logs        Tail log files
  uninstall   Remove Alfred (config, data, services)

Options:
  --version  Show version
  --help     Show this help`);
      break;
  }
}

// Only run main when executed directly (not imported for tests)
const isDirectRun = process.argv[1]?.endsWith('cli.js') || process.argv[1]?.endsWith('cli.ts');
if (isDirectRun) {
  main().catch((err) => {
    console.error('[cli] Fatal error:', err);
    process.exit(1);
  });
}
