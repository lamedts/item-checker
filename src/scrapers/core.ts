import { chromium } from 'playwright-extra';
import { type Browser, type Page } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';
import { type Listing } from '../db';

// Add the stealth plugin to avoid basic detection
chromium.use(stealth());

/**
 * Interface that each scraper class will implement
 */
export interface Scraper {
    name: string;
    search(keyword: string): Promise<Listing[]>;
}

/**
 * Wraps a promise with a timeout. Rejects if the promise doesn't resolve within `ms` milliseconds.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`[Timeout] ${label} did not complete within ${ms / 1000}s`));
        }, ms);

        promise
            .then((val) => { clearTimeout(timer); resolve(val); })
            .catch((err) => { clearTimeout(timer); reject(err); });
    });
}

/**
 * Safely close the browser with a timeout.
 * On ARM64 Linux, browser.close() can hang indefinitely.
 * We close all contexts first, then try browser.close() with a 10s timeout.
 * If it still hangs, we log and move on (the outer per-scraper timeout in runJob is the safety net).
 */
export async function closeBrowser(browser: Browser, label: string): Promise<void> {
    try {
        // Close all contexts first — this often helps the browser shut down cleanly
        for (const context of browser.contexts()) {
            await Promise.race([
                context.close(),
                new Promise(r => setTimeout(r, 5_000))
            ]);
        }

        // Now try to close the browser itself
        await Promise.race([
            browser.close(),
            new Promise<void>((resolve) => {
                setTimeout(() => {
                    console.warn(`[${label}] browser.close() timed out after 10s, abandoning.`);
                    resolve();
                }, 10_000);
            })
        ]);
        console.log(`[${label}] Browser closed.`);
    } catch (err) {
        console.warn(`[${label}] browser.close() failed:`, err);
    }
}

export async function setupBrowser(): Promise<{ browser: Browser, page: Page }> {
    // Always run headless for a VPS
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--single-process'
        ]
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'en-US,en;q=0.9',
    });

    const page = await context.newPage();
    return { browser, page };
}

