const https = require('https');

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'StellarsCRM/2.0 (contact@stellars.com)' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).setTimeout(15000, function() { this.destroy(); reject(new Error('timeout')); });
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'StellarsCRM/2.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

const NICHE_SEARCH = {
  'Pest Control': ['pest control', 'exterminator', 'pest management'],
  'Auto Detailing': ['auto detailing', 'car detailing', 'car wash'],
  'Painting': ['painting contractor', 'house painter', 'paint store'],
  'Fence': ['fence contractor', 'fencing company', 'fence installer'],
  'Landscaping': ['landscaping', 'lawn care', 'garden center'],
  'Pressure Washing': ['pressure washing', 'power washing', 'exterior cleaning'],
  'Cleaning': ['cleaning service', 'janitorial', 'house cleaning'],
  'Pool Service': ['pool service', 'pool cleaning', 'swimming pool maintenance'],
};

const CITY_COORDS = {
  'Houston': [29.76, -95.37], 'Dallas': [32.78, -96.80], 'San Antonio': [29.42, -98.49],
  'Austin': [30.27, -97.74], 'Fort Worth': [32.73, -97.33], 'El Paso': [31.76, -106.44],
  'Atlanta': [33.75, -84.39], 'Savannah': [32.08, -81.09], 'Augusta': [33.47, -81.97],
  'Miami': [25.76, -80.19], 'Tampa': [27.95, -82.46], 'Orlando': [28.54, -81.38],
  'Jacksonville': [30.33, -81.66], 'New York': [40.71, -74.01], 'Buffalo': [42.89, -78.88],
  'Phoenix': [33.45, -112.07], 'Tucson': [32.22, -110.97], 'Charlotte': [35.23, -80.84],
  'Raleigh': [35.78, -78.64], 'Nashville': [36.16, -86.78], 'Knoxville': [35.96, -83.92],
  'Los Angeles': [34.05, -118.24], 'San Diego': [32.72, -117.16], 'Las Vegas': [36.17, -115.14],
  'Chicago': [41.88, -87.63], 'Columbus': [39.96, -82.99], 'Cleveland': [41.50, -81.69],
  'Indianapolis': [39.77, -86.16], 'Seattle': [47.61, -122.33], 'Portland': [45.52, -122.68],
  'Denver': [39.74, -104.99], 'Kansas City': [39.10, -94.58], 'Oklahoma City': [35.47, -97.52],
  'Birmingham': [33.52, -86.81], 'Louisville': [38.25, -85.76], 'Memphis': [35.15, -90.05],
  'New Orleans': [29.95, -90.07], 'Pittsburgh': [40.44, -79.99], 'Philadelphia': [39.95, -75.17],
  'Baltimore': [39.29, -76.61], 'Richmond': [37.54, -77.43], 'Cincinnati': [39.10, -84.51],
  'Chattanooga': [35.05, -85.31], 'Arlington': [32.74, -97.11], 'Plano': [33.02, -96.70],
  'McKinney': [33.20, -96.62], 'Frisco': [33.15, -96.82], 'Lubbock': [33.58, -101.85],
  'Laredo': [27.50, -99.50], 'Irving': [32.81, -96.96], 'Garland': [32.91, -96.64],
  'Amarillo': [35.22, -101.83], 'Grand Prairie': [32.75, -97.02], 'Brownsville': [25.90, -97.50],
  'Pasadena': [29.70, -95.13], 'Mesquite': [32.77, -96.60],
};

function getCoords(city) {
  const clean = city.replace(/,\s*[A-Z]{2}$/, '').trim();
  return CITY_COORDS[clean] || null;
}

async function searchNominatim(query, lat, lon, limit = 20) {
  const q = encodeURIComponent(query);
  const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=${limit}&addressdetails=1&extratags=1`;
  const data = await httpGet(url);
  return JSON.parse(data);
}

async function scrapeGoogleMaps(niche, location, maxResults = 25) {
  const leads = [];
  const seen = new Set();

  try {
    const searchTerms = NICHE_SEARCH[niche] || [niche.toLowerCase()];
    const coords = getCoords(location);
    const cityName = location.split(',')[0]?.trim() || location;

    for (const term of searchTerms) {
      if (leads.length >= maxResults) break;
      const query = `${term} ${cityName}`;
      console.log(`  Nominatim search: "${query}"`);

      try {
        const results = await searchNominatim(query, coords?.[0], coords?.[1], 20);
        console.log(`  Got ${results.length} results`);

        for (const r of results) {
          const name = r.display_name?.split(',')[0]?.trim();
          if (!name || name.length < 3 || seen.has(name.toLowerCase())) continue;
          seen.add(name.toLowerCase());

          const phone = r.extrats?.phone || r.extrats?.['contact:phone'] || null;
          const website = r.extrats?.website || r.extrats?.['contact:website'] || null;

          leads.push({
            business_name: name,
            phone,
            website,
            city: r.address?.city || r.address?.town || r.address?.village || cityName,
            state: r.address?.state || location.split(',')[1]?.trim() || '',
            niche,
            has_website: !!website,
            source: 'openstreetmap',
            rating: null,
            reviews: null,
            latitude: parseFloat(r.lat) || null,
            longitude: parseFloat(r.lon) || null
          });

          if (leads.length >= maxResults) break;
        }
      } catch(e) {
        console.log(`  Search failed: ${e.message}`);
      }

      // Rate limit: Nominatim requires 1 req/sec
      await new Promise(r => setTimeout(r, 1200));
    }

    console.log(`  Total: ${leads.length} leads for "${niche} in ${location}"`);
  } catch(e) {
    console.error(`  Scrape error: ${e.message}`);
  }

  return leads;
}

module.exports = { scrapeGoogleMaps };
