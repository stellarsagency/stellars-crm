const { PowerScraper } = require('./power-scraper');
async function live() {
  console.log('Opening Chrome... Watch it scrape Google Maps LIVE!\n');
  const s = new PowerScraper();
  // Override to headed mode so user can watch
  s.browser = await require('playwright').chromium.launch({ headless: false, channel: 'chrome', args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const ctx = await s.browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', viewport: { width: 1920, height: 1080 }, locale: 'en-US', timezoneId: 'America/Chicago' });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); window.chrome = { runtime: {} }; });
  s.page = await ctx.newPage();

  const results = await s.scrapeGoogleMaps('Pest Control', 'Dallas', 'TX', 8);
  
  console.log('\n========== RESULTS ==========');
  for (const r of results) {
    console.log(r.business_name + ' | ' + (r.phone || '-') + ' | ' + (r.website || 'no website'));
  }
  console.log('\nDone! Closing in 5 seconds...');
  await new Promise(r => setTimeout(r, 5000));
  await s.close();
  process.exit(0);
}
live().catch(e => { console.error(e); process.exit(1); });
