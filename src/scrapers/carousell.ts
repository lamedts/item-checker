import { withTimeout, type Scraper } from './core';
import { type Listing } from '../db';
import { toAbsoluteDate } from '../utils';
import { MIN_PRICE, MAX_PRICE } from '../index';
import { type Page } from 'playwright';
import * as fs from 'fs';

const SCRAPER_TIMEOUT_MS = 90_000; // 90 seconds max for entire scrape

export class CarousellScraper implements Scraper {
    name = 'Carousell';

    async search(keyword: string, page: Page): Promise<Listing[]> {
        return withTimeout(this._doSearch(keyword, page), SCRAPER_TIMEOUT_MS, 'Carousell search');
    }

    private async _doSearch(keyword: string, page: Page): Promise<Listing[]> {
        const listings: Listing[] = [];

        const encodedQuery = encodeURIComponent(keyword);
        const searchUrl = `https://www.carousell.com.hk/search/${encodedQuery}?addRecent=true&canChangeKeyword=true&includeSuggestions=true&searchId=bot&price_start=${MIN_PRICE}&price_end=${MAX_PRICE}`;

        console.log(`[Carousell] Navigating to ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        console.log(`[Carousell] Page loaded (domcontentloaded).`);

        // Wait for the page to settle
        await page.waitForTimeout(5000);

        console.log(`[Carousell] Extracting listing elements...`);
        const items = await page.$$('a[href^="/p/"]');
        console.log(`[Carousell] Found ${items.length} raw elements to parse.`);

        for (const item of items) {
            try {
                const href = await item.getAttribute('href');
                if (!href) continue;

                const urlStr = href.startsWith('http') ? href : `https://www.carousell.com.hk${href}`;

                const cleanHref = (href.split('?')[0] || '').replace(/\/$/, '');
                let originalId = '';
                const match = cleanHref.match(/-(\d+)$/);
                if (match && match[1]) {
                    originalId = match[1];
                } else {
                    const numbers = cleanHref.match(/\d+/g) || [];
                    originalId = numbers.sort((a, b) => b.length - a.length)[0] || '';
                }

                if (!originalId) {
                    originalId = Buffer.from(cleanHref).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 10);
                }

                // Look inside the parent container for all <p> tags
                const container = await item.$('xpath=..');
                let paragraphs = [];
                if (container) {
                    paragraphs = await container.$$('p');
                } else {
                    paragraphs = await item.$$('p');
                }

                let title = '';
                let price = '';
                let postDate = '';

                for (const p of paragraphs) {
                    const text = await p.textContent() || '';
                    if (text.includes('HK$')) {
                        price = text;
                    } else if (text.length > 5 && text.toLowerCase().includes('mac')) {
                        title = text;
                    } else if (text.includes(' ago') || text.includes(' minute') || text.includes(' hour') || text.includes(' day') || text.includes(' month') || text.includes(' year')) {
                        if (text.length < 25) {
                            postDate = text.trim();
                        }
                    }
                }

                if (!title) {
                    const rawText = await item.textContent() || '';
                    const lines = rawText.split('\\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                    title = lines[0] || 'Unknown Title';
                }

                const id = `carousell_${originalId}`;

                if (price && id && !listings.find(l => l.id === id)) {
                    listings.push({
                        id,
                        platform: 'carousell',
                        title: title.trim(),
                        price: price.trim(),
                        url: urlStr,
                        postedAt: toAbsoluteDate(postDate)
                    });
                }

            } catch (err) {
                console.error(`[Carousell] Error parsing an item:`, err);
            }
        }

        console.log(`[Carousell] Found ${listings.length} items.`);

        if (listings.length === 0) {
            console.log(`[Carousell] No items found. We might be blocked or the selector changed.`);
            try {
                const html = await page.content();
                fs.writeFileSync('carousell_debug.html', html);
                await page.screenshot({ path: 'carousell_debug.png', fullPage: true });
                console.log(`[Carousell] Debug HTML and screenshot saved.`);
            } catch (debugErr) {
                console.error(`[Carousell] Failed to save debug info:`, debugErr);
            }
        }

        return listings;
    }
}
