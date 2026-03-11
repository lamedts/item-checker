import { chromium } from 'playwright-extra';
import { type Browser, type Page } from 'playwright';
import stealth from 'puppeteer-extra-plugin-stealth';
import { type Listing } from '../db';

// Add the stealth plugin to avoid basic detection
chromium.use(stealth());

/**
 * Interface that each scraper class will implement.
 * Scrapers receive a Page (tab) and reuse it.
 */
export interface Scraper {
    name: string;
    search(keyword: string, page: Page): Promise<Listing[]>;
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
 * Launch a browser and return both the browser and a ready-to-use page.
 * The same page should be reused across all scrapers in a single job.
 * Wrapped in a 30s timeout so a stuck launch doesn't hang forever.
 */
export async function setupBrowser(): Promise<{ browser: Browser, page: Page }> {
    const launchPromise = (async () => {
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
    })();

    return withTimeout(launchPromise, 30_000, 'setupBrowser');
}

/**
 * Force-kill any leftover Chromium processes.
 * Useful after browser.close() times out on ARM64 Linux.
 */
function forceKillBrowser(browser: Browser, label: string): void {
    try {
        const proc = (browser as any).process?.() ?? (browser as any)._process;
        if (proc && typeof proc.kill === 'function') {
            console.warn(`[${label}] Force-killing browser process (PID: ${proc.pid})...`);
            proc.kill('SIGKILL');
        } else {
            console.warn(`[${label}] No browser process handle found, attempting pkill chromium...`);
            import('child_process').then(cp => {
                cp.execSync('pkill -9 -f chromium || true', { timeout: 5_000 });
            }).catch(() => { });
        }
    } catch (err) {
        console.warn(`[${label}] Force-kill failed:`, err);
    }
}

/**
 * Safely close the browser with a timeout.
 * On ARM64 Linux, browser.close() can hang indefinitely.
 * If close times out, force-kills the Chromium process to free resources.
 */
export async function closeBrowser(browser: Browser, label: string): Promise<void> {
    let timedOut = false;

    try {
        await Promise.race([
            browser.close(),
            new Promise<void>((resolve) => {
                setTimeout(() => {
                    timedOut = true;
                    console.warn(`[${label}] browser.close() timed out after 10s, force-killing...`);
                    resolve();
                }, 10_000);
            })
        ]);

        if (timedOut) {
            forceKillBrowser(browser, label);
        } else {
            console.log(`[${label}] Browser closed.`);
        }
    } catch (err) {
        console.warn(`[${label}] browser.close() failed, force-killing:`, err);
        forceKillBrowser(browser, label);
    }
}
