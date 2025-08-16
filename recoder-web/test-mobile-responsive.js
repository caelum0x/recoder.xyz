// Test Mobile Responsiveness
const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3007';

async function testMobileResponsiveness() {
  console.log('📱 Testing Mobile Responsiveness...');

  try {
    // 1. Test viewport configuration
    console.log('\n1. Testing viewport configuration...');
    
    const response = await fetch(`${BASE_URL}/`);
    const content = await response.text();
    
    const viewportMeta = content.match(/<meta[^>]*name="viewport"[^>]*content="([^"]*)"[^>]*>/i);
    const hasViewport = !!viewportMeta;
    const viewportContent = viewportMeta ? viewportMeta[1] : 'Not found';
    
    console.log(`Viewport meta tag: ${hasViewport ? 'Present' : 'Missing'}`);
    console.log(`Viewport content: ${viewportContent}`);

    // 2. Test responsive design elements
    console.log('\n2. Testing responsive design elements...');
    
    const responsiveElements = {
      hasMediaQueries: content.includes('@media') || content.includes('media='),
      hasFlexbox: content.includes('display:flex') || content.includes('d-flex') || content.includes('flex'),
      hasGrid: content.includes('display:grid') || content.includes('grid'),
      hasBootstrap: content.includes('bootstrap') || content.includes('container'),
      hasTailwind: content.includes('tailwind') || content.includes('sm:') || content.includes('md:') || content.includes('lg:'),
      hasResponsiveImages: content.includes('srcset') || content.includes('sizes') || content.includes('picture'),
      hasResponsiveText: content.includes('text-sm') || content.includes('text-lg') || content.includes('font-size')
    };
    
    console.log('Responsive Design Features:');
    Object.entries(responsiveElements).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? 'Present' : 'Not detected'}`);
    });

    // 3. Test mobile navigation
    console.log('\n3. Testing mobile navigation...');
    
    const navigationElements = {
      hasMobileMenu: content.includes('hamburger') || content.includes('menu-button') || content.includes('mobile-menu'),
      hasNavToggle: content.includes('nav-toggle') || content.includes('navbar-toggle'),
      hasCollapsibleNav: content.includes('collapse') || content.includes('hidden'),
      hasDrawer: content.includes('drawer') || content.includes('sidebar'),
      hasOffCanvas: content.includes('offcanvas') || content.includes('off-canvas')
    };
    
    console.log('Mobile Navigation:');
    Object.entries(navigationElements).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? 'Present' : 'Not detected'}`);
    });

    // 4. Test touch-friendly elements
    console.log('\n4. Testing touch-friendly elements...');
    
    const touchElements = {
      hasLargeButtons: content.includes('btn-lg') || content.includes('button-large') || content.includes('px-6') || content.includes('py-3'),
      hasTouchTargets: content.includes('min-height') || content.includes('min-h-') || content.includes('touch-target'),
      hasSwipeGestures: content.includes('swipe') || content.includes('gesture') || content.includes('touch'),
      hasScrollIndicators: content.includes('scroll') || content.includes('overflow'),
      hasZoomControls: content.includes('zoom') || content.includes('scale')
    };
    
    console.log('Touch-Friendly Elements:');
    Object.entries(touchElements).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? 'Present' : 'Not detected'}`);
    });

    // 5. Test content adaptation
    console.log('\n5. Testing content adaptation...');
    
    const contentAdaptation = {
      hasHiddenElements: content.includes('hidden-') || content.includes('d-none') || content.includes('lg:block'),
      hasStackedLayout: content.includes('flex-col') || content.includes('flex-column') || content.includes('stack'),
      hasResponsiveTables: content.includes('table-responsive') || content.includes('overflow-x'),
      hasResponsiveForms: content.includes('form-control') || content.includes('input-group'),
      hasAdaptiveImages: content.includes('object-fit') || content.includes('aspect-ratio')
    };
    
    console.log('Content Adaptation:');
    Object.entries(contentAdaptation).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? 'Present' : 'Not detected'}`);
    });

    // 6. Test performance on mobile
    console.log('\n6. Testing mobile performance factors...');
    
    const mobilePerformance = {
      hasLazyLoading: content.includes('loading="lazy"') || content.includes('lazy'),
      hasImageOptimization: content.includes('_next/image') || content.includes('webp') || content.includes('avif'),
      hasMinifiedCSS: content.includes('.min.css') || content.includes('_next/static'),
      hasMinifiedJS: content.includes('.min.js') || content.includes('_next/static'),
      hasCriticalCSS: content.includes('<style>') && content.includes('critical'),
      hasPreloadResources: content.includes('rel="preload"') || content.includes('rel="prefetch"')
    };
    
    console.log('Mobile Performance:');
    Object.entries(mobilePerformance).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? 'Present' : 'Not detected'}`);
    });

    // 7. Test accessibility for mobile
    console.log('\n7. Testing mobile accessibility...');
    
    const mobileA11y = {
      hasAriaLabels: content.includes('aria-label') || content.includes('aria-labelledby'),
      hasKeyboardNav: content.includes('tabindex') || content.includes('focus'),
      hasScreenReaderText: content.includes('sr-only') || content.includes('screen-reader'),
      hasAltText: content.includes('alt=') && !content.includes('alt=""'),
      hasSemanticHTML: content.includes('<nav>') && content.includes('<main>') && content.includes('<header>')
    };
    
    console.log('Mobile Accessibility:');
    Object.entries(mobileA11y).forEach(([key, value]) => {
      console.log(`  ${key}: ${value ? 'Present' : 'Not detected'}`);
    });

    // 8. Calculate mobile responsiveness score
    console.log('\n8. Mobile Responsiveness Score...');
    
    const scores = {
      viewport: hasViewport ? 10 : 0,
      responsive: Object.values(responsiveElements).filter(Boolean).length * 3,
      navigation: Object.values(navigationElements).filter(Boolean).length * 4,
      touch: Object.values(touchElements).filter(Boolean).length * 3,
      content: Object.values(contentAdaptation).filter(Boolean).length * 3,
      performance: Object.values(mobilePerformance).filter(Boolean).length * 2,
      accessibility: Object.values(mobileA11y).filter(Boolean).length * 2
    };
    
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
    const maxScore = 10 + (7*3) + (5*4) + (5*3) + (5*3) + (6*2) + (5*2); // 100
    const percentageScore = Math.round((totalScore / maxScore) * 100);
    
    console.log(`Viewport: ${scores.viewport}/10`);
    console.log(`Responsive Design: ${scores.responsive}/21`);
    console.log(`Mobile Navigation: ${scores.navigation}/20`);
    console.log(`Touch Elements: ${scores.touch}/15`);
    console.log(`Content Adaptation: ${scores.content}/15`);
    console.log(`Mobile Performance: ${scores.performance}/12`);
    console.log(`Mobile Accessibility: ${scores.accessibility}/10`);
    console.log(`Total Mobile Score: ${percentageScore}/100`);

    return {
      status: 'success',
      mobileScore: percentageScore,
      breakdown: scores,
      viewport: { hasViewport, viewportContent },
      responsiveElements,
      navigationElements,
      touchElements,
      contentAdaptation,
      mobilePerformance,
      mobileA11y,
      recommendations: percentageScore < 80 ? [
        'Add proper viewport meta tag',
        'Implement responsive breakpoints',
        'Add mobile navigation menu',
        'Increase touch target sizes',
        'Optimize images for mobile',
        'Add lazy loading for better performance'
      ] : []
    };

  } catch (error) {
    console.error('❌ Mobile responsiveness test failed:', error.message);
    return { status: 'error', error: error.message };
  }
}

testMobileResponsiveness()
  .then(result => {
    console.log('\n📋 Mobile Responsiveness Summary:', result);
    if (result.status === 'success') {
      console.log('✅ Mobile responsiveness analysis completed');
      
      if (result.recommendations.length > 0) {
        console.log('\n📱 Mobile Recommendations:');
        result.recommendations.forEach(rec => console.log(`• ${rec}`));
      }
    }
  })
  .catch(error => {
    console.error('💥 Test failed:', error);
  });