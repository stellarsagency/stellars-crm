const { chromium } = require('playwright');

async function liveDemo() {
  console.log('🚀 Starting browser automation demo...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  // Task 1: Open YouTube and search
  console.log('📺 Task 1: Opening YouTube...');
  const page1 = await context.newPage();
  await page1.goto('https://www.youtube.com');
  await page1.waitForTimeout(2000);
  
  // Search for PewDiePie Odysseus
  console.log('🔍 Searching for "PewDiePie Odysseus"...');
  await page1.fill('input[name="search_query"]', 'PewDiePie Odysseus AI');
  await page1.press('input[name="search_query"]', 'Enter');
  await page1.waitForTimeout(3000);
  
  // Click first video
  console.log('▶️ Clicking first video...');
  const firstVideo = await page1.$('a#video-title');
  if (firstVideo) {
    await firstVideo.click();
    console.log('✅ Video opened successfully!');
  }
  
  // Task 2: Open second tab with OpenClaw
  console.log('\n🦞 Task 2: Opening OpenClaw website...');
  const page2 = await context.newPage();
  await page2.goto('https://openclaw.ai');
  await page2.waitForTimeout(2000);
  
  // Get page title
  const title = await page2.title();
  console.log(`✅ OpenClaw page title: ${title}`);
  
  // Task 3: Open third tab with Odysseus
  console.log('\n⚔️ Task 3: Opening Odysseus GitHub...');
  const page3 = await context.newPage();
  await page3.goto('https://github.com/odysseus-dev/odysseus');
  await page3.waitForTimeout(2000);
  
  // Get star count
  const stars = await page3.$eval('[id="repo-stars-counter-star"]', 
    el => el.textContent.trim()
  ).catch(() => 'N/A');
  console.log(`✅ Odysseus stars: ${stars}`);
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('🎉 AUTOMATION COMPLETE!');
  console.log('='.repeat(50));
  console.log('Opened tabs:');
  console.log('  1. YouTube - Searched for PewDiePie Odysseus');
  console.log('  2. OpenClaw.ai - Personal AI Assistant');
  console.log('  3. Odysseus GitHub - PewDiePie AI Workspace');
  console.log('='.repeat(50));
  
  // Keep browser open for 15 seconds
  console.log('\n⏳ Browser will close in 15 seconds...');
  await page1.waitForTimeout(15000);
  
  await browser.close();
  console.log('👋 Browser closed. Demo finished!');
}

liveDemo().catch(console.error);
