const puppeteer = require('puppeteer');
const path = require('path');

async function captureDashboard() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  try {
    // Go to login page
    console.log('Going to login...');
    await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    
    // Fill login form - try to find the email and password fields
    console.log('Filling login form...');
    
    // Find email input
    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    if (emailInput) {
      await emailInput.type('admin@tailormeal.pt');
    }
    
    // Find password input
    const passwordInput = await page.$('input[type="password"], input[name="password"]');
    if (passwordInput) {
      await passwordInput.type('admin123');
    }
    
    // Click login button
    const loginButton = await page.$('button[type="submit"]');
    if (loginButton) {
      await loginButton.click();
      console.log('Clicked login button, waiting...');
      await new Promise(r => setTimeout(r, 3000));
    }
    
    // Capture current page (should be dashboard or chat)
    console.log('Capturing dashboard...');
    await page.screenshot({ path: path.join(__dirname, 'screenshot_dashboard.png') });
    console.log('Dashboard captured!');
    
    // Try to navigate to chat if not already there
    await page.goto('http://127.0.0.1:5000/chat', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(__dirname, 'screenshot_chat.png') });
    console.log('Chat captured!');
    
  } catch (err) {
    console.error('Error during capture:', err.message);
  }
  
  await browser.close();
  console.log('Done!');
}

captureDashboard();
