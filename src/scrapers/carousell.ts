import { setupBrowser, type Scraper } from './core';
import { type Listing } from '../db';
import { toAbsoluteDate } from '../utils';
import { MIN_PRICE, MAX_PRICE } from '../index';
import * as fs from 'fs';

export class CarousellScraper implements Scraper {
    name = 'Carousell';

    async search(keyword: string): Promise<Listing[]> {
        const { browser, page } = await setupBrowser();
        const listings: Listing[] = [];

        try {
            const encodedQuery = encodeURIComponent(keyword);
            // Construct the Carousell search URL with price filters
            const searchUrl = `https://www.carousell.com.hk/search/${encodedQuery}?addRecent=true&canChangeKeyword=true&includeSuggestions=true&searchId=bot&price_start=${MIN_PRICE}&price_end=${MAX_PRICE}`;

            console.log(`[Carousell] Navigating to ${searchUrl}`);

            // Sometimes Carousell shows a location or language modal. Stealth handles most Cloudflare stuff.
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

            // Wait to see if we hit a captcha or if the container loaded.
            // We wait for either a listing item to exist or for the page to settle.
            await page.waitForTimeout(5000);

            // Extract listing cards. Carousell's DOM changes often, but typically listings are in `div[data-testid^="listing-card-"]`
            // We'll search for anchor tags that link to listings
            const items = await page.$$('a[href^="/p/"]');

            for (const item of items) {
                try {
                    const href = await item.getAttribute('href');
                    if (!href) continue;

                    // Full URL
                    const urlStr = href.startsWith('http') ? href : `https://www.carousell.com.hk${href}`;

                    // ID is usually at the end of the URL like /p/mac-mini-m2-123456789/
                    const parts = href.split('-');
                    let originalId = parts[parts.length - 1];
                    if (originalId) {
                        originalId = originalId.replace(/\D/g, ''); // Ensure it's digits
                    }

                    if (!originalId) continue;

                    const id = `carousell_${originalId}`;

                    // Look inside the parent container for all <p> tags (the date is in a separate sibling anchor tag)
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
                        // Typical price on HK carousell is "HK$ 1,000"
                        if (text.includes('HK$')) {
                            price = text;
                        } else if (text.length > 5 && text.toLowerCase().includes('mac')) {
                            // A heuristic for title if we don't know the exact class name
                            title = text;
                        } else if (text.includes(' ago') || text.includes(' minute') || text.includes(' hour') || text.includes(' day') || text.includes(' month') || text.includes(' year')) {
                            // Carousell relative timestamps usually look like "5 hours ago", "2 days ago", etc.
                            // However, we only assign if it's very short to avoid grabbing descriptive text.
                            if (text.length < 25) {
                                postDate = text.trim();
                            }
                        }
                    }

                    // If we didn't find a title via heuristic, just use the parent's text and clean it
                    if (!title) {
                        const rawText = await item.textContent() || '';
                        // Just grab something descriptive
                        const lines = rawText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                        title = lines[0] || 'Unknown Title';
                    }

                    if (price && id && !listings.find(l => l.id === id)) {
                        listings.push({
                            id,
                            platform: 'carousell',
                            title: title.trim(),
                            price: price.trim(),
                            url: urlStr,
                            postDate: toAbsoluteDate(postDate)
                        });
                    }

                } catch (err) {
                    console.error(`[Carousell] Error parsing an item:`, err);
                }
            }

            console.log(`[Carousell] Found ${listings.length} items.`);

            // Dump HTML if we found 0 items, might be blocked
            if (listings.length === 0) {
                console.log(`[Carousell] No items found. We might be blocked or the selector changed.`);
                const html = await page.content();
                fs.writeFileSync('carousell_debug.html', html);
            }

        } catch (error) {
            console.error(`[Carousell] Scraping failed:`, error);
        } finally {
            await browser.close();
        }

        return listings;
    }
}
