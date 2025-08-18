import type { Env } from './types';
import { DatabaseService } from './db';
import { TelegramAPI } from './telegram';

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
    try {
      if (update.message) {
        await this.handleMessage(update.message);
      } else if (update.callback_query) {
        await this.handleCallbackQuery(update.callback_query);
      }
    } catch (error) {
      console.error('Error handling Telegram update:', error);
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
      case '/status':
        await this.handleStatus(chatId, userId);
        break;
      default:
        await this.handleUnknownCommand(chatId, cmd);
    }
  }

  private async handleStart(chatId: string, userId: string, args: string[]): Promise<void> {
    const welcomeMessage = `🎉 *Welcome to GitPing!*

I'll notify you instantly when your favorite GitHub repositories release new versions.

*Available Commands:*
/subscribe \\- Subscribe to a repository
/list \\- View your subscriptions  
/unsubscribe \\- Remove a subscription
/status \\- Check your account status
/help \\- Show this help message

*Quick Start:*
Try: \`/subscribe vercel/next.js\`

Let's get started\\! 🚀`;

    const keyboard = {
      inline_keyboard: [
        [
          { text: '📚 Subscribe to a Repo', callback_data: 'action_subscribe' },
          { text: '📋 My Subscriptions', callback_data: 'action_list' }
        ],
        [
          { text: '❓ Help', callback_data: 'action_help' }
        ]
      ]
    };

    await this.telegram.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'MarkdownV2',
      reply_markup: keyboard
    });
  }

  private async handleHelp(chatId: string): Promise<void> {
    const helpMessage = `🤖 *GitPing Bot Commands*

*Repository Management:*
/subscribe \\<owner/repo\\> \\- Subscribe to releases
/list \\- Show your subscriptions
/unsubscribe \\<id\\> \\- Remove subscription

*Examples:*
\`/subscribe microsoft/vscode\`
\`/subscribe facebook/react\`
\`/unsubscribe 1\`

*Account:*
/status \\- Your account info
/help \\- Show this message

*Filters Available:*
• Only stable releases \\(no pre\\-releases\\)
• Real\\-time notifications
• Rich formatted messages

*Need more help?*
Contact support or visit our documentation\\.`;

    await this.telegram.sendMessage(chatId, helpMessage, {
      parse_mode: 'MarkdownV2'
    });
  }

  private async handleSubscribe(chatId: string, userId: string, args: string[]): Promise<void> {
    if (args.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Please specify a repository\\.\n\n*Usage:* `/subscribe owner/repo`\n*Example:* `/subscribe vercel/next.js`',
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const repo = args[0];
    const [owner, name] = repo.split('/');

    if (!owner || !name) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Invalid repository format\\.\n\n*Usage:* `/subscribe owner/repo`\n*Example:* `/subscribe microsoft/vscode`',
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    try {
      // Check if repo exists (this will throw if not found)
      const githubAPI = new (await import('./github')).GitHubAPI(this.env);
      await githubAPI.getRepository(owner, name);

      // Check if user already subscribed to this repo
      const existingSubscriptions = await this.db.getUserSubscriptions(userId);
      const isAlreadySubscribed = existingSubscriptions.some(
        sub => sub.owner === owner && sub.name === name && sub.kind === 'release'
      );

      if (isAlreadySubscribed) {
        await this.telegram.sendMessage(
          chatId,
          `📝 You're already subscribed to *${owner}/${name}* releases\\!`,
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      // Create the subscription
      const repoId = await this.db.createRepo(owner, name);
      const subscriptionId = await this.db.createSubscription(
        userId,
        repoId,
        'release',
        { include_prereleases: false },
        [{ type: 'telegram', chat_id: chatId }]
      );

      const successMessage = `✅ *Successfully subscribed\\!*

📦 Repository: *${owner}/${name}*
🔔 Notifications: Release alerts
📱 Delivery: This chat

You'll receive notifications when new releases are published\\!`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '📋 View All Subscriptions', callback_data: 'action_list' },
            { text: '➕ Add Another', callback_data: 'action_subscribe' }
          ]
        ]
      };

      await this.telegram.sendMessage(chatId, successMessage, {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard
      });

    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        await this.telegram.sendMessage(
          chatId,
          `❌ Repository *${owner}/${name}* not found or not accessible\\.\n\nPlease check the repository name and make sure it's public\\.`,
          { parse_mode: 'MarkdownV2' }
        );
      } else {
        await this.telegram.sendMessage(
          chatId,
          '❌ Sorry, something went wrong\\. Please try again later\\.',
          { parse_mode: 'MarkdownV2' }
        );
        console.error('Subscribe error:', error);
      }
    }
  }

  private async handleList(chatId: string, userId: string): Promise<void> {
    try {
      const subscriptions = await this.db.getUserSubscriptions(userId);

      if (subscriptions.length === 0) {
        await this.telegram.sendMessage(
          chatId,
          '📭 You have no active subscriptions\\.\n\nUse `/subscribe owner/repo` to get started\\!',
          { parse_mode: 'MarkdownV2' }
        );
        return;
      }

      let message = `📋 *Your Subscriptions* \\(${subscriptions.length}\\)\n\n`;

      subscriptions.forEach((sub, index) => {
        const createdDate = new Date(sub.created_at * 1000).toLocaleDateString();
        message += `${index + 1}\\. *${sub.owner}/${sub.name}*\n`;
        message += `   🔔 Releases • 📅 Since ${createdDate}\n`;
        message += `   ID: \`${sub.id}\`\n\n`;
      });

      message += `*To unsubscribe:* \`/unsubscribe <id>\`\n*Example:* \`/unsubscribe ${subscriptions[0].id}\``;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '➕ Add Subscription', callback_data: 'action_subscribe' },
            { text: '🔄 Refresh List', callback_data: 'action_list' }
          ]
        ]
      };

      await this.telegram.sendMessage(chatId, message, {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard
      });

    } catch (error) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Unable to load subscriptions\\. Please try again\\.',
        { parse_mode: 'MarkdownV2' }
      );
      console.error('List subscriptions error:', error);
    }
  }

  private async handleUnsubscribe(chatId: string, userId: string, args: string[]): Promise<void> {
    if (args.length === 0) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Please specify a subscription ID\\.\n\n*Usage:* `/unsubscribe <id>`\n\nUse `/list` to see your subscription IDs\\.',
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    const subscriptionId = parseInt(args[0]);
    if (isNaN(subscriptionId)) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Invalid subscription ID\\. Please use a number\\.\n\n*Example:* `/unsubscribe 1`',
        { parse_mode: 'MarkdownV2' }
      );
      return;
    }

    try {
      const deleted = await this.db.deleteSubscription(subscriptionId, userId);

      if (deleted) {
        await this.telegram.sendMessage(
          chatId,
          '✅ *Subscription removed successfully\\!*\n\nYou will no longer receive notifications for this repository\\.',
          { parse_mode: 'MarkdownV2' }
        );
      } else {
        await this.telegram.sendMessage(
          chatId,
          '❌ Subscription not found\\. Use `/list` to see your active subscriptions\\.',
          { parse_mode: 'MarkdownV2' }
        );
      }
    } catch (error) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Unable to remove subscription\\. Please try again\\.',
        { parse_mode: 'MarkdownV2' }
      );
      console.error('Unsubscribe error:', error);
    }
  }

  private async handleStatus(chatId: string, userId: string): Promise<void> {
    try {
      const subscriptions = await this.db.getUserSubscriptions(userId);
      const user = await this.db.getUser(userId);

      const joinDate = user ? new Date(user.created_at * 1000).toLocaleDateString() : 'Unknown';

      const statusMessage = `📊 *Your GitPing Status*

👤 *User ID:* \`${userId}\`
📅 *Member since:* ${joinDate}
🔔 *Active subscriptions:* ${subscriptions.length}
📱 *Chat ID:* \`${chatId}\`

*Recent Activity:*
${subscriptions.length > 0 
  ? subscriptions.slice(0, 3).map(sub => `• ${sub.owner}/${sub.name}`).join('\\n')
  : 'No subscriptions yet'
}

*Commands Available:*
/subscribe \\- Add new repository
/list \\- View all subscriptions  
/help \\- Get help`;

      await this.telegram.sendMessage(chatId, statusMessage, {
        parse_mode: 'MarkdownV2'
      });

    } catch (error) {
      await this.telegram.sendMessage(
        chatId,
        '❌ Unable to load status\\. Please try again\\.',
        { parse_mode: 'MarkdownV2' }
      );
      console.error('Status error:', error);
    }
  }

  private async handleUnknownCommand(chatId: string, command: string): Promise<void> {
    await this.telegram.sendMessage(
      chatId,
      `❓ Unknown command: \`${command}\`\n\nUse /help to see available commands\\.`,
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
          parse_mode: 'MarkdownV2',
          reply_markup: keyboard 
        }
      );
    } else {
      await this.telegram.sendMessage(
        chatId,
        '❓ I did not understand that\\. Use /help to see available commands\\.',
        { parse_mode: 'MarkdownV2' }
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
          '📦 *Subscribe to a Repository*\n\nSend me a repository name in the format:\n\`owner/repository\\-name\`\n\n*Examples:*\n• `/subscribe microsoft/vscode`\n• `/subscribe facebook/react`\n• `/subscribe vercel/next.js`',
          { parse_mode: 'MarkdownV2' }
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
}