# AI Agent Tools - Live Examples Guide

## 1. OpenClaw - Personal AI Assistant

### Installation
```bash
# Clone the repository
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# Install dependencies
npm install

# Configure your AI provider (create .env file)
echo "ANTHROPIC_API_KEY=your_api_key_here" > .env
echo "OPENAI_API_KEY=your_api_key_here" >> .env

# Start OpenClaw
npm start
```

### Live Example: Automate WhatsApp Messages
```javascript
// OpenClaw skill example - Send WhatsApp messages
// Save as: skills/whatsapp-automation/SKILL.md

# WhatsApp Automation Skill

## Description
Automate WhatsApp message sending and monitoring

## Tools Available
- whatsapp_send: Send messages to contacts
- whatsapp_read: Read incoming messages
- whatsapp_search: Search chat history

## Example Usage
1. "Send 'Meeting at 3pm' to John on WhatsApp"
2. "Check my latest WhatsApp messages"
3. "Forward the last message from Mom to Dad"

## Implementation
```javascript
async function sendMessage(contact, message) {
  const whatsapp = await getWhatsAppClient();
  await whatsapp.sendMessage(contact, message);
  return `Message sent to ${contact}`;
}
```
```

### Live Example: Email Automation
```bash
# OpenClaw command examples
openclaw "Check my email and summarize unread messages"
openclaw "Draft a reply to the last email from boss"
openclaw "Send weekly report to team@company.com"
```

---

## 2. Hermes Agent (OpenClaw Fork)

### Installation
```bash
# Install Hermes
git clone https://github.com/NousResearch/hermes-agent.git
cd hermes-agent
npm install

# Configure
cp .env.example .env
# Edit .env with your API keys

# Start
npm run start:hermes
```

### Live Example: Research Assistant
```bash
# Hermes command examples
hermes "Research the latest AI papers on arxiv and summarize top 5"
hermes "Compare prices of iPhone 15 Pro across 3 websites"
hermes "Create a presentation about climate change with statistics"
```

### Live Example: Code Assistant
```bash
# Code-related tasks
hermes "Review my Python code in main.py and suggest improvements"
hermes "Write unit tests for the calculate_total function"
hermes "Explain how this JavaScript async/await works"
```

---

## 3. Odysseus (PewDiePie's AI Workspace)

### Installation
```bash
# Clone Odysseus
git clone https://github.com/odysseus-dev/odysseus.git
cd odysseus

# Install
npm install

# Start the server
npm run dev

# Open in browser
# http://localhost:3000
```

### Live Example: Document Analysis
```bash
# Through the Odysseus web interface:
1. Upload a PDF document
2. Ask: "Summarize this document in 5 bullet points"
3. Ask: "What are the key arguments made?"
4. Ask: "Create an outline based on this content"
```

### Live Example: Multi-Model Comparison
```bash
# Compare responses from different AI models
Prompt: "Explain quantum computing"

# Odysseus shows side-by-side:
├── GPT-4 Response
├── Claude Response
├── Local Llama Response
└── DeepSeek Response
```

---

## 4. Browser Automation (Playwright)

### Installation
```bash
# Install Playwright
npm init -y
npm install playwright

# Install browsers
npx playwright install
```

### Live Example: Open YouTube Channels
```javascript
// open-youtube.js
const { chromium } = require('playwright');

async function openYouTubeChannels() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  
  // Open LawHermes channel
  const page1 = await context.newPage();
  await page1.goto('https://www.youtube.com/@hermeslaw7931');
  console.log('Opened LawHermes channel');
  
  // Open PewDiePie channel
  const page2 = await context.newPage();
  await page2.goto('https://www.youtube.com/@pewdiepie');
  console.log('Opened PewDiePie channel');
  
  // Wait for user to see
  await page1.waitForTimeout(10000);
  
  await browser.close();
}

openYouTubeChannels();
```

### Live Example: Web Scraping
```javascript
// scrape-youtube.js
const { chromium } = require('playwright');

async function scrapeYouTube() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('https://www.youtube.com/@pewdiepie/videos');
  
  // Get all video titles
  const videos = await page.$$eval('video-title', 
    elements => elements.map(el => ({
      title: el.textContent.trim(),
      url: el.href
    }))
  );
  
  console.log('PewDiePie Videos:', videos);
  
  await browser.close();
}

scrapeYouTube();
```

---

## Quick Start Commands

### For Windows (PowerShell):
```powershell
# Fix npm execution policy first
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

# Then install tools
npm install -g playwright
npx playwright install

# Run examples
node open-youtube.js
```

### For macOS/Linux:
```bash
# Install Node.js tools
npm install -g playwright
npx playwright install

# Run examples
node open-youtube.js
```

---

## Which Tool to Use?

| Task | Best Tool |
|------|-----------|
| WhatsApp/Telegram automation | OpenClaw |
| Research & analysis | Hermes Agent |
| Document processing | Odysseus |
| Web scraping | Playwright |
| Browser automation | Playwright |
| Multi-model comparison | Odysseus |
| Email management | OpenClaw |
| Code assistance | Hermes Agent |
