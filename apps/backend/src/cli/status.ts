import { execFileSync } from 'child_process';
import { loadConfig, getConfigPath } from '../config.js';
import { getVersion } from '../cli.js';

export async function runStatus(): Promise<void> {
  console.log(`\n  Alfred v${getVersion()}\n`);

  try {
    const services = execFileSync('brew', ['services', 'list'], { encoding: 'utf-8', timeout: 5000 });
    const alfredLine = services.split('\n').find(l => l.includes('alfred'));
    console.log(alfredLine ? `  Service: ${alfredLine.trim()}` : '  Service: not registered');
  } catch {
    console.log('  Service: brew services not available');
  }

  const config = loadConfig(getConfigPath());
  try {
    const health = execFileSync('curl', ['-sf', `http://localhost:${config.server.port}/api/health`], { encoding: 'utf-8', timeout: 5000 });
    const data = JSON.parse(health);
    console.log(`  Status: running`);
    console.log(`  Uptime: ${Math.floor(data.uptime / 60)}m`);
    console.log(`  Port: ${config.server.port}`);
  } catch {
    console.log('  Status: not running');
  }
  console.log('');
}
