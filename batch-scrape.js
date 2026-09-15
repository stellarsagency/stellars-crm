/**
 * Goal-based batch scraper - keeps scraping until goal is met
 * Usage: node batch-scrape.js <niche> <city> <state> <goalCount> <goalType>
 */
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const scraperDir = path.join(__dirname, '..', 'maps-scrapper');
const outputDir = path.join(scraperDir, 'output');
const resultFile = path.join(__dirname, 'scrape-results.json');
const progressFile = path.join(__dirname, 'scrape-progress.json');

const [,, niche, city, state, goalCountStr, goalType] = process.argv;
const goalCount = parseInt(goalCountStr) || 50;

function writeProgress(msg, found, goal) {
  try { fs.writeFileSync(progressFile, JSON.stringify({ message: msg, found, goal, updated: Date.now() })); } catch(e) {}
}

function getSearchLocations(city, state) {
  const c = city.toLowerCase();
  
  // Full state lists
  const stateLists = {
    '__state_tx': ['Houston, TX', 'Dallas, TX', 'San Antonio, TX', 'Austin, TX', 'Fort Worth, TX', 'El Paso, TX', 'Arlington, TX', 'Corpus Christi, TX', 'Plano, TX', 'Lubbock, TX', 'Laredo, TX', 'Irving, TX', 'Garland, TX', 'Amarillo, TX', 'Grand Prairie, TX', 'Brownsville, TX', 'McKinney, TX', 'Frisco, TX', 'Pasadena, TX', 'Mesquite, TX', 'Killeen, TX', 'McAllen, TX', 'Midland, TX', 'Beaumont, TX', 'Denton, TX', 'Carrollton, TX', 'Round Rock, TX', 'Abilene, TX', 'Pearland, TX', 'Sugar Land, TX'],
    '__state_ga': ['Atlanta, GA', 'Augusta, GA', 'Savannah, GA', 'Athens, GA', 'Sandy Springs, GA', 'Roswell, GA', 'Macon, GA', 'Johns Creek, GA', 'Albany, GA', 'Marietta, GA', 'Warner Robins, GA', 'Alpharetta, GA', 'Smyrna, GA', 'Valdosta, GA', 'Dunwoody, GA', 'Rome, GA', 'Gainesville, GA', 'Peachtree Corners, GA', 'Newnan, GA', 'Dalton, GA'],
    '__state_fl': ['Miami, FL', 'Tampa, FL', 'Orlando, FL', 'Jacksonville, FL', 'St. Petersburg, FL', 'Tallahassee, FL', 'Fort Lauderdale, FL', 'Cape Coral, FL', 'Pembroke Pines, FL', 'Hollywood, FL', 'Gainesville, FL', 'Miramar, FL', 'Coral Springs, FL', 'Clearwater, FL', 'Palm Bay, FL', 'West Palm Beach, FL', 'Lakeland, FL', 'Pompano Beach, FL', 'Boca Raton, FL', 'Sarasota, FL'],
    '__state_ny': ['New York, NY', 'Buffalo, NY', 'Rochester, NY', 'Yonkers, NY', 'Syracuse, NY', 'Albany, NY', 'New Rochelle, NY', 'Mount Vernon, NY', 'Schenectady, NY', 'Utica, NY', 'Binghamton, NY', 'Tonawanda, NY', 'Troy, NY', 'Niagara Falls, NY', 'White Plains, NY', 'Hempstead, NY', 'Islip, NY', 'Babylon, NY', 'Huntington, NY', 'Stamford, CT'],
    '__state_az': ['Phoenix, AZ', 'Tucson, AZ', 'Mesa, AZ', 'Chandler, AZ', 'Scottsdale, AZ', 'Gilbert, AZ', 'Glendale, AZ', 'Tempe, AZ', 'Peoria, AZ', 'Surprise, AZ', 'Yuma, AZ', 'Flagstaff, AZ', 'Goodyear, AZ', 'Lake Havasu City, AZ', 'Buckeye, AZ', 'Avondale, AZ', 'Sedona, AZ', 'Prescott, AZ', 'Sierra Vista, AZ', 'Casa Grande, AZ'],
    '__state_nc': ['Charlotte, NC', 'Raleigh, NC', 'Greensboro, NC', 'Winston-Salem, NC', 'Durham, NC', 'Fayetteville, NC', 'Cary, NC', 'Wilmington, NC', 'High Point, NC', 'Greenville, NC', 'Asheville, NC', 'Concord, NC', 'Gastonia, NC', 'Chapel Hill, NC', 'Jacksonville, NC', 'Burlington, NC', 'Rocky Mount, NC', 'Huntersville, NC', 'Mooresville, NC', 'Hendersonville, NC'],
    '__state_tn': ['Memphis, TN', 'Nashville, TN', 'Knoxville, TN', 'Chattanooga, TN', 'Clarksville, TN', 'Murfreesboro, TN', 'Franklin, TN', 'Johnson City, TN', 'Bartlett, TN', 'Hendersonville, TN', 'Kingsport, TN', 'Collierville, TN', 'Smyrna, TN', 'Germantown, TN', 'Brentwood, TN', 'Jackson, TN', 'Oak Ridge, TN', 'Mount Juliet, TN', 'La Vergne, TN', 'Cookeville, TN']
  };
  if (stateLists[c]) return stateLists[c];
  
  const smallCityGroups = {
    '__small_tx': ['League City, TX', 'Sugar Land, TX', 'Katy, TX', 'Pearland, TX', 'Cypress, TX', 'Frisco, TX', 'McKinney, TX', 'Allen, TX', 'Plano, TX', 'Round Rock, TX', 'Cedar Park, TX', 'Leander, TX', 'Georgetown, TX', 'Kyle, TX', 'Buda, TX', 'New Braunfels, TX', 'San Marcos, TX', 'Boerne, TX', 'Helotes, TX', 'Converse, TX'],
    '__small_ga': ['Alpharetta, GA', 'Roswell, GA', 'Kennesaw, GA', 'Lawrenceville, GA', 'Duluth, GA', 'Johns Creek, GA', 'Suwanee, GA', 'Buford, GA', 'Snellville, GA', 'Conyers, GA', 'Woodstock, GA', 'Canton, GA', 'Marietta, GA', 'Decatur, GA', 'Smyrna, GA', 'Lilburn, GA', 'Norcross, GA', 'Stone Mountain, GA', 'Mableton, GA', 'Newnan, GA'],
    '__small_fl': ['Coral Gables, FL', 'Aventura, FL', 'Plantation, FL', 'Sunrise, FL', 'Pembroke Pines, FL', 'Miramar, FL', 'Boca Raton, FL', 'Delray Beach, FL', 'Boynton Beach, FL', 'Wellington, FL', 'Cape Coral, FL', 'Fort Myers, FL', 'Naples, FL', 'Sarasota, FL', 'Bradenton, FL', 'Lakeland, FL', 'Winter Haven, FL', 'Palm Harbor, FL', 'Dunedin, FL', 'Largo, FL'],
    '__small_ny': ['White Plains, NY', 'New Rochelle, NY', 'Yonkers, NY', 'Mount Vernon, NY', 'Long Beach, NY', 'Hempstead, NY', 'Garden City, NY', 'Mineola, NY', 'Freeport, NY', 'Valley Stream, NY', 'Hicksville, NY', 'Levittown, NY', 'Massapequa, NY', 'Brentwood, NY', 'Bay Shore, NY', 'Islip, NY', 'Babylon, NY', 'Huntington, NY', 'Stamford, CT', 'Greenwich, CT'],
    '__small_az': ['Scottsdale, AZ', 'Chandler, AZ', 'Gilbert, AZ', 'Mesa, AZ', 'Tempe, AZ', 'Peoria, AZ', 'Surprise, AZ', 'Goodyear, AZ', 'Buckeye, AZ', 'Avondale, AZ', 'Queen Creek, AZ', 'Maricopa, AZ', 'Fountain Hills, AZ', 'Paradise Valley, AZ', 'Sedona, AZ', 'Prescott, AZ', 'Flagstaff, AZ', 'Sierra Vista, AZ', 'Casa Grande, AZ', 'Lake Havasu City, AZ'],
    '__small_nc': ['Huntersville, NC', 'Mooresville, NC', 'Concord, NC', 'Gastonia, NC', 'Matthews, NC', 'Mint Hill, NC', 'Indian Trail, NC', 'Rock Hill, SC', 'Spartanburg, SC', 'Greenville, SC', 'Salisbury, NC', 'Kannapolis, NC', 'Statesville, NC', 'Shelby, NC', 'Forest City, NC', 'Asheville, NC', 'Boone, NC', 'Hendersonville, NC', 'Brevard, NC', 'Burlington, NC'],
    '__small_tn': ['Murfreesboro, TN', 'Franklin, TN', 'Clarksville, TN', 'Lebanon, TN', 'Hendersonville, TN', 'Gallatin, TN', 'Smyrna, TN', 'La Vergne, TN', 'Mount Juliet, TN', 'Spring Hill, TN', 'Columbia, TN', 'Shelbyville, TN', 'Tullahoma, TN', 'Cookeville, TN', 'Cleveland, TN', 'Athens, TN', 'Manchester, TN', 'Crossville, TN', 'Springfield, TN', 'Portland, TN']
  };
  if (smallCityGroups[c]) return smallCityGroups[c];
  
  const metros = {
    'houston': ['Houston, TX', 'Katy, TX', 'Sugar Land, TX', 'Pearland, TX', 'Spring, TX', 'Cypress, TX', 'League City, TX', 'Missouri City, TX', 'Pasadena, TX', 'Bellaire, TX', 'Woodlands, TX', 'Conroe, TX'],
    'dallas': ['Dallas, TX', 'Fort Worth, TX', 'Arlington, TX', 'Plano, TX', 'Irving, TX', 'Garland, TX', 'Frisco, TX', 'McKinney, TX', 'Mesquite, TX', 'Grand Prairie, TX'],
    'new york': ['New York, NY', 'Brooklyn, NY', 'Queens, NY', 'Bronx, NY', 'Staten Island, NY', 'Yonkers, NY', 'New Rochelle, NY', 'Mount Vernon, NY', 'Hempstead, NY', 'Islip, NY', 'Babylon, NY', 'Huntington, NY', 'Jersey City, NJ', 'Newark, NJ', 'Paterson, NJ', 'Elizabeth, NJ', 'Stamford, CT', 'White Plains, NY', 'Garden City, NY', 'Hicksville, NY'],
    'phoenix': ['Phoenix, AZ', 'Scottsdale, AZ', 'Mesa, AZ', 'Chandler, AZ', 'Tempe, AZ', 'Glendale, AZ', 'Gilbert, AZ', 'Peoria, AZ', 'Surprise, AZ', 'Goodyear, AZ'],
    'miami': ['Miami, FL', 'Fort Lauderdale, FL', 'Hialeah, FL', 'Hollywood, FL', 'Coral Gables, FL', 'Pompano Beach, FL', 'Boca Raton, FL', 'West Palm Beach, FL', 'Doral, FL', 'Plantation, FL'],
    'atlanta': ['Atlanta, GA', 'Smyrna, GA', 'Roswell, GA', 'Alpharetta, GA', 'Marietta, GA', 'Decatur, GA', 'Lawrenceville, GA', 'Duluth, GA', 'Johns Creek, GA', 'Stone Mountain, GA', 'Kennesaw, GA', 'Woodstock, GA'],
    'nashville': ['Nashville, TN', 'Murfreesboro, TN', 'Franklin, TN', 'Clarksville, TN', 'Lebanon, TN', 'Hendersonville, TN', 'Gallatin, TN', 'Smyrna, TN'],
    'charlotte': ['Charlotte, NC', 'Concord, NC', 'Gastonia, NC', 'Huntersville, NC', 'Mooresville, NC', 'Rock Hill, SC', 'Matthews, NC', 'Mint Hill, NC'],
    'tampa': ['Tampa, FL', 'St. Petersburg, FL', 'Clearwater, FL', 'Brandon, FL', 'Lakeland, FL', 'Plant City, FL', 'Wesley Chapel, FL', 'Palm Harbor, FL'],
    'san antonio': ['San Antonio, TX', 'New Braunfels, TX', 'San Marcos, TX', 'Seguin, TX', 'Schertz, TX', 'Live Oak, TX', 'Boerne, TX', 'Helotes, TX'],
    'austin': ['Austin, TX', 'Round Rock, TX', 'Cedar Park, TX', 'Georgetown, TX', 'Pflugerville, TX', 'San Marcos, TX', 'Leander, TX', 'Kyle, TX']
  };
  for (const [key, cities] of Object.entries(metros)) {
    if (c.includes(key)) return cities;
  }
  return [`${city}, ${state || ''}`];
}

async function run() {
  const locations = getSearchLocations(city, state);
  const seen = new Set();
  const allLeads = [];
  let citiesSearched = 0;
  let goalMet = false;

  console.log(`Goal: ${goalCount} ${goalType} leads from ${niche} in ${city}`);
  console.log(`Locations: ${locations.length} cities to search`);

  for (let i = 0; i < locations.length && !goalMet; i += 5) {
    const batch = locations.slice(i, i + 5);
    writeProgress(`Searching ${batch.join(', ')}...`, allLeads.length, goalCount);
    console.log(`Batch ${Math.floor(i/5)+1}: ${batch.join(', ')}`);

    await Promise.all(batch.map(loc => new Promise((resolve) => {
      try {
        const child = exec(`node dist/index.js run -q "${niche}" -l "${loc}" -m 25 --headless true --min-delay 100 --max-delay 300`, { cwd: scraperDir, timeout: 60000, windowsHide: true });
        child.on('close', () => resolve());
        child.on('error', () => resolve());
        setTimeout(resolve, 65000); // Safety timeout
      } catch(e) { resolve(); }
    })));

    citiesSearched += batch.length;

    // Wait for files to be written
    await new Promise(r => setTimeout(r, 2000));

    // Read output files
    try {
      const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.json'));
      console.log(`  Found ${files.length} output files`);
      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(outputDir, file), 'utf8');
          const raw = JSON.parse(content);
          if (!Array.isArray(raw)) continue;
          // Extract city/state from filename: painting-new-york-ny-2026-... -> new york, NY
          const fileParts = file.replace(/\.json$/, '').split('-');
          const stateCode = fileParts[fileParts.length - 5]?.toUpperCase() || state || '';
          const cityName = fileParts.slice(1, fileParts.length - 5).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          for (const item of raw) {
            const key = (item.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (key && !seen.has(key)) {
              seen.add(key);
              allLeads.push({
                business_name: item.name || '',
                phone: item.phone || '',
                website: item.website || '',
                address: item.address || '',
                city: item.address?.split(',')[0] || cityName || city,
                state: stateCode || state || '',
                niche,
                rating: item.rating || 0,
                reviews: item.reviewCount || 0,
                category: 'warm',
                has_website: !!item.website,
                maps_url: item.url || '',
                latitude: item.lat || null,
                longitude: item.lng || null
              });
            }
          }
        } catch(e) { console.log(`  Error reading ${file}: ${e.message}`); }
      }
    } catch(e) { console.log(`  Error listing output: ${e.message}`); }

    console.log(`  Total: ${allLeads.length} leads (${allLeads.filter(l => !l.has_website).length} no website)`);

    // Clean output files for next batch
    try {
      fs.readdirSync(outputDir).filter(f => f.endsWith('.json')).forEach(f => fs.unlinkSync(path.join(outputDir, f)));
    } catch(e) {}

    // Check goal
    if (goalType === 'no_website') {
      const noWebCount = allLeads.filter(l => !l.has_website).length;
      if (noWebCount >= goalCount) goalMet = true;
    } else if (goalType === 'all') {
      if (allLeads.length >= goalCount) goalMet = true;
    }
  }

  // Filter and save
  let finalLeads = allLeads;
  if (goalType === 'no_website') {
    finalLeads = allLeads.filter(l => !l.has_website).slice(0, goalCount);
  } else if (goalType === 'outdated') {
    finalLeads = allLeads.filter(l => l.website_analysis?.is_outdated).slice(0, goalCount);
  } else {
    finalLeads = allLeads.slice(0, goalCount);
  }

  console.log(`Writing ${finalLeads.length} leads to results file`);
  fs.writeFileSync(resultFile, JSON.stringify({ niche, city, state, leads: finalLeads, goal_type: goalType, goal_count: goalCount, scraped_at: new Date().toISOString() }));
  writeProgress(`Done: ${finalLeads.length} leads`, finalLeads.length, goalCount);
  console.log(`Done: ${finalLeads.length} ${goalType} leads from ${citiesSearched} cities`);
}

run().catch(e => { 
  console.error(`FATAL: ${e.message}`);
  // Still write empty results so server doesn't hang
  try { fs.writeFileSync(resultFile, JSON.stringify({ niche, city, state, leads: [], goal_type: goalType, goal_count: goalCount, scraped_at: new Date().toISOString() })); } catch(e2) {}
  process.exit(1); 
});
