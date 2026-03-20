// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Loaddr Ltd

import { loadConfig, saveConfig, getConfigPath } from '../../shared/config.js';
import { ask, info, success, warn } from './utils.js';

export async function setupTelegram(): Promise<void> {
  const configPath = getConfigPath();
  const config = loadConfig(configPath);

  console.log('');
  console.log('  ┌─────────────────────────────────────┐');
  console.log('  │  Telegram Notifications              │');
  console.log('  └─────────────────────────────────────┘');
  console.log('');
  info('OpenTidy sends you notifications via Telegram.');
  info('You need a bot and a chat/group to send to.');
  console.log('');

  const telegramModuleConfig = config.modules?.telegram?.config ?? {};
  const currentToken = (telegramModuleConfig.botToken as string) || '';
  const currentChatId = (telegramModuleConfig.chatId as string) || '';

  if (currentToken) {
    info(`Current bot token: ...${currentToken.slice(-8)}`);
    const keep = await ask('  Keep current token? (Y/n) ');
    if (keep.toLowerCase() !== 'n') {
      if (currentChatId) {
        info(`Current chat ID: ${currentChatId}`);
        const keepChat = await ask('  Keep current chat ID? (Y/n) ');
        if (keepChat.toLowerCase() !== 'n') {
          success('Telegram config unchanged.');
          return;
        }
      }
      const chatId = await ask('  Chat ID: ');
      if (!config.modules.telegram) config.modules.telegram = { enabled: true, source: 'curated' };
      config.modules.telegram.config = { ...telegramModuleConfig, chatId };
      saveConfig(configPath, config);
      success('Chat ID updated.');
      return;
    }
  }

  info('How to create a Telegram bot:');
  info('  1. Open Telegram, search for @BotFather');
  info('  2. Send /newbot, follow the prompts');
  info('  3. Copy the token (looks like 123456:AABB...)');
  console.log('');
  const botToken = await ask('  Bot token: ');

  // Auto-detect Chat ID
  console.log('');
  info('Send a message to the bot in Telegram (any text).');
  info('Then press Enter here to auto-detect your Chat ID.');
  console.log('');
  await ask('  Press Enter after sending a message to the bot...');

  let chatId = '';
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates`);
    const data = await res.json() as { result?: Array<{ message?: { chat?: { id?: number } } }> };
    const updates = data.result || [];
    if (updates.length > 0) {
      const lastChat = updates[updates.length - 1]?.message?.chat;
      if (lastChat?.id) {
        chatId = String(lastChat.id);
        success(`Chat ID detected: ${chatId}`);
      }
    }
  } catch { /* ignore */ }

  if (!chatId) {
    warn('Could not auto-detect. Enter manually:');
    info(`  Open: https://api.telegram.org/bot${botToken}/getUpdates`);
    info('  Find "chat":{"id": NUMBER } in the response');
    chatId = await ask('  Chat ID: ');
  }

  if (!config.modules.telegram) config.modules.telegram = { enabled: false, source: 'curated' };
  config.modules.telegram.config = { ...(config.modules.telegram.config ?? {}), botToken, chatId };
  config.modules.telegram.enabled = true;
  saveConfig(configPath, config);
  success('Telegram configured.');
}
