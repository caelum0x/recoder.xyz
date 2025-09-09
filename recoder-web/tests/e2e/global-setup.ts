import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  const { baseURL } = config.projects[0].use;
  
  console.log('🚀 Starting global test setup...');
  
  // Start browser for authentication setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for the server to be ready
    console.log('⏳ Waiting for server to be ready...');
    let retries = 0;
    const maxRetries = 30;
    
    while (retries < maxRetries) {
      try {
        const response = await page.goto(`${baseURL}/api/health`);
        if (response?.ok()) {
          console.log('✅ Server is ready');
          break;
        }
      } catch (error) {
        console.log(`Retry ${retries + 1}/${maxRetries}: Server not ready yet...`);
        await page.waitForTimeout(2000);
        retries++;
      }
    }

    if (retries >= maxRetries) {
      throw new Error('Server failed to start within timeout period');
    }

    // Setup test database if needed
    console.log('🗄️ Setting up test database...');
    
    // Create test user account for authenticated tests
    await setupTestUser(page, baseURL!);
    
    console.log('✅ Global setup completed successfully');

  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function setupTestUser(page: any, baseURL: string) {
  try {
    // Navigate to registration page
    await page.goto(`${baseURL}/auth/register`);
    
    // Fill registration form
    await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
    await page.fill('[data-testid="password-input"]', 'TestPassword123!');
    await page.fill('[data-testid="name-input"]', 'Test User');
    
    // Submit registration
    await page.click('[data-testid="register-button"]');
    
    // Wait for success or check if user already exists
    try {
      await page.waitForURL(`${baseURL}/dashboard`, { timeout: 5000 });
      console.log('✅ Test user created successfully');
    } catch {
      // User might already exist, try to login instead
      await page.goto(`${baseURL}/auth/login`);
      await page.fill('[data-testid="email-input"]', 'test@recoder.xyz');
      await page.fill('[data-testid="password-input"]', 'TestPassword123!');
      await page.click('[data-testid="login-button"]');
      
      try {
        await page.waitForURL(`${baseURL}/dashboard`, { timeout: 5000 });
        console.log('✅ Test user login successful');
      } catch {
        console.log('ℹ️ Could not create/login test user - will use unauthenticated tests');
      }
    }
    
    // Save authentication state
    await page.context().storageState({ path: './tests/e2e/auth-state.json' });
    
  } catch (error) {
    console.log('ℹ️ Could not setup test user:', error);
    // Continue without authenticated user - tests will handle unauthenticated state
  }
}

export default globalSetup;
