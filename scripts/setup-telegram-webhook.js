#!/usr/bin/env node

/**
 * Script to set up Telegram webhook for GitPing bot
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'https://gitping-api.vlvt.sh/webhook/telegram';

async function setupWebhook() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('❌ TELEGRAM_BOT_TOKEN environment variable is required');
    console.log('Set it with: export TELEGRAM_BOT_TOKEN=your_bot_token');
    process.exit(1);
  }

  if (!TELEGRAM_WEBHOOK_SECRET) {
    console.error('❌ TELEGRAM_WEBHOOK_SECRET environment variable is required');
    console.log('Generate one with: export TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)');
    console.log('And set the same value in Wrangler: wrangler secret put TELEGRAM_WEBHOOK_SECRET --config wrangler-api.toml');
    process.exit(1);
  }

  console.log('🔧 Setting up Telegram webhook...');
  console.log(`📡 Webhook URL: ${WEBHOOK_URL}`);

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: WEBHOOK_URL,
        secret_token: TELEGRAM_WEBHOOK_SECRET,
        allowed_updates: ['message', 'callback_query']
      })
    });

    const result = await response.json();

    if (result.ok) {
      console.log('✅ Webhook set successfully!');
      console.log(`✨ Your Telegram bot is now live at: ${WEBHOOK_URL}`);
      console.log('\n🎯 Next steps:');
      console.log('1. Start a chat with your bot in Telegram');
      console.log('2. Send /start to begin');
      console.log('3. Use /subscribe owner/repo to subscribe to repositories');
    } else {
      console.error('❌ Failed to set webhook:', result.description);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Error setting webhook:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  setupWebhook();
}

module.exports = { setupWebhook };