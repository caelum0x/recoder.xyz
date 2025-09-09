async function globalTeardown() {
  console.log('🧹 Starting global test teardown...');
  
  try {
    // Clean up test data
    console.log('🗑️ Cleaning up test data...');
    
    // Clean up test files if any were created
    const fs = require('fs');
    const path = require('path');
    
    const authStatePath = path.join(__dirname, 'auth-state.json');
    if (fs.existsSync(authStatePath)) {
      fs.unlinkSync(authStatePath);
      console.log('✅ Cleaned up auth state file');
    }
    
    // Clean up any test uploads or temporary files
    const testUploadsPath = path.join(process.cwd(), 'public/uploads/test');
    if (fs.existsSync(testUploadsPath)) {
      fs.rmSync(testUploadsPath, { recursive: true, force: true });
      console.log('✅ Cleaned up test uploads');
    }
    
    console.log('✅ Global teardown completed successfully');
    
  } catch (error) {
    console.error('❌ Global teardown failed:', error);
    // Don't throw - teardown failures shouldn't fail the test suite
  }
}

export default globalTeardown;
