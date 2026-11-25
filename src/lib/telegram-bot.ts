import type { Env } from './types';
import { DatabaseService } from './db';
import { TelegramAPI } from './telegram';

// Utility function for formatting dates in server-side code
function formatDate(date: Date | number): string {
  const dateObj = typeof date === 'number' ? new Date(date * 1000) : date;
  return dateObj.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      first_name: string;
      username?: string;
      type: string;
    };
    date: number;
    text?: string;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      is_bot: boolean;
      first_name: string;
      username?: string;
    };
    message: any;
    data: string;
  };
}

export class TelegramBot {
  constructor(
    private env: Env,
    private db: DatabaseService,
    private telegram: TelegramAPI
  ) {}

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    console.log('Received Telegram update:', JSON.stringify(update, null, 2));
    
    try {
      if (update.message) {
        console.log('Processing message update');
        await this.handleMessage(update.message);
      } else if (update.callback_query) {
        console.log('Processing callback query update');
        await this.handleCallbackQuery(update.callback_query);
      } else {
        console.log('Unknown update type, ignoring');
      }
    } catch (error) {
      console.error('Error handling Telegram update:', error);
      // Re-throw the error so we can see it in the worker logs
      throw error;
    }
  }

  private async handleMessage(message: any): Promise<void> {
    const chatId = message.chat.id.toString();
    const userId = message.from.id.toString();
    const text = message.text?.trim() || '';

    // Ensure user exists in database
    await this.db.createUser(userId, chatId);

    if (text.startsWith('/')) {
      await this.handleCommand(chatId, userId, text);
    } else {
      await this.handleText(chatId, userId, text);
    }
  }

  private async handleCommand(chatId: string, userId: string, command: string): Promise<void> {
    const [cmd, ...args] = command.split(' ');
    
    switch (cmd.toLowerCase()) {
      case '/start':
        await this.handleStart(chatId, userId, args);
        break;
      case '/help':
        await this.handleHelp(chatId);
        break;
      case '/subscribe':
        await this.handleSubscribe(chatId, userId, args);
        break;
      case '/list':
        await this.handleList(chatId, userId);
        break;
      case '/unsubscribe':
        await this.handleUnsubscribe(chatId, userId, args);
        break;
      case '/connect':
      case '/verify':
        await this.handleConnect(chatId, userId, args);
        break;
      default:
        await this.handleUnknownCommand(chatId, cmd);
    }
  }

  private async handleStart(chatId: string, userId: string, args: string[]): Promise<void> {
    // Check if Telegram user is linked to a GitHub account
    const githubUserId = await this.db.getGitHubUserByTelegramId(userId);
    
    if (!githubUserId) {
      // Show setup instructions for unverified users
      const setupMessage = `🎉 *Welcome to GitPing!*

To use this bot, you need to connect your GitHub account first:

*Setup Steps:*
1. Visit [GitPing Web App](https://gitping.vlvt.sh)
2. Sign in with your GitHub account
3. Add Telegram channel and get verification code
4. Send: \`/verify <your-code>\`

Once verified, you can manage repository subscriptions from both web and Telegram!

*Why GitHub is required:*
• Unified subscription management
• Better security and privacy
• Access to private repositories (future)

Ready to get started? 🚀`;

      await this.telegram.sendMessage(chatId, setupMessage, {
        parse_mode: 'Markdown'
      });
      return;
    }

    // Show regular welcome for verified users
    const welcomeMessage = `🎉 *Welcome back to GitPing!*

Your Telegram is linked to your GitHub account. You can manage repository subscriptions from both web and here!

*Available Commands:*
/list - View your subscriptions  
/subscribe - Subscribe to a repository
/unsubscribe - Remove a subscription
/help - Show all commands

*Quick Start:*
Try: \`/subscribe vercel/next.js\`

Let's get started! 🚀`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📋 My Subscriptions', callback_data: 'action_list' },
          { text: '📚 Subscribe to Repo', callback_data: 'action_subscribe' }
        ],
        [
          { text: '🌐 Open Web App', url: 'https://gitping.vlvt.sh' }
        ]
      ]
    };

    await this.telegram.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }

  private async handleHelp(chatId: string): Promise<void> {
    const helpMessage = `🤖 *GitPing Bot Commands*

⚠️ *GitHub Account Required*
This bot requires a verified GitHub account. Visit https://gitping.vlvt.sh to set up.

*Repository Management:*
/subscribe <owner/repo> - Subscribe to releases
/list - Show your subscriptions
/unsubscribe <id> - Remove subscription

*Examples:*
\`/subscribe microsoft/vscode\`
\`/subscribe facebook/react\`
\`/unsubscribe 1\`

*Account Setup:*
/verify <code> - Link to GitHub account
/help - Show this message

*Features:*
• Unified web and bot management
• Only stable releases (no pre-releases)
• Real-time notifications
• Rich formatted messages

*Need more help?*
Visit https://gitping.vlvt.sh for setup instructions.`;

    await this.telegram.sendMessage(chatId, helpMessage, {
      parse_mode: 'Markdown'
    });
  }

  private async handleSubscribe(chatId: string, userId: string, args: string[]): Promise<void> {
    // Check if Telegram user is linked to a GitHub account
    const githubUserId = await this.db.getGitHubUserByTelegramId(userId);
    
    if (!githubUserId) {
      await this.telegram.sendMessage(
        chatId,
        '❌ *Account not verified*\n\nPlease verify your GitHub account first.\n\nVisit: https://gitping.vlvt.sh',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (args.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Please specify a repository.\n\n*Usage:* `/subscribe owner/repo`\n*Example:* `/subscribe vercel/next.js`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const repo = args[0] || '';
    const parts = repo.split('/');
    const [owner, name] = parts;
    const validSegment = /^[A-Za-z0-9_.-]{1,100}$/;

    if (
      parts.length !== 2 ||
      !owner ||
      !name ||
      owner === '.' ||
      owner === '..' ||
      name === '.' ||
      name === '..' ||
      !validSegment.test(owner) ||
      !validSegment.test(name)
    ) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Invalid repository format.\n\n*Usage:* `/subscribe owner/repo`\n*Example:* `/subscribe microsoft/vscode`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      // Check if repo exists (this will throw if not found)
      const githubAPI = new (await import('./github')).GitHubAPI(this.env);
      await githubAPI.getRepository(owner, name);

      // Check if GitHub user already subscribed to this repo
      const existingSubscriptions = await this.db.getUserSubscriptions(githubUserId);
      const isAlreadySubscribed = existingSubscriptions.some(
        sub => sub.owner === owner && sub.name === name && sub.kind === 'release'
      );

      if (isAlreadySubscribed) {
        await this.telegram.sendMessage(
          chatId,
          `📝 You're already subscribed to *${owner}/${name}* releases!`,
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Get the Telegram channel ID for this GitHub user
      const telegramChannelId = await this.db.getTelegramChannelId(githubUserId);
      if (!telegramChannelId) {
        await this.telegram.sendMessage(
          chatId,
          '❌ *Telegram channel not found*\n\nPlease re-verify your account from the web dashboard.',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      // Create the subscription under GitHub user
      const repoId = await this.db.createRepo(owner, name);
      const subscriptionId = await this.db.createSubscription(
        githubUserId,
        repoId,
        'release',
        { include_prereleases: false },
        [] // Empty for verified channels architecture
      );

      // Link the subscription to the Telegram channel
      await this.db.createSubscriptionChannels(subscriptionId, [telegramChannelId]);

      const successMessage = `✅ *Successfully subscribed!*

📦 Repository: *${owner}/${name}*
🔔 Notifications: Release alerts
📱 Delivery: This chat

You'll receive notifications when new releases are published!`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📋 View All Subscriptions', callback_data: 'action_list' },
            { text: '➕ Add Another', callback_data: 'action_subscribe' }
          ]
        ]
      };

      await this.telegram.sendMessage(chatId, successMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        await this.telegram.sendMessage(
          chatId,
          `❌ Repository *${owner}/${name}* not found or not accessible.\n\nPlease check the repository name and make sure it's public.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        await this.telegram.sendMessage(
          chatId,
          '❌ Sorry, something went wrong. Please try again later.',
          { parse_mode: 'Markdown' }
        );
        console.error('Subscribe error:', error);
      }
    }
  }

  private async handleList(chatId: string, userId: string): Promise<void> {
    // Check if Telegram user is linked to a GitHub account
    const githubUserId = await this.db.getGitHubUserByTelegramId(userId);
    
    if (!githubUserId) {
      await this.telegram.sendMessage(
        chatId,
        '❌ *Account not verified*\n\nPlease verify your GitHub account first.\n\nVisit: https://gitping.vlvt.sh',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      const subscriptions = await this.db.getUserSubscriptions(githubUserId);

      if (subscriptions.length === 0) {
        await this.telegram.sendMessage(
          chatId,
          '📭 You have no active subscriptions.\n\nUse `/subscribe owner/repo` to get started!\n\nYou can also manage subscriptions on the [web app](https://gitping.vlvt.sh).',
          { parse_mode: 'Markdown' }
        );
        return;
      }

      let message = `📋 *Your Subscriptions* (${subscriptions.length})\n\n`;

      subscriptions.forEach((sub, index) => {
        const createdDate = formatDate(sub.created_at);
        message += `${index + 1}. *${sub.owner}/${sub.name}*\n`;
        message += `   🔔 Releases • 📅 Since ${createdDate}\n`;
        message += `   ID: \`${sub.id}\`\n\n`;
      });

      message += `*To unsubscribe:* \`/unsubscribe <id>\`\n*Example:* \`/unsubscribe ${subscriptions[0].id}\``;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '➕ Add Subscription', callback_data: 'action_subscribe' },
            { text: '🔄 Refresh List', callback_data: 'action_list' }
          ],
          [
            { text: '🌐 Web Dashboard', url: 'https://gitping.vlvt.sh' }
          ]
        ]
      };

      await this.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });

    } catch (error) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Unable to load subscriptions. Please try again.',
        { parse_mode: 'Markdown' }
      );
      console.error('List subscriptions error:', error);
    }
  }

  private async handleUnsubscribe(chatId: string, userId: string, args: string[]): Promise<void> {
    // Check if Telegram user is linked to a GitHub account
    const githubUserId = await this.db.getGitHubUserByTelegramId(userId);
    
    if (!githubUserId) {
      await this.telegram.sendMessage(
        chatId,
        '❌ *Account not verified*\n\nPlease verify your GitHub account first.\n\nVisit: https://gitping.vlvt.sh',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    if (args.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Please specify a subscription ID.\n\n*Usage:* `/unsubscribe <id>`\n\nUse `/list` to see your subscription IDs.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const subscriptionId = parseInt(args[0]);
    if (isNaN(subscriptionId)) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Invalid subscription ID. Please use a number.\n\n*Example:* `/unsubscribe 1`',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      // Delete subscription using GitHub user ID
      const deleted = await this.db.deleteSubscription(subscriptionId, githubUserId);

      if (deleted) {
        await this.telegram.sendMessage(
          chatId,
          '✅ *Subscription removed successfully!*\n\nYou will no longer receive notifications for this repository.',
          { parse_mode: 'Markdown' }
        );
      } else {
        await this.telegram.sendMessage(
          chatId,
          '❌ Subscription not found. Use `/list` to see your active subscriptions.',
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Unable to remove subscription. Please try again.',
        { parse_mode: 'Markdown' }
      );
      console.error('Unsubscribe error:', error);
    }
  }


  private async handleUnknownCommand(chatId: string, command: string): Promise<void> {
    await this.telegram.sendMessage(
      chatId,
      `❓ Unknown command: \`${command}\`\n\nUse /help to see available commands.`,
      { parse_mode: 'MarkdownV2' }
    );
  }

  private async handleText(chatId: string, userId: string, text: string): Promise<void> {
    // Handle plain text - could be a repository name
    if (text.includes('/') && text.split('/').length === 2) {
      // Looks like a repository, suggest subscription
      const keyboard = {
        inline_keyboard: [
          [
            { 
              text: `🔔 Subscribe to ${text}`, 
              callback_data: `subscribe_${text.replace('/', '_')}` 
            }
          ],
          [
            { text: '❓ Show Commands', callback_data: 'action_help' }
          ]
        ]
      };

      await this.telegram.sendMessage(
        chatId,
        `📦 Did you want to subscribe to *${text}*?`,
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
    } else {
      await this.telegram.sendMessage(
        chatId,
        '❓ I did not understand that. Use /help to see available commands.',
        { parse_mode: 'Markdown' }
      );
    }
  }

  private async handleCallbackQuery(query: any): Promise<void> {
    const chatId = query.message.chat.id.toString();
    const userId = query.from.id.toString();
    const data = query.data;

    // Answer the callback query to remove loading state
    await fetch(`https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: query.id })
    });

    switch (data) {
      case 'action_subscribe':
        await this.telegram.sendMessage(
          chatId,
          '📦 *Subscribe to a Repository*\n\nSend me a repository name in the format:\n\`owner/repository-name\`\n\n*Examples:*\n• `/subscribe microsoft/vscode`\n• `/subscribe facebook/react`\n• `/subscribe vercel/next.js`',
          { parse_mode: 'Markdown' }
        );
        break;
      case 'action_list':
        await this.handleList(chatId, userId);
        break;
      case 'action_help':
        await this.handleHelp(chatId);
        break;
      default:
        if (data.startsWith('subscribe_')) {
          const repo = data.substring(10).replace('_', '/');
          await this.handleSubscribe(chatId, userId, [repo]);
        }
    }
  }

  private async handleConnect(chatId: string, userId: string, args: string[]): Promise<void> {
    if (args.length !== 1) {
      await this.telegram.sendMessage(
        chatId, 
        '❌ *Invalid format*\n\nUsage: `/verify <6-digit-code>`\n\nGet your verification code from the GitPing web dashboard.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const code = args[0].trim();
    
    // Validate code format (6 digits)
    if (!/^\d{6}$/.test(code)) {
      await this.telegram.sendMessage(
        chatId, 
        '❌ *Invalid code format*\n\nPlease enter a 6-digit verification code from the GitPing web dashboard.',
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      // Attempt to use the connection code (pass userId to create link)
      const success = await this.db.useConnectionCode(code, chatId, userId);
      
      if (success) {
        await this.telegram.sendMessage(
          chatId, 
          '✅ *Successfully linked!*\n\nYour Telegram account is now connected to your GitPing web account. You can manage all your subscriptions from both the web dashboard and this bot.',
          { parse_mode: 'Markdown' }
        );
      } else {
        await this.telegram.sendMessage(
          chatId, 
          '❌ *Invalid or expired code*\n\nThe verification code is either invalid, expired, or already used. Please generate a new code from the GitPing web dashboard.',
          { parse_mode: 'Markdown' }
        );
      }
    } catch (error) {
      console.error('Error linking Telegram account:', error);
      await this.telegram.sendMessage(
        chatId, 
        '❌ *Connection failed*\n\nSorry, there was an error linking your account. Please try again or contact support.',
        { parse_mode: 'Markdown' }
      );
    }
  }
}