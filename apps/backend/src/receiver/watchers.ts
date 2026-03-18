// src/receiver/watchers.ts
export interface WatcherConfig {
  pollIntervalMs: number;
  source: 'whatsapp' | 'sms' | 'mail';
  getNewMessages: () => Promise<Array<{ from: string; body: string; timestamp: string }>>;
}

export function createWatcher(config: WatcherConfig, deps: {
  dedup: { isDuplicate: (c: string) => boolean; record: (c: string) => void };
  triage: (event: { source: string; content: string; metadata: Record<string, string> }) => Promise<void>;
}) {
  let timer: ReturnType<typeof setInterval> | null = null;

  async function poll(): Promise<void> {
    const messages = await config.getNewMessages();
    for (const msg of messages) {
      const content = JSON.stringify(msg);
      if (deps.dedup.isDuplicate(content)) continue;
      deps.dedup.record(content);

      console.log(`[receiver] ${config.source} message from ${msg.from}`);

      await deps.triage({
        source: config.source,
        content: `${config.source} de ${msg.from}: ${msg.body}`,
        metadata: { from: msg.from, timestamp: msg.timestamp },
      });
    }
  }

  function start(): void {
    timer = setInterval(poll, config.pollIntervalMs);
  }

  function stop(): void {
    if (timer) clearInterval(timer);
  }

  return { start, stop, poll };
}
