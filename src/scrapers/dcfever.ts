import { setupBrowser, type Scraper } from './core';
import { type Listing } from '../db';
import { toAbsoluteDate } from '../utils';
import { MIN_PRICE, MAX_PRICE } from '../index';

export class DCFeverScraper implements Scraper {
    name = 'DCFever';

    async search(keyword: string): Promise<Listing[]> {
        const { browser, page } = await setupBrowser();
        const listings: Listing[] = [];

        try {
            // URL encode the keyword
            const encodedQuery = encodeURIComponent(keyword);
            const searchUrl = `https://www.dcfever.com/trading/search.php?keyword=${encodedQuery}&type=all&main_cat=&min_price=${MIN_PRICE}&max_price=${MAX_PRICE}&advance=false&form_action=search_action`;

            console.log(`[DCFever] Navigating to ${searchUrl}`);
            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for at least one listing item or the "no results" element
            await page.waitForSelector('.item_listing, .search_result_heading', { timeout: 15000 }).catch(() => null);

            // Extract the listings
            const items = await page.$$('.col-xs-6.col-md-3 a');

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
                        // Clean up image tags if they have icons
                        price = price.replace(/<img[^>]*>/g, '').trim();
                    }

                    // Find the post date (usually in the second meta_item next to the price)
                    const metaItems = await item.$$('.meta_item');
                    let postDate = '';
                    if (metaItems.length > 1) {
                        const dateText = await metaItems[1]?.textContent() || '';
                        // The text looks like "username 333 日前". We want the part after the username.
                        const lines = dateText.split('\n');
                        if (lines.length > 1 && lines[lines.length - 1]) {
                            postDate = lines[lines.length - 1]!.trim();
                        } else {
                            // Fallback if no clear newline
                            postDate = dateText.split(/\s+/).slice(-2).join(' ').trim();
                        }
                    }

                    listings.push({
                        id,
                        platform: 'dcfever',
                        title: title.trim(),
                        price: price.trim(),
                        url: href,
                        postDate: toAbsoluteDate(postDate)
                    });
                } catch (err) {
                    console.error(`[DCFever] Error parsing an item:`, err);
                }
            }

            console.log(`[DCFever] Found ${listings.length} items.`);

            // Dump HTML if we found 0 items, might be blocked or selector changed
            if (listings.length === 0) {
                console.log(`[DCFever] No items found. Dumping HTML...`);
                const html = await page.content();
                import('fs').then(fs => fs.writeFileSync('dcfever_debug.html', html));
            }
        } catch (error) {
            console.error(`[DCFever] Scraping failed:`, error);
        } finally {
            await browser.close();
        }

        return listings;
    }
}
