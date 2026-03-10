/**
 * Checks if a relative date string indicates the item is older than the configured months.
 */
export function isOlderThanMonths(postDate: string | undefined, monthsLimit: number): boolean {
    if (!postDate) return false;

    // Extract the absolute YYYY-MM-DD prefix from our format (e.g. "2026-03-04 16:40 HKT")
    const match = postDate.match(/^(\d{4}-\d{2}-\d{2})/);
    if (!match) return false; // If we can't parse the date format cleanly, don't skip it

    const parsedDate = new Date(match[1] as string);
    const now = new Date();

    const diffTime = now.getTime() - parsedDate.getTime();
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    // Approximate a month loosely as 30 days
    return diffDays >= (monthsLimit * 30);
}

/**
 * Converts a relative date string (e.g. "362 日前", "5 days ago") to an absolute YYYY-MM-DD date string.
 */
export function toAbsoluteDate(postDate?: string): string {
    if (!postDate) return 'Unknown Date';

    const lowerDate = postDate.toLowerCase();

    let millisToSubtract = 0;

    const match = lowerDate.match(/(\d+)/);
    if (!match) return postDate;

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
        return postDate; // Return original string if we can't parse it
    }

    const targetDate = new Date(Date.now() - millisToSubtract);

    const options: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };

    // Use en-GB to get DD/MM/YYYY or similar, then extract parts
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(targetDate);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

    const year = getPart('year');
    const month = getPart('month');
    const day = getPart('day');
    const hour = parseInt(getPart('hour'), 10) === 24 ? '00' : getPart('hour'); // handle 24:00 to 00:00
    const minute = getPart('minute');

    const absoluteStr = `${year}-${month}-${day} ${hour}:${minute} HKT`;
    const englishRelative = `${amount} ${englishUnit} ago`;

    return `${absoluteStr} (${englishRelative})`;
}
