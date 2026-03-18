import { execFileSync } from 'child_process';
import { getVersion } from '../cli.js';

export async function runUpdate(): Promise<void> {
  console.log(`\n  Current version: ${getVersion()}`);
  console.log('  Checking for updates...\n');

  try {
    execFileSync('brew', ['update'], { stdio: 'inherit', timeout: 60_000 });
    const outdated = execFileSync('brew', ['outdated', 'alfred'], { encoding: 'utf-8', timeout: 10_000 }).trim();
    if (outdated) {
      console.log(`\n  Update available: ${outdated}`);
      console.log('  Upgrading...\n');
      execFileSync('brew', ['upgrade', 'alfred'], { stdio: 'inherit', timeout: 300_000 });
      console.log('\n  Restarting...');
      execFileSync('brew', ['services', 'restart', 'alfred'], { stdio: 'inherit', timeout: 30_000 });
      console.log('  Done.\n');
    } else {
      console.log('  Already up to date.\n');
    }
  } catch (err) {
    console.error('  Update failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
