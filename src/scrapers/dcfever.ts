import { withTimeout, type Scraper } from './core';
import { type Listing } from '../db';
import { toAbsoluteDate } from '../utils';
import { MIN_PRICE, MAX_PRICE } from '../index';
import { type Page } from 'playwright';

const SCRAPER_TIMEOUT_MS = 90_000; // 90 seconds max for entire scrape

export class DCFeverScraper implements Scraper {
    name = 'DCFever';

    async search(keyword: string, page: Page): Promise<Listing[]> {
        return withTimeout(this._doSearch(keyword, page), SCRAPER_TIMEOUT_MS, 'DCFever search');
    }

    private async _doSearch(keyword: string, page: Page): Promise<Listing[]> {
        const listings: Listing[] = [];

        // URL encode the keyword
        const encodedQuery = encodeURIComponent(keyword);
        const searchUrl = `https://www.dcfever.com/trading/search.php?keyword=${encodedQuery}&type=all&main_cat=&min_price=${MIN_PRICE}&max_price=${MAX_PRICE}&advance=false&form_action=search_action`;

        console.log(`[DCFever] Navigating to ${searchUrl}`);
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        console.log(`[DCFever] Page loaded (domcontentloaded).`);

        // Wait for at least one listing item or the "no results" element
        console.log(`[DCFever] Waiting for selectors...`);
        await page.waitForSelector('.item_listing, .search_result_heading', { timeout: 15000 }).catch(() => {
            console.log(`[DCFever] Selector wait timed out (15s), proceeding anyway.`);
        });

        // Extract the listings
        console.log(`[DCFever] Extracting listing elements...`);
        const items = await page.$$('.col-xs-6.col-md-3 a');
        console.log(`[DCFever] Found ${items.length} raw elements to parse.`);

        for (const item of items) {
            try {
                // Extract ID and URL from the parent link
                let href = await item.getAttribute('href') || '';
                if (!href.includes('view.php?id=')) continue;

                // Complete the relative URL
                if (href && !href.startsWith('http')) {
                    href = `https://www.dcfever.com/trading/${href}`;
                }

                // Extract the ID from the URL (e.g., view.php?id=1234567)
                const idMatch = href.match(/id=(\d+)/);
                if (!idMatch) continue;
                const originalId = idMatch[1];
                const id = `dcfever_${originalId}`;

                // Find the title
                const titleElement = await item.$('.trade_title');
                if (!titleElement) continue;
                const title = await titleElement.textContent() || '';

                // Find the price
                const priceElement = await item.$('.price');
                let price = 'HK$???';
                if (priceElement) {
                    price = await priceElement.textContent() || 'HK$???';
                    price = price.replace(/<img[^>]*>/g, '').trim();
                }

                // Find the post date
                const metaItems = await item.$$('.meta_item');
                let postDate = '';
                if (metaItems.length > 1) {
                    const dateText = await metaItems[1]?.textContent() || '';
                    const lines = dateText.split('\n');
                    if (lines.length > 1 && lines[lines.length - 1]) {
                        postDate = lines[lines.length - 1]!.trim();
                    } else {
                        postDate = dateText.split(/\s+/).slice(-2).join(' ').trim();
                    }
                }

                if (!listings.find(l => l.id === id)) {
                    listings.push({
                        id,
                        platform: 'dcfever',
                        title: title.trim(),
                        price: price.trim(),
                        url: href,
                        postedAt: toAbsoluteDate(postDate)
                    });
                }
            } catch (err) {
                console.error(`[DCFever] Error parsing an item:`, err);
            }
        }

        console.log(`[DCFever] Found ${listings.length} items.`);

        if (listings.length === 0) {
            console.log(`[DCFever] No items found. Dumping debug info...`);
            try {
                const html = await page.content();
                const fs = await import('fs');
                fs.writeFileSync('dcfever_debug.html', html);
                await page.screenshot({ path: 'dcfever_debug.png', fullPage: true });
                console.log(`[DCFever] Debug HTML and screenshot saved.`);
            } catch (debugErr) {
                console.error(`[DCFever] Failed to save debug info:`, debugErr);
            }
        }

        return listings;
    }
}
