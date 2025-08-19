// Utility functions for consistent date formatting across the application

/**
 * Format a date to "MMM DD, YYYY" format (e.g., "Aug 19, 2025")
 */
export function formatDate(date: Date | string | number): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  // Handle timestamp in seconds (convert to milliseconds)
  const timestamp = typeof date === 'number' && date < 10000000000 ? date * 1000 : date;
  const finalDate = typeof timestamp === 'number' ? new Date(timestamp) : dateObj;
  
  return finalDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format a date with time to "MMM DD, YYYY at HH:MM AM/PM" format
 */
export function formatDateTime(date: Date | string | number): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  // Handle timestamp in seconds (convert to milliseconds)
  const timestamp = typeof date === 'number' && date < 10000000000 ? date * 1000 : date;
  const finalDate = typeof timestamp === 'number' ? new Date(timestamp) : dateObj;
  
  return finalDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Get relative time string (e.g., "2 days ago", "3 months ago")
 */
export function getRelativeTime(date: Date | string | number): string {
  const dateObj = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  
  // Handle timestamp in seconds (convert to milliseconds)
  const timestamp = typeof date === 'number' && date < 10000000000 ? date * 1000 : date;
  const finalDate = typeof timestamp === 'number' ? new Date(timestamp) : dateObj;
  
  const now = new Date();
  const diffInMs = now.getTime() - finalDate.getTime();
  const diffInSeconds = Math.floor(diffInMs / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);
  const diffInWeeks = Math.floor(diffInDays / 7);
  const diffInMonths = Math.floor(diffInDays / 30);
  const diffInYears = Math.floor(diffInDays / 365);

  if (diffInSeconds < 60) {
    return 'just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'} ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours} hour${diffInHours === 1 ? '' : 's'} ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays} day${diffInDays === 1 ? '' : 's'} ago`;
  } else if (diffInWeeks < 4) {
    return `${diffInWeeks} week${diffInWeeks === 1 ? '' : 's'} ago`;
  } else if (diffInMonths < 12) {
    return `${diffInMonths} month${diffInMonths === 1 ? '' : 's'} ago`;
  } else {
    return `${diffInYears} year${diffInYears === 1 ? '' : 's'} ago`;
  }
}

/**
 * Format date with relative time (e.g., "Aug 19, 2025 (2 days ago)")
 */
export function formatDateWithRelative(date: Date | string | number): string {
  return `${formatDate(date)} (${getRelativeTime(date)})`;
}