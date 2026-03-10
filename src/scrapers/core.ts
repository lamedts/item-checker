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
