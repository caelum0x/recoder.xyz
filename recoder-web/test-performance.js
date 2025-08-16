// Test Core Web Vitals and Performance
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3007';

async function testPerformance() {
  console.log('⚡ Testing Web Performance & Core Web Vitals...');

  try {
    // 1. Measure page load times
    console.log('\n1. Testing page load performance...');
    
    const pages = ['/', '/dashboard', '/pricing', '/templates', '/reasoning'];
    const loadTimes = {};
    
    for (const page of pages) {
      const start = Date.now();
      const response = await fetch(`${BASE_URL}${page}`);
      const loadTime = Date.now() - start;
      loadTimes[page] = { status: response.status, loadTime };
      
      console.log(`${page}: ${response.status} (${loadTime}ms)`);
    }

    // 2. Check static asset optimization
    console.log('\n2. Testing static asset optimization...');
    
    // Check if assets are compressed and optimized
    const mainPageResponse = await fetch(`${BASE_URL}/`);
    const content = await mainPageResponse.text();
    
    const hasImageOptimization = content.includes('_next/image') || content.includes('srcSet');
    const hasStaticAssets = content.includes('_next/static');
    const hasCSSOptimization = content.includes('.css');
    const hasJSOptimization = content.includes('webpack');
    
    console.log(`✅ Image optimization: ${hasImageOptimization}`);
    console.log(`✅ Static assets: ${hasStaticAssets}`);
    console.log(`✅ CSS optimization: ${hasCSSOptimization}`);
    console.log(`✅ JS optimization: ${hasJSOptimization}`);

    // 3. Test cache headers
    console.log('\n3. Testing cache optimization...');
    
    const cacheResponse = await fetch(`${BASE_URL}/`);
    const cacheControl = cacheResponse.headers.get('cache-control');
    const etag = cacheResponse.headers.get('etag');
    const lastModified = cacheResponse.headers.get('last-modified');
    
    console.log(`Cache-Control: ${cacheControl || 'Not set'}`);
    console.log(`ETag: ${etag ? 'Present' : 'Not set'}`);
    console.log(`Last-Modified: ${lastModified ? 'Present' : 'Not set'}`);

    // 4. Test API performance
    console.log('\n4. Testing API performance...');
    
    const apiEndpoints = [
      '/api/smart-routing',
      '/api/pricing/tiers',
      '/api/usage/metrics',
      '/api/agents/sessions'
    ];
    
    const apiPerformance = {};
    
    for (const endpoint of apiEndpoints) {
      try {
        const start = Date.now();
        const response = await fetch(`${BASE_URL}${endpoint}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        const apiTime = Date.now() - start;
        apiPerformance[endpoint] = { status: response.status, responseTime: apiTime };
        
        console.log(`${endpoint}: ${response.status} (${apiTime}ms)`);
      } catch (error) {
        console.log(`${endpoint}: Error (${error.message})`);
      }
    }

    // 5. Test resource loading efficiency
    console.log('\n5. Testing resource loading...');
    
    // Count resources in main page
    const resourcePatterns = {
      images: (content.match(/<img/g) || []).length,
      scripts: (content.match(/<script/g) || []).length,
      stylesheets: (content.match(/\.css/g) || []).length,
      fonts: (content.match(/font/gi) || []).length
    };
    
    console.log(`Images: ${resourcePatterns.images}`);
    console.log(`Scripts: ${resourcePatterns.scripts}`);
    console.log(`Stylesheets: ${resourcePatterns.stylesheets}`);
    console.log(`Font references: ${resourcePatterns.fonts}`);

    // 6. Test compression
    console.log('\n6. Testing compression...');
    
    const compressionResponse = await fetch(`${BASE_URL}/`, {
      headers: { 'Accept-Encoding': 'gzip, deflate, br' }
    });
    
    const contentEncoding = compressionResponse.headers.get('content-encoding');
    const contentLength = compressionResponse.headers.get('content-length');
    
    console.log(`Content-Encoding: ${contentEncoding || 'Not compressed'}`);
    console.log(`Content-Length: ${contentLength || 'Not specified'}`);

    // 7. Calculate performance scores
    console.log('\n7. Performance Score Analysis...');
    
    const avgLoadTime = Object.values(loadTimes).reduce((sum, item) => sum + item.loadTime, 0) / Object.keys(loadTimes).length;
    const avgAPITime = Object.values(apiPerformance).reduce((sum, item) => sum + item.responseTime, 0) / Object.keys(apiPerformance).length;
    
    const performanceScore = {
      avgPageLoad: Math.round(avgLoadTime),
      avgAPIResponse: Math.round(avgAPITime),
      resourceOptimization: hasImageOptimization && hasStaticAssets,
      compressionEnabled: !!contentEncoding,
      cacheConfigured: !!cacheControl
    };
    
    console.log(`Average page load: ${performanceScore.avgPageLoad}ms`);
    console.log(`Average API response: ${performanceScore.avgAPIResponse}ms`);
    console.log(`Resource optimization: ${performanceScore.resourceOptimization}`);
    console.log(`Compression: ${performanceScore.compressionEnabled}`);
    console.log(`Caching: ${performanceScore.cacheConfigured}`);

    return {
      status: 'success',
      performance: performanceScore,
      loadTimes,
      apiPerformance,
      resources: resourcePatterns
    };

  } catch (error) {
    console.error('❌ Performance test failed:', error.message);
    return { status: 'error', error: error.message };
  }
}

testPerformance()
  .then(result => {
    console.log('\n📋 Performance Test Summary:', result);
    if (result.status === 'success') {
      console.log('✅ Performance analysis completed');
      
      // Performance recommendations
      console.log('\n🎯 Performance Recommendations:');
      if (result.performance.avgPageLoad > 3000) {
        console.log('⚠️  Page load time > 3s - consider optimization');
      }
      if (result.performance.avgAPIResponse > 1000) {
        console.log('⚠️  API response time > 1s - consider caching');
      }
      if (!result.performance.compressionEnabled) {
        console.log('⚠️  Enable gzip/brotli compression');
      }
      if (!result.performance.cacheConfigured) {
        console.log('⚠️  Configure cache headers');
      }
    }
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
  });