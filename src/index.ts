import TelegramBot from 'node-telegram-bot-api';
import { CronJob } from 'cron';
import { addListing, isListingSeen, type Listing } from './db';
import { CarousellScraper } from './scrapers/carousell';
import { DCFeverScraper } from './scrapers/dcfever';
import { isOlderThanDays } from './utils';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatIdStr = process.env.TELEGRAM_CHAT_ID;
const scanIntervalStr = process.env.SCAN_INTERVAL_MINUTES || '15';
const scanInterval = parseInt(scanIntervalStr, 10) || 15;

// Search configuration
export const SEARCH_KEYWORD = process.env.SEARCH_KEYWORD || 'mac mini';
export const MIN_PRICE = process.env.MIN_PRICE || '1000';
export const MAX_PRICE = process.env.MAX_PRICE || '5000';
const maxAgeStr = process.env.MAX_AGE_DAYS || '30';
const maxAgeDays = parseInt(maxAgeStr, 10) || 30;

if (!token || !chatIdStr) {
    console.error("Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.");
    console.error("Please create a .env file and set these variables.");
    process.exit(1);
}

const chatId = parseInt(chatIdStr, 10);
const bot = new TelegramBot(token, { polling: false });

const scrapers = [
    new CarousellScraper(),
    new DCFeverScraper()
];

/**
 * Sends a formatted message to Telegram
 */
async function sendNotification(listing: Listing) {
    let dateStr = '';
    if (listing.postedAt) {
        // Parse the ISO string to format appropriately in HKT timezone
        const dateObj = new Date(listing.postedAt.absolute);

        const options: Intl.DateTimeFormatOptions = {
            timeZone: 'Asia/Hong_Kong',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        };

        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(dateObj);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';

        const year = getPart('year');
        const month = getPart('month');
        const day = getPart('day');
        const hour = parseInt(getPart('hour'), 10) === 24 ? '00' : getPart('hour'); // handle 24:00
        const minute = getPart('minute');

        const absoluteStr = `${year}-${month}-${day} ${hour}:${minute}`;
        dateStr = `*Posted:* ${absoluteStr} (${listing.postedAt.relative})\n`;
    }

    const message = `
🚨 *New ${SEARCH_KEYWORD} Listing - ${listing.platform}* 🚨

*Title:* ${listing.title}
*Price:* ${listing.price}
${dateStr}[View Listing](${listing.url})
  `;

    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: false });
        console.log(`[Telegram] Sent notification for ${listing.id}`);
    } catch (err) {
        console.error(`[Telegram] Failed to send message for ${listing.id}:`, err);
    }
}

/**
 * Main scraping job
 */
async function runJob() {
    console.log(`\n--- Starting Job at ${new Date().toISOString()} ---`);
    console.log(`[Config] Keyword: '${SEARCH_KEYWORD}', Price: ${MIN_PRICE}-${MAX_PRICE}, Max Age: ${maxAgeDays} days, Interval: ${scanInterval}m`);

    for (const scraper of scrapers) {
        try {
            const results = await scraper.search(SEARCH_KEYWORD);

            let newCount = 0;
            for (const listing of results) {
                if (!isListingSeen(listing.id)) {
                    // Check if it's older than user-configured limit
                    if (!isOlderThanDays(listing.postedAt?.absolute, maxAgeDays)) {
                        // This is a new listing and not too old
                        await sendNotification(listing);
                        newCount++;

                        // Slight delay between messages to avoid rate limiting
                        await new Promise(r => setTimeout(r, 1000));
                    } else {
                        console.log(`[!] Skipping notification for ${listing.id} (Older than ${maxAgeDays} days: ${listing.postedAt?.absolute})`);
                    }

                    // Always add to DB so we don't process it again (even if we skipped notification)
                    addListing(listing);
                }
            }
            console.log(`[${scraper.name}] Sync complete. Found ${newCount} new items.`);
        } catch (err) {
            console.error(`Error running scraper ${scraper.name}:`, err);
        }
    }

    console.log(`--- Job Finished ---`);
}

// Ensure first run works immediately
console.log("Starting Mac Mini Bot...");
runJob();

// Schedule to run based on env variable
const cronString = `0 */${scanInterval} * * * *`;
const job = new CronJob(cronString, runJob);
job.start();
console.log(`Cron job scheduled to run every ${scanInterval} minutes (cron: ${cronString}).`);

// Keep process alive if needed
process.on('SIGINT', () => {
    console.log("Shutting down...");
    job.stop();
    process.exit(0);
});
