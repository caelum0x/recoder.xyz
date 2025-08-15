/**
 * Test script for Predictive AI Error Detection
 * Tests the real ML algorithms and API endpoints
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001';

// Test code samples with different error patterns
const testCases = [
  {
    name: 'SQL Injection Vulnerability',
    code: `
const getUserById = (userId) => {
  const query = "SELECT * FROM users WHERE id = " + userId;
  return db.query(query);
};
`,
    filePath: 'vulnerable-db.js',
    language: 'javascript',
    expectedErrors: ['sql_injection_risk'],
    expectedSeverity: 'critical'
  },
  {
    name: 'Missing Await on Async Function',
    code: `
const fetchUserData = async () => {
  const response = fetchFromAPI();  // Missing await
  return response.json();
};
`,
    filePath: 'async-issue.js',
    language: 'javascript',
    expectedErrors: ['async_await_missing'],
    expectedSeverity: 'medium'
  },
  {
    name: 'Memory Leak with Event Listeners',
    code: `
const setupEventListener = () => {
  const button = document.getElementById('my-button');
  button.addEventListener('click', handleClick);
  // No cleanup when component unmounts
};
`,
    filePath: 'memory-leak.js',
    language: 'javascript',
    expectedErrors: ['memory_leak_listener'],
    expectedSeverity: 'medium'
  },
  {
    name: 'Unhandled Promise Rejection',
    code: `
const processData = () => {
  fetchData()
    .then(data => {
      return processAsync(data);
    }); // No .catch() handler
};
`,
    filePath: 'promise-rejection.js',
    language: 'javascript',
    expectedErrors: ['unhandled_promise_rejection'],
    expectedSeverity: 'high'
  },
  {
    name: 'High Quality Code (Control)',
    code: `
const calculateTotal = async (items) => {
  try {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }
    
    const total = items.reduce((sum, item) => {
      if (typeof item.price !== 'number') {
        throw new Error('Invalid price');
      }
      return sum + item.price;
    }, 0);
    
    return total;
  } catch (error) {
    console.error('Error calculating total:', error);
    throw error;
  }
};
`,
    filePath: 'good-code.js',
    language: 'javascript',
    expectedErrors: [],
    expectedQuality: 0.8
  }
];

class PredictiveErrorDetectionTester {
  constructor() {
    this.results = [];
    this.passed = 0;
    this.failed = 0;
  }

  async runAllTests() {
    console.log('🚀 Starting Predictive AI Error Detection Tests');
    console.log('==================================================\n');

    // Wait for server to be ready
    await this.waitForServer();

    // Test health endpoint
    await this.testHealthEndpoint();

    // Test each code sample
    for (let i = 0; i < testCases.length; i++) {
      const testCase = testCases[i];
      console.log(`📝 Test ${i + 1}/${testCases.length}: ${testCase.name}`);
      await this.testCodeAnalysis(testCase);
      console.log('');
    }

    // Test batch analysis
    await this.testBatchAnalysis();

    // Test file upload
    await this.testFileUpload();

    // Test analytics endpoint
    await this.testAnalytics();

    // Test patterns endpoint
    await this.testPatterns();

    // Print results
    this.printResults();
  }

  async waitForServer(maxAttempts = 10) {
    console.log('⏳ Waiting for server to be ready...');
    for (let i = 0; i < maxAttempts; i++) {
      try {
        await axios.get(`${API_BASE}/health`);
        console.log('✅ Server is ready\n');
        return;
      } catch (error) {
        if (i === maxAttempts - 1) {
          throw new Error('Server did not become ready in time');
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  async testHealthEndpoint() {
    try {
      const response = await axios.get(`${API_BASE}/api/predictive-error-detection/health`);
      
      if (response.status === 200 && response.data.success) {
        console.log('✅ Health endpoint working');
        console.log(`   Features: ${Object.keys(response.data.features).join(', ')}\n`);
        this.passed++;
      } else {
        console.log('❌ Health endpoint failed');
        this.failed++;
      }
    } catch (error) {
      console.log('❌ Health endpoint error:', error.message);
      this.failed++;
    }
  }

  async testCodeAnalysis(testCase) {
    try {
      const response = await axios.post(`${API_BASE}/api/predictive-error-detection/analyze`, {
        code: testCase.code,
        filePath: testCase.filePath,
        language: testCase.language,
        framework: 'express',
        dependencies: ['express', 'mysql2']
      });

      if (response.status === 200 && response.data.success) {
        const result = response.data.data;
        console.log(`   ✅ Analysis completed in ${result.processingTime}ms`);
        console.log(`   📊 Predictions: ${result.predictions.length}, Quality: ${(result.qualityMetrics.overall * 100).toFixed(1)}%`);
        console.log(`   🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%`);

        // Check if expected errors were found
        if (testCase.expectedErrors.length > 0) {
          const foundErrorTypes = result.predictions.map(p => p.id);
          const hasExpectedErrors = testCase.expectedErrors.some(expected => 
            foundErrorTypes.includes(expected)
          );

          if (hasExpectedErrors) {
            console.log(`   ✅ Found expected error patterns: ${foundErrorTypes.join(', ')}`);
            this.passed++;
          } else {
            console.log(`   ⚠️  Expected errors ${testCase.expectedErrors.join(', ')} but found ${foundErrorTypes.join(', ')}`);
            this.failed++;
          }
        } else {
          // Test case expects high quality (no errors)
          if (result.qualityMetrics.overall >= (testCase.expectedQuality || 0.7)) {
            console.log(`   ✅ High quality code detected correctly`);
            this.passed++;
          } else {
            console.log(`   ⚠️  Expected high quality but got ${(result.qualityMetrics.overall * 100).toFixed(1)}%`);
            this.failed++;
          }
        }

        // Log detailed results
        if (result.predictions.length > 0) {
          console.log(`   🔍 Detailed predictions:`);
          result.predictions.slice(0, 3).forEach((prediction, idx) => {
            console.log(`      ${idx + 1}. ${prediction.type} (${prediction.severity}): ${prediction.description}`);
          });
        }

        if (result.recommendations.length > 0) {
          console.log(`   💡 Top recommendation: ${result.recommendations[0].description}`);
        }

      } else {
        console.log('   ❌ Analysis failed');
        this.failed++;
      }
    } catch (error) {
      console.log(`   ❌ Analysis error: ${error.response?.data?.message || error.message}`);
      this.failed++;
    }
  }

  async testBatchAnalysis() {
    console.log('📦 Testing batch analysis...');
    try {
      // Create temporary files for testing
      const tempFiles = [];
      for (let i = 0; i < 3; i++) {
        const testCase = testCases[i];
        const filePath = `/tmp/test-${i}.js`;
        fs.writeFileSync(filePath, testCase.code);
        tempFiles.push(filePath);
      }

      const FormData = require('form-data');
      const form = new FormData();

      tempFiles.forEach((filePath, index) => {
        form.append('files', fs.createReadStream(filePath), `test-${index}.js`);
      });

      const response = await axios.post(
        `${API_BASE}/api/predictive-error-detection/batch-analyze`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'X-Request-ID': 'batch-test-123'
          }
        }
      );

      if (response.status === 200 && response.data.success) {
        const summary = response.data.data.summary;
        console.log(`   ✅ Batch analysis completed`);
        console.log(`   📊 Files: ${summary.totalFiles}, Successful: ${summary.successfulAnalyses}`);
        console.log(`   🎯 Total errors predicted: ${summary.totalErrorsPredicted}`);
        console.log(`   💯 Average quality: ${(summary.averageQuality * 100).toFixed(1)}%`);
        this.passed++;
      } else {
        console.log('   ❌ Batch analysis failed');
        this.failed++;
      }

      // Cleanup
      tempFiles.forEach(filePath => {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {}
      });

    } catch (error) {
      console.log(`   ❌ Batch analysis error: ${error.response?.data?.message || error.message}`);
      this.failed++;
    }
    console.log('');
  }

  async testFileUpload() {
    console.log('📁 Testing file upload analysis...');
    try {
      const testCode = testCases[0].code;
      const tempFilePath = '/tmp/test-upload.js';
      fs.writeFileSync(tempFilePath, testCode);

      const FormData = require('form-data');
      const form = new FormData();
      form.append('file', fs.createReadStream(tempFilePath), 'test-upload.js');
      form.append('framework', 'express');
      form.append('dependencies', JSON.stringify(['express', 'mysql2']));

      const response = await axios.post(
        `${API_BASE}/api/predictive-error-detection/analyze-file`,
        form,
        {
          headers: {
            ...form.getHeaders(),
            'X-Request-ID': 'file-upload-test'
          }
        }
      );

      if (response.status === 200 && response.data.success) {
        const analysis = response.data.data.analysis;
        console.log(`   ✅ File upload analysis completed`);
        console.log(`   📊 Predictions: ${analysis.predictions.length}`);
        console.log(`   🎯 Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
        this.passed++;
      } else {
        console.log('   ❌ File upload analysis failed');
        this.failed++;
      }

      // Cleanup
      try {
        fs.unlinkSync(tempFilePath);
      } catch (e) {}

    } catch (error) {
      console.log(`   ❌ File upload error: ${error.response?.data?.message || error.message}`);
      this.failed++;
    }
    console.log('');
  }

  async testAnalytics() {
    console.log('📈 Testing analytics endpoint...');
    try {
      const response = await axios.get(`${API_BASE}/api/predictive-error-detection/analytics?timeRange=7`);
      
      if (response.status === 200 && response.data.success) {
        const analytics = response.data.data;
        console.log(`   ✅ Analytics retrieved`);
        console.log(`   📊 Total predictions: ${analytics.totalPredictions}`);
        console.log(`   💯 Average quality: ${(analytics.averageQuality * 100).toFixed(1)}%`);
        this.passed++;
      } else {
        console.log('   ❌ Analytics failed');
        this.failed++;
      }
    } catch (error) {
      console.log(`   ❌ Analytics error: ${error.response?.data?.message || error.message}`);
      this.failed++;
    }
    console.log('');
  }

  async testPatterns() {
    console.log('🔍 Testing error patterns endpoint...');
    try {
      const response = await axios.get(`${API_BASE}/api/predictive-error-detection/patterns?type=security&severity=critical`);
      
      if (response.status === 200 && response.data.success) {
        const patterns = response.data.data.patterns;
        console.log(`   ✅ Error patterns retrieved`);
        console.log(`   📊 Patterns found: ${patterns.length}`);
        if (patterns.length > 0) {
          console.log(`   🔍 Example: ${patterns[0].description}`);
        }
        this.passed++;
      } else {
        console.log('   ❌ Patterns retrieval failed');
        this.failed++;
      }
    } catch (error) {
      console.log(`   ❌ Patterns error: ${error.response?.data?.message || error.message}`);
      this.failed++;
    }
    console.log('');
  }

  printResults() {
    console.log('🏆 Test Results Summary');
    console.log('====================');
    console.log(`✅ Passed: ${this.passed}`);
    console.log(`❌ Failed: ${this.failed}`);
    console.log(`📊 Success Rate: ${((this.passed / (this.passed + this.failed)) * 100).toFixed(1)}%`);
    
    if (this.failed === 0) {
      console.log('\n🎉 All tests passed! Predictive AI Error Detection is working correctly.');
      console.log('🤖 The REAL machine learning algorithms are successfully:');
      console.log('   • Detecting SQL injection vulnerabilities');
      console.log('   • Identifying async/await issues'); 
      console.log('   • Finding memory leaks');
      console.log('   • Predicting promise rejection errors');
      console.log('   • Analyzing code quality metrics');
      console.log('   • Providing intelligent recommendations');
    } else {
      console.log(`\n⚠️  ${this.failed} tests failed. Check the logs above for details.`);
    }
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  const tester = new PredictiveErrorDetectionTester();
  tester.runAllTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = PredictiveErrorDetectionTester;