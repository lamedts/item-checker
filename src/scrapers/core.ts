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
            '--disable-gpu'
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
