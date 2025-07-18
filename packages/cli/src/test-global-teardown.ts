/**
 * Global test teardown
 * Runs once after all tests
 */

import path from 'path';
import fs from 'fs-extra';

export default async function globalTeardown(): Promise<void> {
  console.log('🧹 Cleaning up global test environment...');
  
  // Clean up test directories (but keep reports for analysis)
  const dirsToClean = [
    path.join(process.cwd(), 'test-output'),
    path.join(process.cwd(), 'temp-test-dirs'),
    path.join(process.cwd(), 'test-artifacts'),
  ];

  for (const dir of dirsToClean) {
    if (await fs.pathExists(dir)) {
      await fs.remove(dir);
      console.log(`✅ Cleaned up directory: ${dir}`);
    }
  }

  // Archive test reports if they exist
  const testReportsDir = path.join(process.cwd(), 'test-reports');
  if (await fs.pathExists(testReportsDir)) {
    const archiveDir = path.join(process.cwd(), 'archived-test-reports');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivePath = path.join(archiveDir, `test-reports-${timestamp}`);
    
    await fs.ensureDir(archiveDir);
    await fs.copy(testReportsDir, archivePath);
    console.log(`📦 Archived test reports to: ${archivePath}`);
  }

  // Clean up environment variables
  delete process.env.RECODER_CONFIG_DIR;
  delete process.env.RECODER_TEST_MODE;
  delete process.env.RECODER_LOG_LEVEL;
  delete process.env.RECODER_API_URL;
  
  console.log('✅ Cleaned up environment variables');

  // Generate test summary report
  const summaryPath = path.join(process.cwd(), 'test-summary.json');
  const testSummary = {
    timestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    duration: process.uptime(),
    cleanup: {
      directoriesRemoved: dirsToClean.length,
      reportsArchived: await fs.pathExists(testReportsDir),
      environmentCleaned: true,
    },
    status: 'completed',
  };

  await fs.writeJson(summaryPath, testSummary, { spaces: 2 });
  console.log(`📊 Generated test summary: ${summaryPath}`);

  console.log('🎉 Global test teardown completed successfully!');
}