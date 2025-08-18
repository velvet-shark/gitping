import type { Env, GitHubRelease, GitHubCommit } from './types';

export class TelegramAPI {
  constructor(private env: Env) {}

  private get apiUrl(): string {
    return `https://api.telegram.org/bot${this.env.TELEGRAM_BOT_TOKEN}`;
  }

  async sendMessage(chatId: string, text: string, options: {
    disable_web_page_preview?: boolean;
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    reply_markup?: any;
  } = {}): Promise<void> {
    const url = `${this.apiUrl}/sendMessage`;
    
    const body = {
      chat_id: chatId,
      text,
      disable_web_page_preview: options.disable_web_page_preview ?? true,
      parse_mode: options.parse_mode,
      reply_markup: options.reply_markup
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Telegram API error: ${response.status} ${errorText}`);
    }
  }

  formatReleaseMessage(
    owner: string, 
    repo: string, 
    release: GitHubRelease
  ): string {
    const title = release.name || release.tag_name;
    let message = `*${owner}/${repo}* — new release ${release.tag_name}\n`;
    
    if (title && title !== release.tag_name) {
      message += `• ${title}\n`;
    }

    if (release.body && release.body.trim()) {
      const body = release.body.trim();
      // Truncate very long release notes
      const truncatedBody = body.length > 200 
        ? body.substring(0, 200) + '...' 
        : body;
      message += `\n${truncatedBody}\n`;
    }

    message += `\n${release.html_url}`;
    
    return message;
  }

  formatCommitMessage(
    owner: string,
    repo: string,
    commits: GitHubCommit[],
    compareUrl?: string
  ): string {
    const count = commits.length;
    const firstCommit = commits[0];
    const branch = 'main'; // TODO: get actual branch from context
    
    let message = `*${owner}/${repo}* — ${count} commit${count > 1 ? 's' : ''} to ${branch}\n`;
    
    // Show first few commits
    const maxCommitsToShow = 3;
    const commitsToShow = commits.slice(0, maxCommitsToShow);
    
    for (const commit of commitsToShow) {
      const shortSha = commit.sha.substring(0, 7);
      const shortMessage = commit.commit.message.split('\n')[0];
      const truncatedMessage = shortMessage.length > 60 
        ? shortMessage.substring(0, 60) + '...' 
        : shortMessage;
      
      message += `• ${truncatedMessage} (${shortSha})\n`;
    }
    
    if (count > maxCommitsToShow) {
      const remaining = count - maxCommitsToShow;
      message += `+${remaining} more commit${remaining > 1 ? 's' : ''}...\n`;
    }
    
    if (compareUrl) {
      message += `\n${compareUrl}`;
    }
    
    return message;
  }

  formatCommitDigestMessage(
    owner: string,
    repo: string,
    commits: GitHubCommit[],
    timeWindow: { start: Date; end: Date },
    compareUrl?: string
  ): string {
    const count = commits.length;
    const branch = 'main'; // TODO: get actual branch from context
    
    const startTime = timeWindow.start.toISOString().substring(11, 16);
    const endTime = timeWindow.end.toISOString().substring(11, 16);
    const date = timeWindow.start.toISOString().substring(0, 10);
    
    let message = `*${owner}/${repo}* — ${count} commit${count > 1 ? 's' : ''} to ${branch} (${startTime}–${endTime} UTC ${date})\n`;
    
    // Show first few commits
    const maxCommitsToShow = 5;
    const commitsToShow = commits.slice(0, maxCommitsToShow);
    
    for (const commit of commitsToShow) {
      const shortMessage = commit.commit.message.split('\n')[0];
      const truncatedMessage = shortMessage.length > 50 
        ? shortMessage.substring(0, 50) + '...' 
        : shortMessage;
      
      message += `- ${truncatedMessage}\n`;
    }
    
    if (count > maxCommitsToShow) {
      const remaining = count - maxCommitsToShow;
      message += `+${remaining} more…`;
      if (compareUrl) {
        message += `  ${compareUrl}`;
      }
    } else if (compareUrl) {
      message += `\n${compareUrl}`;
    }
    
    return message;
  }

  async setWebhook(webhookUrl: string): Promise<void> {
    const url = `${this.apiUrl}/setWebhook`;
    
    const body = {
      url: webhookUrl,
      allowed_updates: ['message']
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to set webhook: ${response.status} ${errorText}`);
    }
  }

  async deleteWebhook(): Promise<void> {
    const url = `${this.apiUrl}/deleteWebhook`;

    const response = await fetch(url, {
      method: 'POST'
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to delete webhook: ${response.status} ${errorText}`);
    }
  }
}