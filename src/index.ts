import TelegramBot from 'node-telegram-bot-api';
import { CronJob } from 'cron';
import { addListing, isListingSeen, getListingPrice, updateListingPrice, getListingsCountSince, type Listing } from './db';
import { CarousellScraper } from './scrapers/carousell';
import { DCFeverScraper } from './scrapers/dcfever';
import { setupBrowser, closeBrowser } from './scrapers/core';
import { isOlderThanDays } from './utils';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatIdStr = process.env.TELEGRAM_CHAT_ID;
const scanIntervalMinStr = process.env.SCAN_INTERVAL_MIN_MINUTES || process.env.SCAN_INTERVAL_MINUTES || '10';
const scanIntervalMin = parseInt(scanIntervalMinStr, 10) || 10;
const scanIntervalMaxStr = process.env.SCAN_INTERVAL_MAX_MINUTES || process.env.SCAN_INTERVAL_MINUTES || '20';
const scanIntervalMax = parseInt(scanIntervalMaxStr, 10) || 20;

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
        const hour = parseInt(getPart('hour'), 10) === 24 ? '00' : getPart('hour');
        const minute = getPart('minute');

        const absoluteStr = `${year}-${month}-${day} ${hour}:${minute}`;
        dateStr = `*Posted:* ${absoluteStr} (${listing.postedAt.relative})\n`;
    }

    const message = `
🚨 *New ${SEARCH_KEYWORD} Listing - ${listing.platform}* 🚨

*Title:* ${listing.title}
*Price:* ${listing.price}
*ID:* \`${listing.id}\`

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
 * Sends a price-change notification to Telegram
 */
async function sendPriceChangeNotification(listing: Listing, oldPrice: string) {
    const message = `
💰 *Price Changed - ${listing.platform}* 💰

*Title:* ${listing.title}
*Old Price:* ${oldPrice}
*New Price:* ${listing.price}
*ID:* \`${listing.id}\`

[View Listing](${listing.url})
  `;

    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown', disable_web_page_preview: false });
        console.log(`[Telegram] Sent price change notification for ${listing.id} (${oldPrice} → ${listing.price})`);
    } catch (err) {
        console.error(`[Telegram] Failed to send price change message for ${listing.id}:`, err);
    }
}

/**
 * Main scraping job — launches ONE browser + page, reuses it for all scrapers, then closes.
 */
async function runJob() {
    console.log(`\n--- Starting Job at ${new Date().toISOString()} ---`);
    console.log(`[Config] Keyword: '${SEARCH_KEYWORD}', Price: ${MIN_PRICE}-${MAX_PRICE}, Max Age: ${maxAgeDays} days, Interval: ${scanIntervalMin}-${scanIntervalMax}m`);

    console.log(`[Browser] Launching browser...`);
    let browser: Awaited<ReturnType<typeof setupBrowser>>['browser'];
    let page: Awaited<ReturnType<typeof setupBrowser>>['page'];
    try {
        ({ browser, page } = await setupBrowser());
    } catch (err) {
        console.error(`[Browser] Failed to launch browser:`, err);
        console.log(`--- Job Aborted (browser launch failed) ---`);
        return;
    }
    console.log(`[Browser] Browser launched.`);

    try {
        for (const scraper of scrapers) {
            const scraperStart = Date.now();
            try {
                // Wrap entire scraper execution with a 120s timeout
                await Promise.race([
                    (async () => {
                        const results = await scraper.search(SEARCH_KEYWORD, page);

                        let newCount = 0;
                        let priceChangeCount = 0;
                        for (const listing of results) {
                            if (!isListingSeen(listing.id)) {
                                if (!isOlderThanDays(listing.postedAt?.absolute, maxAgeDays)) {
                                    await sendNotification(listing);
                                    newCount++;
                                    await new Promise(r => setTimeout(r, 1000));
                                } else {
                                    console.log(`[!] Skipping notification for ${listing.id} (Older than ${maxAgeDays} days: ${listing.postedAt?.absolute})`);
                                }
                                addListing(listing);
                            } else {
                                // Price change detection
                                const oldPrice = getListingPrice(listing.id);
                                if (oldPrice !== null && oldPrice !== listing.price) {
                                    console.log(`[Price] ${listing.id}: ${oldPrice} → ${listing.price}`);
                                    await sendPriceChangeNotification(listing, oldPrice);
                                    updateListingPrice(listing.id, listing.price);
                                    priceChangeCount++;
                                    await new Promise(r => setTimeout(r, 1000));
                                }
                            }
                        }
                        const elapsed = ((Date.now() - scraperStart) / 1000).toFixed(1);
                        console.log(`[${scraper.name}] Sync complete in ${elapsed}s. Found ${newCount} new, ${priceChangeCount} price changes.`);
                    })(),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error(`[${scraper.name}] Scraper timed out after 120s`)), 120_000)
                    )
                ]);
            } catch (err) {
                const elapsed = ((Date.now() - scraperStart) / 1000).toFixed(1);
                console.error(`[${scraper.name}] Error after ${elapsed}s:`, err);
            }
        }
    } finally {
        await closeBrowser(browser, 'Job');
    }

    console.log(`--- Job Finished ---`);
}

/**
 * Daily health check — summarises listings found in the past 24 hours.
 */
async function runHealthCheck() {
    console.log(`\n--- Health Check at ${new Date().toISOString()} ---`);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const counts = getListingsCountSince(since);

    const total = counts.reduce((sum, row) => sum + row.count, 0);
    const breakdown = counts.length > 0
        ? counts.map(r => `  • ${r.platform}: ${r.count}`).join('\n')
        : '  (none)';

    const message = `
📊 *Daily Health Check* 📊

*Items found in past 24h:* ${total}

${breakdown}
  `;

    try {
        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log(`[HealthCheck] Summary sent (${total} items).`);
    } catch (err) {
        console.error(`[HealthCheck] Failed to send summary:`, err);
    }
}

// Ensure first run works immediately
console.log("Starting Mac Mini Bot...");

// Schedule daily health check at 23:59 (Asia/Hong_Kong)
const healthCheckJob = new CronJob('59 23 * * *', runHealthCheck, null, true, 'Asia/Hong_Kong');
console.log(`[HealthCheck] Scheduled daily at 23:59 (Asia/Hong_Kong).`);

let timeoutId: Timer;

async function startLoop() {
    await runJob();
    scheduleNextJob();
}

function scheduleNextJob() {
    // Ensure actualMax is at least scanIntervalMin
    const actualMax = Math.max(scanIntervalMin, scanIntervalMax);

    // random interval in minutes between min and actualMax
    const intervalMins = Math.floor(Math.random() * (actualMax - scanIntervalMin + 1)) + scanIntervalMin;
    const intervalMs = intervalMins * 60 * 1000;

    const nextDate = new Date(Date.now() + intervalMs);
    console.log(`[Timer] Next scan scheduled in ${intervalMins} minutes (at ${nextDate.toISOString()}).`);

    timeoutId = setTimeout(() => {
        startLoop();
    }, intervalMs);
}

startLoop();

// Keep process alive if needed
process.on('SIGINT', () => {
    console.log("Shutting down...");
    if (timeoutId) clearTimeout(timeoutId);
    process.exit(0);
});
