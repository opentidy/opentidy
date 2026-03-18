import { spawn } from 'child_process';
import { existsSync } from 'fs';

export async function runLogs(): Promise<void> {
  const logPaths = [
    '/opt/homebrew/var/log/opentidy.log',
    `${process.env.HOME}/Library/Logs/opentidy-stdout.log`,
  ];

  const logPath = logPaths.find(p => existsSync(p));
  if (!logPath) {
    console.log('  No log file found.');
    return;
  }

  console.log(`  Tailing ${logPath} (Ctrl+C to stop)\n`);
  const tail = spawn('tail', ['-f', logPath], { stdio: 'inherit' });
  tail.on('close', () => process.exit(0));
}
