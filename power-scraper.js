/**
 * Power Scraper v5 - Click-based extraction (proven to work)
 */

const { chromium } = require('playwright');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class PowerScraper {
  constructor(headless = true) { this.browser = null; this.page = null; this.errors = []; this.headless = headless; }

  async init() {
    this.browser = await chromium.launch({ headless: this.headless, channel: 'chrome', args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--window-size=1920,1080', '--disable-gpu'] });
    const ctx = await this.browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', viewport: { width: 1920, height: 1080 }, locale: 'en-US', timezoneId: 'America/Chicago' });
    await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); window.chrome = { runtime: {} }; });
    this.page = await ctx.newPage();
  }

  async close() { if (this.browser) await this.browser.close().catch(() => {}); }

  httpFetch(url) {
    return new Promise((resolve, reject) => {
      const u = new URL(url);
      const client = u.protocol === 'https:' ? https : http;
      const req = client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 15000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const redir = res.headers.location.startsWith('http') ? res.headers.location : `${u.protocol}//${u.host}${res.headers.location}`;
          return this.httpFetch(redir).then(resolve).catch(reject);
        }
        let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
  }

  async scrapeGoogleMaps(niche, city, state, maxResults = 20) {
    const results = [];
    const query = `${niche} in ${city}, ${state}`;
    console.log(`[Google Maps] Searching: ${query}`);

    try {
      await this.page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, { waitUntil: 'load', timeout: 30000 });
      await this.page.waitForTimeout(6000);

      // Scroll feed
      for (let i = 0; i < 5; i++) {
        await this.page.evaluate(() => { const f = document.querySelector('[role="feed"]'); if (f) f.scrollTop = f.scrollHeight; }).catch(() => {});
        await this.page.waitForTimeout(1500);
      }

      // Get listing names and hrefs from feed
      const listings = await this.page.evaluate(() => {
        const feed = document.querySelector('[role="feed"]');
        if (!feed) return [];
        const items = [];
        const seen = new Set();
        for (const a of feed.querySelectorAll('a[href*="/maps/place/"]')) {
          const name = a.getAttribute('aria-label');
          const href = a.getAttribute('href');
          if (name && name.length > 2 && !seen.has(name)) {
            seen.add(name);
            items.push({ name, href });
          }
        }
        return items;
      });
      console.log(`[Google Maps] Found ${listings.length} unique businesses`);

      // Click each to extract details
      for (let i = 0; i < Math.min(listings.length, maxResults); i++) {
        try {
          // Click by aria-label
          await this.page.evaluate((name) => {
            const feed = document.querySelector('[role="feed"]');
            for (const a of feed.querySelectorAll('a[href*="/maps/place/"]')) {
              if (a.getAttribute('aria-label') === name) { a.click(); return; }
            }
          }, listings[i].name);

          // Wait for panel to load - check for either phone OR website
          await this.page.waitForTimeout(2000);
          await this.page.waitForSelector('[data-item-id="authority"], button[data-item-id*="phone"]', { timeout: 3000 }).catch(() => {});
          await this.page.waitForTimeout(500);

          // Extract from panel
          const info = await this.page.evaluate(() => {
            // Website - PRIORITY (check multiple ways)
            let website = '';
            // Method 1: data-item-id="authority" element
            const auth = document.querySelector('[data-item-id="authority"]');
            if (auth) {
              const link = auth.querySelector('a');
              if (link) {
                const h = link.getAttribute('href');
                if (h && h.includes('http') && !h.includes('google')) website = h;
              }
              if (!website) {
                const h = auth.getAttribute('href');
                if (h && h.includes('http') && !h.includes('google')) website = h;
              }
            }
            // Method 2: aria-label containing "website"
            if (!website) {
              for (const el of document.querySelectorAll('a[aria-label*="website"], a[aria-label*="Website"]')) {
                const h = el.getAttribute('href');
                if (h && h.includes('http') && !h.includes('google')) { website = h; break; }
              }
            }
            // Method 3: any external link in the details panel
            if (!website) {
              for (const el of document.querySelectorAll('a[href^="http"]')) {
                const h = el.getAttribute('href');
                if (h && !h.includes('google') && !h.includes('youtube') && !h.includes('facebook') && !h.includes('twitter') && !h.includes('walmart')) {
                  website = h; break;
                }
              }
            }

            // Phone - multiple methods
            let phone = '';
            for (const btn of document.querySelectorAll('button[data-item-id*="phone"]')) {
              const m = btn.textContent.match(/[\+]?[\d\s\-\(\)]{10,}/);
              if (m) { phone = m[0].trim(); break; }
            }
            if (!phone) {
              for (const el of document.querySelectorAll('[data-item-id*="phone:tel:"]')) {
                const id = el.getAttribute('data-item-id');
                const m = id.match(/phone:tel:(.+)/);
                if (m) { phone = m[1]; break; }
              }
            }

            // Address
            let address = '';
            const addrBtn = document.querySelector('button[data-item-id="address"]');
            if (addrBtn) address = addrBtn.textContent.trim();

            // Rating & Reviews
            const ratingEl = document.querySelector('.MW4etd');
            const rating = ratingEl ? parseFloat(ratingEl.textContent) || 0 : 0;
            const reviewsEl = document.querySelector('.UY7F9');
            let reviews = 0;
            if (reviewsEl) { const rm = reviewsEl.textContent.match(/[\d,]+/); if (rm) reviews = parseInt(rm[0].replace(',', '')) || 0; }

            return { phone, website, address, rating, reviews };
          });

          const mapsUrl = listings[i].href.startsWith('http') ? listings[i].href : `https://www.google.com${listings[i].href}`;
          results.push({
            business_name: listings[i].name, phone: info.phone, website: info.website, address: info.address,
            city, state, niche, rating: info.rating, reviews: info.reviews,
            has_website: !!(info.website && info.website.startsWith('http')),
            google_maps: mapsUrl, source: 'google_maps'
          });
          console.log(`  [${i + 1}/${listings.length}] ${listings[i].name} | ${info.phone || '-'} | ${info.website || 'no website'}`);

          await this.page.goBack({ timeout: 5000 }).catch(() => {});
          await this.page.waitForTimeout(1500);

          // Verify feed is still visible, if not re-navigate
          const feedVisible = await this.page.evaluate(() => !!document.querySelector('[role="feed"]')).catch(() => false);
          if (!feedVisible) {
            await this.page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, { waitUntil: 'load', timeout: 30000 });
            await this.page.waitForTimeout(5000);
            // Re-scroll
            for (let j = 0; j < 3; j++) {
              await this.page.evaluate(() => { const f = document.querySelector('[role="feed"]'); if (f) f.scrollTop = f.scrollHeight; }).catch(() => {});
              await this.page.waitForTimeout(1000);
            }
          }
        } catch (e) {
          console.log(`  [${i + 1}] Error: ${e.message.substring(0, 80)}`);
          try { await this.page.goBack({ timeout: 3000 }).catch(() => {}); } catch(e2) {}
        }
      }
    } catch (e) {
      console.log(`[Google Maps] Failed: ${e.message.substring(0, 100)}`);
      this.errors.push({ source: 'google_maps', error: e.message });
    }
    return results;
  }

  async analyzeWebsite(url) {
    try {
      if (!url.startsWith('http')) url = 'https://' + url;
      const response = await this.httpFetch(url);
      const html = response.body;
      const h = html.toLowerCase();
      const issues = [];
      let score = 100;

      // Mobile viewport
      if (!html.includes('viewport')) { issues.push({ type: 'critical', message: 'No mobile viewport - NOT mobile-friendly' }); score -= 30; }

      // HTTPS
      if (!url.startsWith('https')) { issues.push({ type: 'critical', message: 'Not using HTTPS' }); score -= 20; }

      // Flash
      if (h.includes('flash') || h.includes('.swf')) { issues.push({ type: 'critical', message: 'Uses Flash - dead technology' }); score -= 25; }

      // Table layout
      if ((h.includes('bgcolor') || h.includes('cellpadding')) && h.includes('<table')) { issues.push({ type: 'warning', message: 'Table-based layout' }); score -= 15; }

      // Contact form - check raw HTML for form tags AND form builders
      const hasFormTag = html.includes('<form');
      const formBuilders = ['wpforms', 'contact-form-7', 'gravityform', 'typeform', 'jotform', 'hubspot', 'formstack', 'formsite', 'elementor-form'];
      const hasFormBuilder = formBuilders.some(fb => h.includes(fb));
      const hasContactClass = h.includes('class="contact') || h.includes('class="form') || h.includes('id="contact') || h.includes('id="form');
      if (!hasFormTag && !hasFormBuilder && !hasContactClass) {
        issues.push({ type: 'warning', message: 'No contact form detected' });
        score -= 10;
      }

      // Open Graph
      if (!html.includes('og:image')) { issues.push({ type: 'info', message: 'No Open Graph tags' }); score -= 5; }

      // Structured data
      if (!html.includes('application/ld+json')) { issues.push({ type: 'info', message: 'No structured data' }); score -= 3; }

      // jQuery
      if (h.includes('jquery') && !h.includes('jquery.min')) { issues.push({ type: 'info', message: 'Unminified jQuery' }); score -= 5; }

      // Framework detection from source code
      const frameworks = [];
      if (h.includes('wp-content') || h.includes('wordpress')) frameworks.push('WordPress');
      if (h.includes('shopify')) frameworks.push('Shopify');
      if (h.includes('wix.com') || h.includes('wixstatic')) frameworks.push('Wix');
      if (h.includes('squarespace')) frameworks.push('Squarespace');
      if (h.includes('webflow')) frameworks.push('Webflow');
      if (h.includes('godaddy') || h.includes('gdn')) frameworks.push('GoDaddy');
      if (h.includes('tailwindcss') || h.includes('tailwind')) frameworks.push('Tailwind');
      if (h.includes('bootstrap')) frameworks.push('Bootstrap');
      if (h.includes('react') || h.includes('__next')) frameworks.push('React');
      if (h.includes('vue') || h.includes('__nuxt')) frameworks.push('Vue/Nuxt');
      if (h.includes('angular')) frameworks.push('Angular');
      if (h.includes('svelte')) frameworks.push('Svelte');

      if (frameworks.length === 0) { issues.push({ type: 'info', message: 'No modern framework detected' }); score -= 5; }

      score = Math.max(0, Math.min(100, score));

      return {
        score,
        grade: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : score >= 20 ? 'D' : 'F',
        issues,
        frameworks,
        hasForm: hasFormTag || hasFormBuilder || hasContactClass,
        is_outdated: score < 50,
        recommendation: score < 40 ? 'URGENT - Needs rebuild' : score < 60 ? 'HIGH - Needs update' : score < 80 ? 'MEDIUM - Could improve' : 'LOW - Modern site'
      };
    } catch (e) {
      return { score: 0, grade: 'F', issues: [{ type: 'error', message: e.message }], is_outdated: true, recommendation: 'Could not analyze' };
    }
  }

  scoreLead(lead) {
    let score = 50;
    if (!lead.has_website) score += 25; else if (lead.is_outdated) score += 20; else score -= 15;
    if (lead.phone && lead.phone.length >= 10) score += 10;
    if (lead.reviews >= 50) score += 10; else if (lead.reviews >= 20) score += 7; else if (lead.reviews >= 5) score += 3;
    if (lead.rating >= 4.5) score += 5; else if (lead.rating >= 4.0) score += 3;
    if (!lead.phone) score -= 25;
    score = Math.max(0, Math.min(100, score));
    let category, priority;
    if (score >= 75) { category = 'hot'; priority = 'HIGH'; }
    else if (score >= 55) { category = 'warm'; priority = 'MEDIUM'; }
    else if (score >= 35) { category = 'cold'; priority = 'LOW'; }
    else { category = 'skip'; priority = 'SKIP'; }
    return { score, category, priority };
  }

  dedupe(leads) {
    const seen = new Map();
    for (const l of leads) {
      const key = (l.business_name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || key.length < 3) continue;
      if (!seen.has(key) || (l.phone && !seen.get(key).phone)) seen.set(key, l);
    }
    return Array.from(seen.values());
  }

  async search(niche, city, state, maxResults = 20) {
    console.log(`\n========== SCRAPING: ${niche} in ${city}, ${state} ==========\n`);
    let googleResults = [];
    try {
      await this.init();
      googleResults = await this.scrapeGoogleMaps(niche, city, state, maxResults);
    } catch (e) { console.log(`Init failed: ${e.message}`); this.errors.push({ source: 'init', error: e.message }); }
    finally { await this.close(); }

    let merged = this.dedupe(googleResults);
    console.log(`After dedup: ${merged.length}`);

    for (const lead of merged) {
      if (lead.has_website && lead.website) {
        const analysis = await this.analyzeWebsite(lead.website).catch(() => null);
        if (analysis) { lead.website_score = analysis.score; lead.website_grade = analysis.grade; lead.website_analysis = analysis; lead.is_outdated = analysis.is_outdated; }
      }
      const scored = this.scoreLead({ ...lead, is_outdated: lead.is_outdated || false });
      lead.score = scored.score; lead.category = scored.category; lead.priority = scored.priority;
    }
    merged.sort((a, b) => b.score - a.score);
    console.log(`\nHOT: ${merged.filter(l => l.category === 'hot').length} | WARM: ${merged.filter(l => l.category === 'warm').length} | COLD: ${merged.filter(l => l.category === 'cold').length} | SKIP: ${merged.filter(l => l.category === 'skip').length}`);
    return merged.slice(0, maxResults);
  }
}

module.exports = { PowerScraper };
