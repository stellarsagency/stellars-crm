const { chromium } = require('playwright');

(async () => {
  console.log('🚀 Starting browser...\n');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Open YouTube
  console.log('📺 Opening YouTube...');
  await page.goto('https://www.youtube.com');
  await page.waitForTimeout(2000);
  
  // Search
  console.log('🔍 Searching for PewDiePie...');
  await page.fill('input[name="search_query"]', 'PewDiePie');
  await page.press('input[name="search_query"]', 'Enter');
  await page.waitForTimeout(3000);
  
  console.log('✅ Done! Browser will close in 5 seconds...');
  await page.waitForTimeout(5000);
  
  await browser.close();
  console.log('👋 Closed!');
})();
