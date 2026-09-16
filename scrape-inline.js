const { chromium } = require('playwright');

async function scrapeGoogleMaps(niche, location, maxResults = 25) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  const leads = [];

  try {
    const query = `${niche} in ${location}`;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
    console.log(`Scraping: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);

    // Scroll to load more results
    const scrollContainer = await page.$('[role="feed"]');
    if (scrollContainer) {
      for (let i = 0; i < 5; i++) {
        await scrollContainer.evaluate(el => el.scrollTop = el.scrollHeight);
        await page.waitForTimeout(1500);
      }
    }

    // Extract business listings
    const items = await page.$$('[role="feed"] > div > div > div[jsaction]');
    console.log(`Found ${items.length} listings`);

    for (let i = 0; i < Math.min(items.length, maxResults); i++) {
      try {
        const item = items[i];
        const name = await item.$eval('div[class*="fontHeadlineSmall"]', el => el.textContent).catch(() => null);
        if (!name) continue;

        const rating = await item.$eval('span[class*="kvMX8b"]', el => el.textContent).catch(() => null);
        const reviews = await item.$eval('span[aria-label*="review"]', el => el.textContent?.replace(/[^0-9]/g, '')).catch(() => null);
        const info = await item.$$eval('div[class*="fontBodyMedium"]', els => els.map(e => e.textContent).join(' | ')).catch(() => '');

        // Extract phone from info
        const phoneMatch = info.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        const phone = phoneMatch ? phoneMatch[0] : null;

        // Extract website
        const websiteMatch = info.match(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]{2,}/);
        const website = websiteMatch ? (websiteMatch[0].startsWith('http') ? websiteMatch[0] : 'https://' + websiteMatch[0]) : null;

        // Extract address for city/state
        const addressMatch = info.match(/([^|]+,\s*[A-Z]{2})/);
        let city = null, state = null;
        if (addressMatch) {
          const parts = addressMatch[1].split(',').map(s => s.trim());
          city = parts[0];
          state = parts[1];
        }

        leads.push({
          business_name: name,
          rating: rating ? parseFloat(rating) : null,
          reviews: reviews ? parseInt(reviews) : null,
          phone,
          website,
          city: city || location.split(',')[0],
          state: state || location.split(',')[1]?.trim() || '',
          niche,
          has_website: !!website,
          source: 'google_maps'
        });
      } catch(e) { continue; }
    }
  } catch(e) {
    console.error(`Scrape error: ${e.message}`);
  }

  await browser.close();
  return leads;
}

module.exports = { scrapeGoogleMaps };
