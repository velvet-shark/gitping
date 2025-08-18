// Structured logging utility for GitPing

interface LogContext {
  [key: string]: any;
}

export class Logger {
  constructor(private component: string, private env?: string) {}

  private log(level: string, message: string, context?: LogContext): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      environment: this.env || 'development',
      message,
      ...context
    };

    console.log(JSON.stringify(logEntry));
  }

  info(message: string, context?: LogContext): void {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('WARN', message, context);
  }

  error(message: string, error?: Error, context?: LogContext): void {
    const errorContext = error ? {
      error_message: error.message,
      error_stack: error.stack,
      ...context
    } : context;

    this.log('ERROR', message, errorContext);
  }

  debug(message: string, context?: LogContext): void {
    this.log('DEBUG', message, context);
  }

  // Helper methods for common operations
  apiRequest(method: string, path: string, status: number, duration?: number): void {
    this.info('API Request', {
      http_method: method,
      http_path: path,
      http_status: status,
      duration_ms: duration
    });
  }

  githubApiCall(endpoint: string, status: number, rateLimit?: { remaining: number; reset: string }): void {
    this.info('GitHub API Call', {
      github_endpoint: endpoint,
      github_status: status,
      rate_limit_remaining: rateLimit?.remaining,
      rate_limit_reset: rateLimit?.reset
    });
  }

  telegramApiCall(method: string, chatId: string, success: boolean, error?: string): void {
    this.info('Telegram API Call', {
      telegram_method: method,
      telegram_chat_id: chatId,
      success,
      error_message: error
    });
  }

  pollingSummary(reposPolled: number, newEvents: number, errors: number): void {
    this.info('Polling Summary', {
      repos_polled: reposPolled,
      new_events: newEvents,
      polling_errors: errors
    });
  }

  queueProcessing(messagesProcessed: number, notificationsSent: number, failures: number): void {
    this.info('Queue Processing Summary', {
      messages_processed: messagesProcessed,
      notifications_sent: notificationsSent,
      notification_failures: failures
    });
  }
}

// Create logger instances for different components
export const createLogger = (component: string, environment?: string): Logger => {
  return new Logger(component, environment);
};