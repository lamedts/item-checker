/**
 * Checks if a relative date string indicates the item is older than the configured months.
 */
export function isOlderThanDays(postedAt: string | undefined, daysLimit: number): boolean {
    if (!postedAt) return false;

    // postedAt is now expected to be an ISO 8601 string (or similar valid datetime)
    const parsedDate = new Date(postedAt);
    if (isNaN(parsedDate.getTime())) return false; // Invalid date format

    const now = new Date();
    const diffTime = now.getTime() - parsedDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    return diffDays >= daysLimit;
}

/**
 * Converts a relative date string (e.g. "362 日前", "5 days ago") to an absolute YYYY-MM-DD date string.
 */
export function toAbsoluteDate(postDate?: string): string | undefined {
    if (!postDate) return undefined;

    const lowerDate = postDate.toLowerCase();

    let millisToSubtract = 0;

    const match = lowerDate.match(/(\d+)/);
    if (!match) return undefined;

    const amount = parseInt(match[1] as string, 10);
    let englishUnit = '';

    if (lowerDate.includes('year') || lowerDate.includes('年前')) {
        millisToSubtract = amount * 365 * 24 * 60 * 60 * 1000;
        englishUnit = amount === 1 ? 'year' : 'years';
    } else if (lowerDate.includes('month') || lowerDate.includes('個月前') || lowerDate.includes('月前')) {
        millisToSubtract = amount * 30 * 24 * 60 * 60 * 1000;
        englishUnit = amount === 1 ? 'month' : 'months';
    } else if (lowerDate.includes('day') || lowerDate.includes('日前') || lowerDate.includes('天前')) {
        millisToSubtract = amount * 24 * 60 * 60 * 1000;
        englishUnit = amount === 1 ? 'day' : 'days';
    } else if (lowerDate.includes('hour') || lowerDate.includes('小時前')) {
        millisToSubtract = amount * 60 * 60 * 1000;
        englishUnit = amount === 1 ? 'hour' : 'hours';
    } else if (lowerDate.includes('min') || lowerDate.includes('分鐘前')) {
        millisToSubtract = amount * 60 * 1000;
        englishUnit = amount === 1 ? 'minute' : 'minutes';
    } else {
        return undefined; // Return original string if we can't parse it
    }

    // Return true ISO string for timezone-aware processing
    const targetDate = new Date(Date.now() - millisToSubtract);
    return targetDate.toISOString();
}
