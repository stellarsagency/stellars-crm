const https = require('https');

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
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

// Map niche names to OpenStreetMap tags
const NICHE_TAGS = {
  'Pest Control': 'shop=pest_control',
  'Auto Detailing': 'shop=car_repair',
  'Painting': 'craft=painter',
  'Fence': 'craft=fence',
  'Landscaping': 'shop=garden_centre|craft=landscaper',
  'Pressure Washing': 'shop=pressure_washing',
  'Cleaning': 'shop=cleaning',
  'Pool Service': 'leisure=swimming_pool',
};

// City coordinates for Overpass queries
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
  'Chattanooga': [35.05, -85.31], 'Chandler': [33.30, -111.84], 'Gilbert': [33.35, -111.79],
  'Mesa': [33.42, -111.83], 'Scottsdale': [33.49, -111.93], 'Greensboro': [36.07, -79.79],
};

function getCoords(city) {
  const clean = city.replace(/,\s*[A-Z]{2}$/, '').trim();
  return CITY_COORDS[clean] || null;
}

async function scrapeGoogleMaps(niche, location, maxResults = 25) {
  const leads = [];

  try {
    const tags = NICHE_TAGS[niche] || 'shop=yes';
    const coords = getCoords(location);

    if (!coords) {
      console.log(`  No coords for "${location}", using search`);
      // Fallback: search by city name in Overpass
      const query = `[out:json][timeout:25];area[name="${location.split(',')[0]}"]->.a;(node["name"](area.a);way["name"](area.a););out body;`;
      const body = JSON.stringify({ data: query });
      const url = `https://overpass-api.de/api/interpreter`;
      const data = await httpPost(url, body);
      const parsed = JSON.parse(data);
      // Filter by niche-related elements
      const elements = (parsed.elements || []).filter(e => e.tags && e.tags.name && (e.tags.phone || e.tags.website || e.tags['contact:phone']));
      for (const el of elements.slice(0, maxResults)) {
        leads.push({
          business_name: el.tags.name,
          phone: el.tags.phone || el.tags['contact:phone'] || null,
          website: el.tags.website || el.tags['contact:website'] || null,
          city: location.split(',')[0]?.trim() || location,
          state: location.split(',')[1]?.trim() || '',
          niche,
          has_website: !!el.tags.website,
          source: 'openstreetmap',
          rating: null,
          reviews: null
        });
      }
      console.log(`  Found ${leads.length} from OSM area search`);
      return leads;
    }

    // Bounding box around coordinates (roughly 20km)
    const lat = coords[0], lon = coords[1];
    const delta = 0.15;
    const south = lat - delta, north = lat + delta;
    const west = lon - delta, east = lon + delta;

    // Build Overpass query
    const tagParts = tags.split('|').map(t => {
      const [key, val] = t.split('=');
      return val ? `["${key}"="${val}"]` : `["${key}"]`;
    });
    const tagQuery = tagParts.join('|');

    const query = `
[out:json][timeout:25];
(
  node${tagQuery}(${south},${west},${north},${east});
  way${tagQuery}(${south},${west},${north},${east});
);
out body;
>;
out skel qt;`;

    console.log(`  Overpass query for ${niche} in ${location} (${lat},${lon})`);
    const body = JSON.stringify({ data: query });
    const url = `https://overpass-api.de/api/interpreter`;
    const data = await httpPost(url, body);
    const parsed = JSON.parse(data);

    const elements = parsed.elements || [];
    console.log(`  Got ${elements.length} elements from Overpass`);

    for (const el of elements) {
      if (!el.tags || !el.tags.name) continue;
      const phone = el.tags.phone || el.tags['contact:phone'] || null;
      const website = el.tags.website || el.tags['contact:website'] || null;

      leads.push({
        business_name: el.tags.name,
        phone,
        website,
        city: location.split(',')[0]?.trim() || location,
        state: location.split(',')[1]?.trim() || '',
        niche,
        has_website: !!website,
        source: 'openstreetmap',
        rating: null,
        reviews: null,
        latitude: el.lat || null,
        longitude: el.lon || null
      });

      if (leads.length >= maxResults) break;
    }

    console.log(`  Found ${leads.length} businesses for "${niche} in ${location}"`);
  } catch(e) {
    console.error(`  Scrape error: ${e.message}`);
  }

  return leads;
}

module.exports = { scrapeGoogleMaps };
