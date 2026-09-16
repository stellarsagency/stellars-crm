const https = require('https');
const http = require('http');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).setTimeout(15000, function() { this.destroy(); reject(new Error('timeout')); });
  });
}

const NICHE_YELLOWPAGES = {
  'Pest Control': 'pest-control',
  'Auto Detailing': 'auto-detailing',
  'Painting': 'painters',
  'Fence': 'fences',
  'Landscaping': 'landscaping',
  'Pressure Washing': 'pressure-washers',
  'Cleaning': 'cleaning-services',
  'Pool Service': 'pool-service',
  'Handyman': 'handyman',
  'Tattoo': 'tattoo-parlors',
  'Concrete': 'concrete-contractors',
};

function parseYellowPages(html) {
  const leads = [];
  const nameRegex = /class="business-name"[^>]*>.*?<a[^>]*>([^<]+)<\/a>/gi;
  const phoneRegex = /class="phones[^"]*"[^>]*>([^<]+)/gi;
  const websiteRegex = /class="track-visit-website"[^>]*href="([^"]+)"/gi;
  const addressRegex = /class="street-address"[^>]*>([^<]+)/gi;
  const localityRegex = /class="locality"[^>]*>([^<]+)/gi;
  const ratingRegex = /class="result-rating[^"]*"[^>]*>/gi;

  const names = [];
  const phones = [];
  const websites = [];
  const addresses = [];
  const localities = [];

  let m;
  while ((m = nameRegex.exec(html)) !== null) names.push(m[1].trim());
  while ((m = phoneRegex.exec(html)) !== null) phones.push(m[1].trim());
  while ((m = websiteRegex.exec(html)) !== null) websites.push(m[1]);
  while ((m = addressRegex.exec(html)) !== null) addresses.push(m[1].trim());
  while ((m = localityRegex.exec(html)) !== null) localities.push(m[1].trim());

  for (let i = 0; i < names.length; i++) {
    if (!names[i] || names[i].length < 3) continue;
    leads.push({
      business_name: names[i],
      phone: phones[i] || null,
      website: websites[i] || null,
      address: addresses[i] || null,
      city: localities[i] || null,
      has_website: !!websites[i] && websites[i].length > 5,
    });
  }
  return leads;
}

async function scrapeGoogleMaps(niche, location, maxResults = 30) {
  const ypSlug = NICHE_YELLOWPAGES[niche];
  if (!ypSlug) {
    console.log(`  No Yellow Pages slug for "${niche}", using generic search`);
  }

  const leads = [];
  const seen = new Set();
  const cityName = location.split(',')[0]?.trim() || location;
  const stateCode = location.split(',')[1]?.trim() || '';

  // Try multiple search approaches
  const searchUrls = [];

  if (ypSlug) {
    searchUrls.push({
      url: `https://www.yellowpages.com/search?search_terms=${ypSlug}&geo_location_terms=${encodeURIComponent(cityName + ', ' + stateCode)}&page=1`,
      source: 'yellowpages'
    });
  }

  // Also try direct search
  searchUrls.push({
    url: `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(niche.toLowerCase())}&geo_location_terms=${encodeURIComponent(cityName + ', ' + stateCode)}&page=1`,
    source: 'yellowpages'
  });

  for (const search of searchUrls) {
    if (leads.length >= maxResults) break;

    try {
      console.log(`  Yellow Pages: ${niche} in ${cityName}, ${stateCode}`);
      const html = await httpGet(search.url);

      if (html.includes('robot') || html.includes('captcha') || html.includes('blocked')) {
        console.log(`  Yellow Pages: blocked/captcha detected`);
        continue;
      }

      const parsed = parseYellowPages(html);
      console.log(`  Got ${parsed.length} results from Yellow Pages`);

      for (const lead of parsed) {
        const key = lead.business_name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        // Basic website analysis
        let website_analysis = null;
        if (lead.website) {
          website_analysis = { is_outdated: false, has_mobile: true, has_ssl: lead.website.startsWith('https') };
        }

        leads.push({
          ...lead,
          city: cityName,
          state: stateCode,
          niche,
          source: 'yellowpages',
          rating: null,
          reviews: null,
          latitude: null,
          longitude: null,
          website_analysis,
        });

        if (leads.length >= maxResults) break;
      }
    } catch(e) {
      console.log(`  Yellow Pages error: ${e.message}`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`  Total: ${leads.length} leads for "${niche} in ${cityName}, ${stateCode}"`);
  return leads;
}

module.exports = { scrapeGoogleMaps };
