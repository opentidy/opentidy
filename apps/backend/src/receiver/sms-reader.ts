import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFileCb);

interface SmsReaderDeps {
  execFn?: (script: string) => Promise<string>;
  sinceMinutes?: number;
}

export function createSmsReader(deps: SmsReaderDeps = {}) {
  const sinceMinutes = deps.sinceMinutes ?? 5;

  // AppleScript reads recent messages from Messages.app
  const script = `
    set cutoff to (current date) - ${sinceMinutes * 60}
    set output to ""
    tell application "Messages"
      repeat with c in every chat
        repeat with m in messages of c
          if date received of m > cutoff and sender of m is not missing value then
            set senderHandle to handle of sender of m
            set msgDate to date received of m as «class isot» as string
            set msgText to text of m
            set output to output & senderHandle & tab & msgDate & tab & msgText & linefeed
          end if
        end repeat
      end repeat
    end tell
    return output
  `;

  const execFn = deps.execFn ?? (async (s: string) => {
    const { stdout } = await execFileAsync('osascript', ['-e', s]);
    return stdout;
  });

  async function getNewMessages(): Promise<Array<{ from: string; body: string; timestamp: string }>> {
    try {
      const stdout = await execFn(script);
      return stdout
        .trim()
        .split('\n')
        .filter(line => line.includes('\t'))
        .map(line => {
          const [from, timestamp, ...bodyParts] = line.split('\t');
          return { from: from.trim(), body: bodyParts.join('\t').trim(), timestamp: timestamp.trim() };
        });
    } catch (err) {
      console.error('[sms-reader] Failed to read Messages.app:', err);
      return [];
    }
  }

  return { getNewMessages };
}
