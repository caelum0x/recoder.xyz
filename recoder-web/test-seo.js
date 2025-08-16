// Test SEO optimization
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3007';

async function testSEO() {
  console.log('📈 Testing SEO Optimization...');

  try {
    // 1. Test meta tags and basic SEO elements
    console.log('\n1. Testing meta tags and SEO elements...');
    
    const pages = ['/', '/pricing', '/templates', '/dashboard'];
    const seoResults = {};
    
    for (const page of pages) {
      try {
        const response = await fetch(`${BASE_URL}${page}`);
        if (response.status === 200) {
          const content = await response.text();
          
          const seoElements = {
            title: (content.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || 'Not found',
            metaDescription: (content.match(/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found',
            metaKeywords: (content.match(/<meta[^>]*name="keywords"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found',
            metaViewport: (content.match(/<meta[^>]*name="viewport"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found',
            h1Tags: (content.match(/<h1[^>]*>([^<]+)<\/h1>/gi) || []).length,
            h2Tags: (content.match(/<h2[^>]*>([^<]+)<\/h2>/gi) || []).length,
            imgAltTags: (content.match(/<img[^>]*alt="[^"]*"[^>]*>/gi) || []).length,
            internalLinks: (content.match(/<a[^>]*href="\/[^"]*"[^>]*>/gi) || []).length,
            externalLinks: (content.match(/<a[^>]*href="https?:\/\/[^"]*"[^>]*>/gi) || []).length
          };
          
          seoResults[page] = seoElements;
          
          console.log(`\n${page}:`);
          console.log(`  Title: ${seoElements.title.substring(0, 50)}${seoElements.title.length > 50 ? '...' : ''}`);
          console.log(`  Meta Description: ${seoElements.metaDescription !== 'Not found' ? 'Present' : 'Missing'}`);
          console.log(`  H1 tags: ${seoElements.h1Tags}`);
          console.log(`  H2 tags: ${seoElements.h2Tags}`);
          console.log(`  Alt tags: ${seoElements.imgAltTags}`);
          console.log(`  Internal links: ${seoElements.internalLinks}`);
        }
      } catch (error) {
        console.log(`  Error loading ${page}: ${error.message}`);
      }
    }

    // 2. Test Open Graph tags
    console.log('\n2. Testing Open Graph and social media tags...');
    
    const mainPageResponse = await fetch(`${BASE_URL}/`);
    const mainContent = await mainPageResponse.text();
    
    const socialTags = {
      ogTitle: (mainContent.match(/<meta[^>]*property="og:title"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found',
      ogDescription: (mainContent.match(/<meta[^>]*property="og:description"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found',
      ogImage: (mainContent.match(/<meta[^>]*property="og:image"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found',
      ogUrl: (mainContent.match(/<meta[^>]*property="og:url"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found',
      twitterCard: (mainContent.match(/<meta[^>]*name="twitter:card"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found',
      twitterTitle: (mainContent.match(/<meta[^>]*name="twitter:title"[^>]*content="([^"]*)"[^>]*>/i) || [])[1] || 'Not found'
    };
    
    console.log('Social Media Tags:');
    Object.entries(socialTags).forEach(([key, value]) => {
      console.log(`  ${key}: ${value !== 'Not found' ? 'Present' : 'Missing'}`);
    });

    // 3. Test robots.txt
    console.log('\n3. Testing robots.txt...');
    
    const robotsResponse = await fetch(`${BASE_URL}/robots.txt`);
    console.log(`Robots.txt status: ${robotsResponse.status}`);
    if (robotsResponse.status === 200) {
      const robotsContent = await robotsResponse.text();
      console.log(`Robots.txt content preview: ${robotsContent.substring(0, 100)}...`);
    }

    // 4. Test sitemap
    console.log('\n4. Testing sitemap...');
    
    const sitemapResponse = await fetch(`${BASE_URL}/sitemap.xml`);
    console.log(`Sitemap status: ${sitemapResponse.status}`);
    
    // Also check for sitemap in robots.txt
    if (robotsResponse.status === 200) {
      const robotsContent = await robotsResponse.text();
      const hasSitemap = robotsContent.toLowerCase().includes('sitemap');
      console.log(`Sitemap referenced in robots.txt: ${hasSitemap}`);
    }

    // 5. Test structured data
    console.log('\n5. Testing structured data...');
    
    const hasJsonLd = mainContent.includes('application/ld+json');
    const hasMicrodata = mainContent.includes('itemscope') || mainContent.includes('itemtype');
    const hasRDFa = mainContent.includes('typeof') || mainContent.includes('property');
    
    console.log(`JSON-LD structured data: ${hasJsonLd ? 'Present' : 'Not found'}`);
    console.log(`Microdata: ${hasMicrodata ? 'Present' : 'Not found'}`);
    console.log(`RDFa: ${hasRDFa ? 'Present' : 'Not found'}`);

    // 6. Test canonical URLs
    console.log('\n6. Testing canonical URLs...');
    
    const hasCanonical = mainContent.includes('<link rel="canonical"');
    const canonicalUrl = (mainContent.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"[^>]*>/i) || [])[1];
    
    console.log(`Canonical URL: ${hasCanonical ? `Present (${canonicalUrl})` : 'Not found'}`);

    // 7. Test page speed insights
    console.log('\n7. Testing page speed factors...');
    
    const speedFactors = {
      hasPreconnect: mainContent.includes('rel="preconnect"'),
      hasDNSPrefetch: mainContent.includes('rel="dns-prefetch"'),
      hasPreload: mainContent.includes('rel="preload"'),
      hasAsync: mainContent.includes('async'),
      hasDefer: mainContent.includes('defer'),
      hasLazyLoading: mainContent.includes('loading="lazy"')
    };
    
    console.log('Page Speed Optimizations:');
    Object.entries(speedFactors).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? 'Present' : 'Not found'}`);
    });

    // 8. Calculate SEO score
    console.log('\n8. SEO Score Analysis...');
    
    const mainPageSEO = seoResults['/'] || {};
    const seoScore = {
      basicSEO: (
        (mainPageSEO.title !== 'Not found' ? 15 : 0) +
        (mainPageSEO.metaDescription !== 'Not found' ? 15 : 0) +
        (mainPageSEO.metaViewport !== 'Not found' ? 5 : 0) +
        (mainPageSEO.h1Tags > 0 ? 10 : 0) +
        (mainPageSEO.h2Tags > 0 ? 5 : 0)
      ),
      socialSEO: (
        (socialTags.ogTitle !== 'Not found' ? 5 : 0) +
        (socialTags.ogDescription !== 'Not found' ? 5 : 0) +
        (socialTags.ogImage !== 'Not found' ? 5 : 0) +
        (socialTags.twitterCard !== 'Not found' ? 5 : 0)
      ),
      technicalSEO: (
        (robotsResponse.status === 200 ? 10 : 0) +
        (hasCanonical ? 5 : 0) +
        (hasJsonLd ? 10 : 0) +
        (speedFactors.hasPreload ? 2 : 0) +
        (speedFactors.hasAsync || speedFactors.hasDefer ? 3 : 0)
      )
    };
    
    const totalSEOScore = seoScore.basicSEO + seoScore.socialSEO + seoScore.technicalSEO;
    
    console.log(`Basic SEO: ${seoScore.basicSEO}/50`);
    console.log(`Social SEO: ${seoScore.socialSEO}/20`);
    console.log(`Technical SEO: ${seoScore.technicalSEO}/30`);
    console.log(`Total SEO Score: ${totalSEOScore}/100`);

    return {
      status: 'success',
      seoScore: totalSEOScore,
      breakdown: seoScore,
      seoResults,
      socialTags,
      speedFactors,
      recommendations: totalSEOScore < 80 ? [
        'Add missing meta descriptions',
        'Implement structured data (JSON-LD)',
        'Add Open Graph tags for social sharing',
        'Create XML sitemap',
        'Add canonical URLs',
        'Optimize page loading with preload/prefetch'
      ] : []
    };

  } catch (error) {
    console.error('❌ SEO test failed:', error.message);
    return { status: 'error', error: error.message };
  }
}

testSEO()
  .then(result => {
    console.log('\n📋 SEO Optimization Summary:', result);
    if (result.status === 'success') {
      console.log('✅ SEO analysis completed');
      
      if (result.recommendations.length > 0) {
        console.log('\n📈 SEO Recommendations:');
        result.recommendations.forEach(rec => console.log(`• ${rec}`));
      }
    }
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
  });