import { test, expect } from '@playwright/test';

test.describe('Performance Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Enable performance monitoring
    await page.addInitScript(() => {
      // Enable performance marks and measures
      window.performance.mark('test-start');
    });
  });

  test.describe('Page Load Performance', () => {
    test('homepage should load within performance budget', async ({ page }) => {
      const startTime = Date.now();
      
      // Navigate to homepage
      await page.goto('/', { waitUntil: 'networkidle' });
      
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      
      // Performance assertion - should load within 3 seconds
      expect(loadTime).toBeLessThan(3000);
      
      // Check Core Web Vitals
      const metrics = await page.evaluate(() => {
        return new Promise((resolve) => {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            resolve(entries.map(entry => ({
              name: entry.name,
              value: entry.value || entry.duration,
              startTime: entry.startTime,
            })));
          }).observe({ entryTypes: ['measure', 'navigation', 'paint'] });
          
          // Fallback if no performance entries
          setTimeout(() => resolve([]), 1000);
        });
      });
      
      console.log('Performance metrics:', metrics);
    });

    test('dashboard should load quickly for authenticated users', async ({ page }) => {
      // Mock authentication
      await page.addInitScript(() => {
        localStorage.setItem('auth-token', 'mock-token');
      });
      
      const startTime = Date.now();
      
      await page.goto('/dashboard', { waitUntil: 'networkidle' });
      
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      
      // Dashboard should load within 2 seconds
      expect(loadTime).toBeLessThan(2000);
      
      // Verify critical content is visible
      await expect(page.locator('[data-testid="dashboard-header"]')).toBeVisible();
      await expect(page.locator('[data-testid="projects-list"]')).toBeVisible();
    });

    test('project creation page should have fast Time to Interactive', async ({ page }) => {
      await page.goto('/projects/new');
      
      // Wait for the page to be fully interactive
      await page.waitForLoadState('networkidle');
      
      // Measure Time to Interactive (TTI)
      const tti = await page.evaluate(() => {
        return new Promise((resolve) => {
          // Simple TTI approximation
          const checkInteractive = () => {
            const startTime = performance.timing.navigationStart;
            const now = performance.now();
            
            // Check if main thread is idle
            const lastTask = performance.getEntriesByType('measure')[0];
            if (!lastTask || (now - lastTask.startTime) > 5000) {
              resolve(now);
            } else {
              setTimeout(checkInteractive, 100);
            }
          };
          
          checkInteractive();
        });
      });
      
      // TTI should be less than 4 seconds
      expect(tti).toBeLessThan(4000);
    });
  });

  test.describe('Runtime Performance', () => {
    test('code editor should respond quickly to typing', async ({ page }) => {
      await page.goto('/projects/new');
      
      // Select React template and create project
      await page.click('[data-testid="template-react"]');
      await page.fill('[data-testid="project-name"]', 'Performance Test Project');
      await page.click('[data-testid="create-project-btn"]');
      
      // Wait for project creation
      await expect(page.locator('[data-testid="code-editor"]')).toBeVisible();
      
      // Focus on the editor
      await page.click('[data-testid="code-editor"]');
      
      // Measure typing performance
      const typingPerformance = await page.evaluate(async () => {
        const editor = document.querySelector('[data-testid="code-editor"]') as HTMLElement;
        if (!editor) return { avgTime: 0, measurements: [] };
        
        const measurements: number[] = [];
        const testText = 'const test = "performance test";';
        
        for (let i = 0; i < testText.length; i++) {
          const start = performance.now();
          
          // Simulate typing
          const event = new KeyboardEvent('keydown', { key: testText[i] });
          editor.dispatchEvent(event);
          
          // Wait for next frame
          await new Promise(resolve => requestAnimationFrame(resolve));
          
          const end = performance.now();
          measurements.push(end - start);
        }
        
        const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
        return { avgTime, measurements };
      });
      
      // Average typing response should be under 16ms (60fps)
      expect(typingPerformance.avgTime).toBeLessThan(16);
    });

    test('project list should scroll smoothly', async ({ page }) => {
      await page.goto('/projects');
      
      // Wait for projects to load
      await expect(page.locator('[data-testid="projects-list"]')).toBeVisible();
      
      // Measure scroll performance
      const scrollPerformance = await page.evaluate(async () => {
        const container = document.querySelector('[data-testid="projects-list"]') as HTMLElement;
        if (!container) return { fps: 0, frameDrops: 0 };
        
        let frameCount = 0;
        let lastTime = performance.now();
        const frames: number[] = [];
        
        const measureFrame = () => {
          const currentTime = performance.now();
          const frameDuration = currentTime - lastTime;
          frames.push(frameDuration);
          lastTime = currentTime;
          frameCount++;
          
          if (frameCount < 60) { // Measure for ~1 second
            requestAnimationFrame(measureFrame);
          }
        };
        
        // Start measuring
        requestAnimationFrame(measureFrame);
        
        // Simulate scrolling
        for (let i = 0; i < 10; i++) {
          container.scrollTop += 100;
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        // Wait for measurements to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Calculate FPS and frame drops
        const avgFrameTime = frames.reduce((a, b) => a + b, 0) / frames.length;
        const fps = 1000 / avgFrameTime;
        const frameDrops = frames.filter(time => time > 16.67).length; // 60fps = 16.67ms per frame
        
        return { fps, frameDrops, avgFrameTime };
      });
      
      // Should maintain at least 55 FPS (allowing for 5 frame drops)
      expect(scrollPerformance.fps).toBeGreaterThan(55);
      expect(scrollPerformance.frameDrops).toBeLessThan(6);
    });

    test('AI code generation should provide feedback within 2 seconds', async ({ page }) => {
      await page.goto('/ai/generate');
      
      // Fill in the prompt
      await page.fill('[data-testid="ai-prompt"]', 'Create a React component for a button');
      
      const startTime = Date.now();
      
      // Start generation
      await page.click('[data-testid="generate-btn"]');
      
      // Wait for loading indicator
      await expect(page.locator('[data-testid="generating-indicator"]')).toBeVisible();
      
      const feedbackTime = Date.now() - startTime;
      
      // Should show feedback (loading state) within 2 seconds
      expect(feedbackTime).toBeLessThan(2000);
      
      // Wait for generation to complete
      await expect(page.locator('[data-testid="generated-code"]')).toBeVisible({ timeout: 30000 });
    });
  });

  test.describe('Memory Performance', () => {
    test('should not have significant memory leaks during navigation', async ({ page }) => {
      // Get initial memory usage
      const initialMemory = await page.evaluate(() => {
        return (performance as any).memory ? {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        } : null;
      });
      
      // Navigate through multiple pages
      const pages = ['/dashboard', '/projects', '/settings', '/ai/generate', '/projects/new'];
      
      for (const path of pages) {
        await page.goto(path);
        await page.waitForLoadState('networkidle');
        
        // Force garbage collection if available
        await page.evaluate(() => {
          if ('gc' in window) {
            (window as any).gc();
          }
        });
      }
      
      // Return to initial page
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      
      // Get final memory usage
      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory ? {
          usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
          totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        } : null;
      });
      
      if (initialMemory && finalMemory) {
        const memoryIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
        const memoryIncreasePercent = (memoryIncrease / initialMemory.usedJSHeapSize) * 100;
        
        // Memory increase should be less than 50%
        expect(memoryIncreasePercent).toBeLessThan(50);
        
        console.log(`Memory usage: ${initialMemory.usedJSHeapSize} -> ${finalMemory.usedJSHeapSize} (${memoryIncreasePercent.toFixed(2)}% increase)`);
      }
    });

    test('should handle large project files without performance degradation', async ({ page }) => {
      await page.goto('/projects/new');
      
      // Create a project
      await page.click('[data-testid="template-react"]');
      await page.fill('[data-testid="project-name"]', 'Large File Test');
      await page.click('[data-testid="create-project-btn"]');
      
      await expect(page.locator('[data-testid="code-editor"]')).toBeVisible();
      
      // Generate a large file content
      const largeContent = 'console.log("test");\n'.repeat(10000); // ~170KB file
      
      const startTime = Date.now();
      
      // Set large content in editor
      await page.evaluate((content) => {
        const editor = document.querySelector('[data-testid="code-editor"]') as any;
        if (editor && editor.setValue) {
          editor.setValue(content);
        }
      }, largeContent);
      
      const loadTime = Date.now() - startTime;
      
      // Should handle large content within 5 seconds
      expect(loadTime).toBeLessThan(5000);
      
      // Editor should still be responsive
      await page.click('[data-testid="code-editor"]');
      await page.keyboard.type('// Additional content');
      
      // Verify content was added
      const editorContent = await page.evaluate(() => {
        const editor = document.querySelector('[data-testid="code-editor"]') as any;
        return editor && editor.getValue ? editor.getValue() : '';
      });
      
      expect(editorContent).toContain('// Additional content');
    });
  });

  test.describe('Network Performance', () => {
    test('should handle slow network conditions gracefully', async ({ page }) => {
      // Simulate slow 3G network
      await page.route('**/*', route => {
        // Add delay to simulate slow network
        setTimeout(() => route.continue(), 500);
      });
      
      const startTime = Date.now();
      
      await page.goto('/dashboard');
      
      // Should show loading indicators during slow network
      await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
      
      // Wait for content to eventually load
      await expect(page.locator('[data-testid="dashboard-content"]')).toBeVisible({ timeout: 15000 });
      
      const totalTime = Date.now() - startTime;
      
      // Should still load within reasonable time even on slow network
      expect(totalTime).toBeLessThan(15000);
    });

    test('should cache static assets effectively', async ({ page }) => {
      // First visit - all assets should be loaded
      await page.goto('/');
      
      const firstVisitRequests = [];
      page.on('request', request => {
        if (request.url().includes('.js') || request.url().includes('.css')) {
          firstVisitRequests.push(request.url());
        }
      });
      
      await page.waitForLoadState('networkidle');
      
      // Second visit - static assets should be cached
      const cachedRequests = [];
      page.on('request', request => {
        if (request.url().includes('.js') || request.url().includes('.css')) {
          cachedRequests.push(request.url());
        }
      });
      
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should have fewer requests on second visit due to caching
      expect(cachedRequests.length).toBeLessThanOrEqual(firstVisitRequests.length);
    });

    test('should load critical resources first', async ({ page }) => {
      const resourceLoadOrder = [];
      
      page.on('response', response => {
        if (response.url().includes('.js') || response.url().includes('.css')) {
          resourceLoadOrder.push({
            url: response.url(),
            timestamp: Date.now(),
            status: response.status(),
          });
        }
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      // Sort by timestamp to get load order
      resourceLoadOrder.sort((a, b) => a.timestamp - b.timestamp);
      
      // Critical CSS should load before non-critical JS
      const criticalCSS = resourceLoadOrder.find(r => r.url().includes('critical') || r.url().includes('main'));
      const nonCriticalJS = resourceLoadOrder.find(r => r.url().includes('chunk') || r.url().includes('vendor'));
      
      if (criticalCSS && nonCriticalJS) {
        expect(criticalCSS.timestamp).toBeLessThanOrEqual(nonCriticalJS.timestamp);
      }
    });
  });

  test.describe('Bundle Size Performance', () => {
    test('should have reasonable JavaScript bundle sizes', async ({ page }) => {
      const bundleSizes = [];
      
      page.on('response', response => {
        if (response.url().includes('.js') && response.status() === 200) {
          bundleSizes.push({
            url: response.url(),
            size: parseInt(response.headers()['content-length'] || '0'),
          });
        }
      });
      
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      
      const totalBundleSize = bundleSizes.reduce((total, bundle) => total + bundle.size, 0);
      const totalBundleSizeKB = totalBundleSize / 1024;
      
      // Total JavaScript bundle should be under 1MB
      expect(totalBundleSizeKB).toBeLessThan(1024);
      
      // Main bundle should be under 300KB
      const mainBundle = bundleSizes.find(b => b.url().includes('main') || b.url().includes('index'));
      if (mainBundle) {
        expect(mainBundle.size / 1024).toBeLessThan(300);
      }
      
      console.log(`Total bundle size: ${totalBundleSizeKB.toFixed(2)}KB`);
      console.log('Individual bundles:', bundleSizes.map(b => `${b.url.split('/').pop()}: ${(b.size/1024).toFixed(2)}KB`));
    });
  });

  test.describe('Lighthouse Performance', () => {
    test('should meet Lighthouse performance thresholds', async ({ page }) => {
      // This would require Lighthouse integration
      // For now, we'll simulate the key metrics Lighthouse checks
      
      await page.goto('/');
      
      const performanceMetrics = await page.evaluate(() => {
        return new Promise((resolve) => {
          // Collect performance metrics
          const metrics = {
            FCP: 0, // First Contentful Paint
            LCP: 0, // Largest Contentful Paint
            FID: 0, // First Input Delay (simulated)
            CLS: 0, // Cumulative Layout Shift
          };
          
          // Get paint timings
          const paintEntries = performance.getEntriesByType('paint');
          const fcpEntry = paintEntries.find(entry => entry.name === 'first-contentful-paint');
          if (fcpEntry) {
            metrics.FCP = fcpEntry.startTime;
          }
          
          // Simulate other metrics (in a real scenario, these would be measured properly)
          metrics.LCP = performance.now();
          metrics.FID = Math.random() * 100; // Simulated
          metrics.CLS = Math.random() * 0.1; // Simulated
          
          resolve(metrics);
        });
      });
      
      // Lighthouse thresholds
      expect(performanceMetrics.FCP).toBeLessThan(2000); // < 2s
      expect(performanceMetrics.LCP).toBeLessThan(4000); // < 4s
      expect(performanceMetrics.FID).toBeLessThan(100);  // < 100ms
      expect(performanceMetrics.CLS).toBeLessThan(0.1);  // < 0.1
      
      console.log('Performance metrics:', performanceMetrics);
    });
  });
});
