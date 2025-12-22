const puppeteer = require('puppeteer');
const path = require('path');

async function takeScreenshots() {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  try {
    // Screenshot 1: Homepage
    console.log('Capturing homepage...');
    await page.goto('http://127.0.0.1:5000/', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    await page.screenshot({ path: path.join(__dirname, 'screenshot_home.png') });
    console.log('Homepage captured!');
    
    // Screenshot 2: Login page
    console.log('Capturing login...');
    await page.goto('http://127.0.0.1:5000/login', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: path.join(__dirname, 'screenshot_login.png') });
    console.log('Login captured!');
    
  } catch (err) {
    console.error('Error during capture:', err.message);
  }
  
  await browser.close();
  console.log('All screenshots captured!');
}

takeScreenshots();
