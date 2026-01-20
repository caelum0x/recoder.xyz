import { firefox } from 'playwright';

const browser = await firefox.launch();
const page = await browser.newPage();

console.log('Testing Firefox...');

console.log('Attempting to connect to https://example.com...');
try {
  const response = await page.goto('https://example.com', { timeout: 10000 });
  console.log('Connected to example.com! Status:', response?.status());
} catch (e) {
  console.log('Failed example.com:', e.message);
}

console.log('\nAttempting to connect to http://localhost:5173...');
try {
  const response = await page.goto('http://localhost:5173', { timeout: 10000 });
  console.log('Connected! Status:', response?.status());
  console.log('URL:', page.url());
} catch (e) {
  console.log('Failed localhost:', e.message);
}

await browser.close();
