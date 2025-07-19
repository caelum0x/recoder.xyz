const { BaseAnalyzer } = require('./baseAnalyzer');
const { FileUtils } = require('../utils/file-utils');
const { logger } = require('../utils/logger');
const path = require('path');

class MobileAnalyzer extends BaseAnalyzer {
  constructor(options = {}) {
    super(options);
    this.mobileFrameworks = {
      reactNative: {
        packages: ['react-native', '@react-native-community', 'react-native-vector-icons'],
        files: ['metro.config.js', 'react-native.config.js', 'android/', 'ios/'],
        extensions: ['.jsx', '.tsx']
      },
      flutter: {
        packages: ['flutter'],
        files: ['pubspec.yaml', 'lib/', 'android/', 'ios/'],
        extensions: ['.dart']
      },
      ionic: {
        packages: ['@ionic/angular', '@ionic/react', '@ionic/vue'],
        files: ['ionic.config.json', 'capacitor.config.json'],
        extensions: ['.ts', '.js']
      },
      xamarin: {
        packages: ['xamarin'],
        files: ['*.csproj', '*.sln'],
        extensions: ['.cs', '.xaml']
      },
      cordova: {
        packages: ['cordova'],
        files: ['config.xml', 'www/', 'platforms/'],
        extensions: ['.js', '.html']
      },
      nativeScript: {
        packages: ['@nativescript/core'],
        files: ['nativescript.config.ts', 'App_Resources/'],
        extensions: ['.ts', '.js']
      }
    };

    this.mobileFeatures = {
      navigation: /\b(navigation|router|stack|tab|drawer)\b/gi,
      storage: /\b(asyncstorage|sqlite|realm|storage)\b/gi,
      network: /\b(fetch|axios|api|http|request)\b/gi,
      ui: /\b(component|view|text|button|image|scroll)\b/gi,
      device: /\b(camera|location|accelerometer|gyroscope|fingerprint|face)\b/gi,
      push: /\b(push|notification|fcm|apns)\b/gi,
      auth: /\b(auth|login|oauth|biometric)\b/gi,
      payment: /\b(payment|stripe|paypal|iap|billing)\b/gi,
      analytics: /\b(analytics|tracking|firebase|mixpanel)\b/gi,
      performance: /\b(performance|memory|cpu|fps|benchmark)\b/gi
    };

    this.platforms = ['ios', 'android', 'web', 'windows', 'macos'];
  }

  async analyze(input, context = {}) {
    try {
      const { projectPath, packageJson, files } = input;
      
      const analysis = await this.performAsyncAnalysis(input, async () => {
        const results = {
          framework: await this.detectMobileFramework(packageJson || projectPath),
          platforms: await this.analyzeSupportedPlatforms(projectPath),
          features: await this.analyzeMobileFeatures(files || projectPath),
          navigation: await this.analyzeNavigation(files || projectPath),
          storage: await this.analyzeStorage(files || projectPath),
          performance: await this.analyzePerformance(files || projectPath),
          deployment: await this.analyzeDeployment(projectPath),
          testing: await this.analyzeTesting(packageJson || projectPath),
          accessibility: await this.analyzeAccessibility(files || projectPath),
          internationalization: await this.analyzeI18n(files || projectPath)
        };

        results.summary = this.generateMobileSummary(results);
        results.metrics = this.generateMobileMetrics(results);
        results.recommendations = this.generateMobileRecommendations(results);
        results.complexity = this.calculateMobileComplexity(results);
        
        return results;
      });

      return this.createAnalysisResult(analysis, {
        analysisType: 'mobile',
        projectPath: typeof input === 'string' ? input : input.projectPath
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  async detectMobileFramework(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      const framework = {
        name: 'unknown',
        version: null,
        confidence: 0,
        packages: []
      };

      if (!packageJson) {
        // Check for non-Node.js frameworks
        const projectPath = typeof packageJsonPath === 'string' ? 
          (packageJsonPath.endsWith('package.json') ? path.dirname(packageJsonPath) : packageJsonPath) : 
          '.';
        
        if (await FileUtils.fileExists(path.join(projectPath, 'pubspec.yaml'))) {
          framework.name = 'flutter';
          framework.confidence = 95;
          return framework;
        }
        
        if (await FileUtils.fileExists(path.join(projectPath, 'config.xml'))) {
          framework.name = 'cordova';
          framework.confidence = 90;
          return framework;
        }
        
        return framework;
      }

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const [frameworkName, config] of Object.entries(this.mobileFrameworks)) {
        const foundPackages = config.packages.filter(pkg => 
          Object.keys(deps).some(dep => dep.includes(pkg))
        );
        
        if (foundPackages.length > 0) {
          const confidence = Math.min(100, (foundPackages.length / config.packages.length) * 100 + 30);
          
          if (confidence > framework.confidence) {
            framework.name = frameworkName;
            framework.confidence = confidence;
            framework.packages = foundPackages.map(pkg => ({
              name: pkg,
              version: deps[pkg] || 'unknown'
            }));
          }
        }
      }

      return framework;
    } catch (error) {
      logger.error('Mobile framework detection failed:', error);
      return { name: 'unknown', version: null, confidence: 0 };
    }
  }

  async analyzeSupportedPlatforms(projectPath) {
    try {
      const platforms = {
        supported: [],
        configured: [],
        buildFiles: []
      };

      if (!projectPath) return platforms;

      // Check for platform-specific directories and files
      for (const platform of this.platforms) {
        const platformPath = path.join(projectPath, platform);
        if (await FileUtils.fileExists(platformPath)) {
          platforms.supported.push(platform);
          platforms.configured.push({
            platform,
            path: platformPath,
            configured: true
          });
        }
      }

      // Check for build configuration files
      const buildFiles = [
        'android/build.gradle',
        'ios/Podfile',
        'capacitor.config.json',
        'metro.config.js',
        'webpack.config.js'
      ];

      for (const buildFile of buildFiles) {
        const filePath = path.join(projectPath, buildFile);
        if (await FileUtils.fileExists(filePath)) {
          platforms.buildFiles.push(buildFile);
        }
      }

      platforms.summary = {
        totalPlatforms: platforms.supported.length,
        mainPlatforms: platforms.supported.filter(p => ['ios', 'android'].includes(p)).length,
        buildConfigurations: platforms.buildFiles.length
      };

      return platforms;
    } catch (error) {
      logger.error('Platform analysis failed:', error);
      return {};
    }
  }

  async analyzeMobileFeatures(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => {
          const ext = path.extname(file);
          return ['.js', '.ts', '.jsx', '.tsx', '.dart', '.swift', '.kt'].includes(ext);
        });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const features = {};
      let totalContent = '';

      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) {
          totalContent += content + ' ';
        }
      }

      // Analyze features using patterns
      for (const [featureName, pattern] of Object.entries(this.mobileFeatures)) {
        const matches = totalContent.match(pattern) || [];
        features[featureName] = {
          detected: matches.length > 0,
          count: matches.length,
          keywords: [...new Set(matches.map(m => m.toLowerCase()))]
        };
      }

      // Additional specific feature detection
      features.components = await this.analyzeComponents(files);
      features.screens = await this.analyzeScreens(files);
      features.services = await this.analyzeServices(files);

      features.summary = {
        totalFeatures: Object.values(features).filter(f => f.detected || f.count > 0).length,
        coreFeatures: this.identifyCoreFeatures(features),
        advancedFeatures: this.identifyAdvancedFeatures(features)
      };

      return features;
    } catch (error) {
      logger.error('Mobile features analysis failed:', error);
      return {};
    }
  }

  async analyzeComponents(files) {
    const components = {
      total: 0,
      custom: 0,
      native: 0,
      thirdParty: 0
    };

    for (const file of files) {
      const content = await FileUtils.readFile(file);
      if (!content) continue;

      // Count React Native components
      const componentPatterns = [
        /<([A-Z][A-Za-z]*)/g, // JSX components
        /class\s+([A-Z][A-Za-z]*)\s+extends\s+Component/g, // Class components
        /const\s+([A-Z][A-Za-z]*)\s*=.*=>/g // Functional components
      ];

      for (const pattern of componentPatterns) {
        const matches = content.match(pattern) || [];
        components.total += matches.length;
      }

      // Identify component types
      if (content.includes('View') || content.includes('Text') || content.includes('Button')) {
        components.native++;
      }
      if (content.includes('import') && content.includes('from \'react-native')) {
        components.custom++;
      }
    }

    return components;
  }

  async analyzeScreens(files) {
    const screens = {
      total: 0,
      navigable: 0,
      modal: 0,
      tabbed: 0
    };

    for (const file of files) {
      if (file.toLowerCase().includes('screen') || file.toLowerCase().includes('page')) {
        screens.total++;
      }

      const content = await FileUtils.readFile(file);
      if (!content) continue;

      if (content.includes('navigation') || content.includes('navigator')) {
        screens.navigable++;
      }
      if (content.includes('modal') || content.includes('Modal')) {
        screens.modal++;
      }
      if (content.includes('tab') || content.includes('Tab')) {
        screens.tabbed++;
      }
    }

    return screens;
  }

  async analyzeServices(files) {
    const services = {
      total: 0,
      api: 0,
      storage: 0,
      auth: 0,
      analytics: 0
    };

    for (const file of files) {
      if (file.toLowerCase().includes('service') || file.toLowerCase().includes('api')) {
        services.total++;
      }

      const content = await FileUtils.readFile(file);
      if (!content) continue;

      if (content.includes('fetch') || content.includes('axios') || content.includes('api')) {
        services.api++;
      }
      if (content.includes('AsyncStorage') || content.includes('storage')) {
        services.storage++;
      }
      if (content.includes('auth') || content.includes('login')) {
        services.auth++;
      }
      if (content.includes('analytics') || content.includes('tracking')) {
        services.analytics++;
      }
    }

    return services;
  }

  identifyCoreFeatures(features) {
    const coreFeatureNames = ['navigation', 'ui', 'network', 'storage'];
    return coreFeatureNames.filter(name => features[name]?.detected);
  }

  identifyAdvancedFeatures(features) {
    const advancedFeatureNames = ['device', 'push', 'payment', 'analytics', 'performance'];
    return advancedFeatureNames.filter(name => features[name]?.detected);
  }

  async analyzeNavigation(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => ['.js', '.ts', '.jsx', '.tsx'].includes(path.extname(file)));
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const navigation = {
        type: 'unknown',
        patterns: [],
        screens: [],
        structure: {}
      };

      let totalContent = '';
      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) totalContent += content + ' ';
      }

      // Detect navigation type
      if (totalContent.includes('@react-navigation') || totalContent.includes('NavigationContainer')) {
        navigation.type = 'react-navigation';
      } else if (totalContent.includes('Router') && totalContent.includes('ionic')) {
        navigation.type = 'ionic-router';
      } else if (totalContent.includes('flutter')) {
        navigation.type = 'flutter-navigation';
      }

      // Analyze navigation patterns
      const navPatterns = [
        /StackNavigator|createStackNavigator/g,
        /TabNavigator|createBottomTabNavigator/g,
        /DrawerNavigator|createDrawerNavigator/g
      ];

      for (const pattern of navPatterns) {
        const matches = totalContent.match(pattern) || [];
        if (matches.length > 0) {
          navigation.patterns.push({
            type: pattern.source.split('|')[1] || pattern.source,
            count: matches.length
          });
        }
      }

      navigation.summary = {
        navigationType: navigation.type,
        totalPatterns: navigation.patterns.length,
        complexityScore: this.calculateNavigationComplexity(navigation)
      };

      return navigation;
    } catch (error) {
      logger.error('Navigation analysis failed:', error);
      return {};
    }
  }

  calculateNavigationComplexity(navigation) {
    let complexity = 0;
    complexity += navigation.patterns.length * 2;
    complexity += navigation.screens.length;
    
    // Add complexity for nested navigation
    if (navigation.patterns.some(p => p.type.includes('Stack')) && 
        navigation.patterns.some(p => p.type.includes('Tab'))) {
      complexity += 5;
    }
    
    return complexity;
  }

  async analyzeStorage(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => ['.js', '.ts', '.jsx', '.tsx'].includes(path.extname(file)));
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const storage = {
        types: [],
        patterns: {},
        security: {}
      };

      let totalContent = '';
      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) totalContent += content + ' ';
      }

      // Detect storage types
      const storagePatterns = {
        asyncStorage: /AsyncStorage/g,
        sqlite: /SQLite|sqlite/g,
        realm: /Realm/g,
        mmkv: /MMKV/g,
        keychain: /Keychain|keychain/g,
        secureStore: /SecureStore/g
      };

      for (const [storageType, pattern] of Object.entries(storagePatterns)) {
        const matches = totalContent.match(pattern) || [];
        if (matches.length > 0) {
          storage.types.push(storageType);
          storage.patterns[storageType] = matches.length;
        }
      }

      // Analyze security patterns
      storage.security = {
        encrypted: totalContent.includes('encrypt') || totalContent.includes('secure'),
        keychain: totalContent.includes('Keychain') || totalContent.includes('SecureStore'),
        biometric: totalContent.includes('biometric') || totalContent.includes('fingerprint')
      };

      storage.summary = {
        storageTypes: storage.types.length,
        securityFeatures: Object.values(storage.security).filter(Boolean).length,
        recommendations: this.generateStorageRecommendations(storage)
      };

      return storage;
    } catch (error) {
      logger.error('Storage analysis failed:', error);
      return {};
    }
  }

  generateStorageRecommendations(storage) {
    const recommendations = [];

    if (!storage.security.encrypted && storage.types.includes('asyncStorage')) {
      recommendations.push('Consider using encrypted storage for sensitive data');
    }

    if (!storage.security.keychain && storage.types.length > 0) {
      recommendations.push('Implement keychain/secure store for credentials');
    }

    if (storage.types.length > 2) {
      recommendations.push('Consider consolidating storage solutions');
    }

    return recommendations;
  }

  async analyzePerformance(filesOrPath) {
    // Mock performance analysis for mobile
    return {
      bundleSize: { estimated: '15MB', optimized: false },
      renderingOptimizations: { implemented: false },
      memoryManagement: { score: 70 },
      networkOptimizations: { caching: false, compression: false },
      lazyLoading: { screens: 0, components: 0 },
      score: 65,
      recommendations: [
        'Implement code splitting for screens',
        'Add image optimization and caching',
        'Use React.memo for expensive components'
      ]
    };
  }

  async analyzeDeployment(projectPath) {
    try {
      const deployment = {
        ios: { configured: false, files: [] },
        android: { configured: false, files: [] },
        ci: { configured: false, files: [] }
      };

      if (!projectPath) return deployment;

      // Check iOS deployment
      const iosFiles = ['ios/Info.plist', 'ios/project.pbxproj', 'fastlane/Fastfile'];
      for (const file of iosFiles) {
        if (await FileUtils.fileExists(path.join(projectPath, file))) {
          deployment.ios.files.push(file);
          deployment.ios.configured = true;
        }
      }

      // Check Android deployment
      const androidFiles = ['android/app/build.gradle', 'android/gradle.properties', 'fastlane/Fastfile'];
      for (const file of androidFiles) {
        if (await FileUtils.fileExists(path.join(projectPath, file))) {
          deployment.android.files.push(file);
          deployment.android.configured = true;
        }
      }

      // Check CI/CD
      const ciFiles = ['.github/workflows/', '.gitlab-ci.yml', 'azure-pipelines.yml', 'bitrise.yml'];
      for (const file of ciFiles) {
        if (await FileUtils.fileExists(path.join(projectPath, file))) {
          deployment.ci.files.push(file);
          deployment.ci.configured = true;
        }
      }

      deployment.summary = {
        platformsConfigured: [deployment.ios.configured, deployment.android.configured].filter(Boolean).length,
        ciConfigured: deployment.ci.configured,
        totalConfigFiles: deployment.ios.files.length + deployment.android.files.length + deployment.ci.files.length
      };

      return deployment;
    } catch (error) {
      logger.error('Deployment analysis failed:', error);
      return {};
    }
  }

  async analyzeTesting(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      const testing = {
        frameworks: [],
        types: [],
        coverage: false
      };

      if (!packageJson) return testing;

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check testing frameworks
      const testingFrameworks = {
        jest: /jest/i,
        detox: /detox/i,
        appium: /appium/i,
        enzyme: /enzyme/i,
        'react-native-testing-library': /@testing-library\/react-native/i
      };

      for (const [framework, pattern] of Object.entries(testingFrameworks)) {
        if (Object.keys(deps).some(dep => pattern.test(dep))) {
          testing.frameworks.push(framework);
        }
      }

      // Check testing types
      if (testing.frameworks.includes('jest')) testing.types.push('unit');
      if (testing.frameworks.includes('detox') || testing.frameworks.includes('appium')) {
        testing.types.push('e2e');
      }
      if (testing.frameworks.includes('react-native-testing-library')) {
        testing.types.push('integration');
      }

      // Check coverage
      testing.coverage = Object.keys(deps).some(dep => dep.includes('coverage'));

      testing.summary = {
        testingFrameworks: testing.frameworks.length,
        testingTypes: testing.types.length,
        coverageEnabled: testing.coverage
      };

      return testing;
    } catch (error) {
      logger.error('Testing analysis failed:', error);
      return {};
    }
  }

  async analyzeAccessibility(filesOrPath) {
    // Mock accessibility analysis
    return {
      features: {
        accessibilityLabels: { implemented: false, coverage: 20 },
        accessibilityHints: { implemented: false, coverage: 15 },
        accessibilityRoles: { implemented: false, coverage: 30 },
        screenReader: { supported: false },
        dynamicType: { supported: false }
      },
      score: 35,
      recommendations: [
        'Add accessibility labels to interactive elements',
        'Implement dynamic type support',
        'Test with screen readers'
      ]
    };
  }

  async analyzeI18n(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const i18n = {
        implemented: false,
        libraries: [],
        languages: [],
        translationFiles: []
      };

      let hasI18nFiles = false;
      let totalContent = '';

      for (const file of files) {
        const fileName = path.basename(file);
        
        // Check for translation files
        if (fileName.includes('i18n') || fileName.includes('locale') || fileName.includes('translation')) {
          i18n.translationFiles.push(file);
          hasI18nFiles = true;
        }

        // Check for language files
        if (/\.(en|es|fr|de|it|pt|ja|ko|zh)\.json$/.test(fileName)) {
          const lang = fileName.match(/\.([a-z]{2})\.json$/)[1];
          if (!i18n.languages.includes(lang)) {
            i18n.languages.push(lang);
          }
        }

        const content = await FileUtils.readFile(file);
        if (content) totalContent += content + ' ';
      }

      // Check for i18n libraries
      if (totalContent.includes('react-i18next') || totalContent.includes('i18next')) {
        i18n.libraries.push('i18next');
        i18n.implemented = true;
      }
      if (totalContent.includes('react-intl')) {
        i18n.libraries.push('react-intl');
        i18n.implemented = true;
      }

      i18n.implemented = i18n.implemented || hasI18nFiles || i18n.languages.length > 0;

      i18n.summary = {
        internationalized: i18n.implemented,
        supportedLanguages: i18n.languages.length,
        translationFiles: i18n.translationFiles.length
      };

      return i18n;
    } catch (error) {
      logger.error('I18n analysis failed:', error);
      return {};
    }
  }

  calculateMobileComplexity(analysis) {
    let complexity = 0;
    
    // Framework complexity
    const frameworkComplexity = {
      'reactNative': 5,
      'flutter': 6,
      'ionic': 4,
      'xamarin': 7,
      'cordova': 3,
      'nativeScript': 6
    };
    complexity += frameworkComplexity[analysis.framework?.name] || 3;
    
    // Platform complexity
    complexity += (analysis.platforms?.summary?.totalPlatforms || 1) * 2;
    
    // Feature complexity
    complexity += (analysis.features?.summary?.totalFeatures || 0);
    complexity += (analysis.features?.summary?.advancedFeatures?.length || 0) * 2;
    
    // Navigation complexity
    complexity += analysis.navigation?.summary?.complexityScore || 0;
    
    return {
      score: complexity,
      level: this.getComplexityLevel(complexity),
      factors: {
        framework: analysis.framework?.name,
        platforms: analysis.platforms?.summary?.totalPlatforms || 0,
        features: analysis.features?.summary?.totalFeatures || 0,
        navigation: analysis.navigation?.summary?.complexityScore || 0
      }
    };
  }

  getComplexityLevel(score) {
    if (score < 15) return 'low';
    if (score < 30) return 'medium';
    if (score < 50) return 'high';
    return 'very high';
  }

  generateMobileSummary(analysis) {
    const framework = analysis.framework?.name || 'unknown';
    const platforms = analysis.platforms?.summary?.totalPlatforms || 0;
    const features = analysis.features?.summary?.totalFeatures || 0;

    return {
      overview: `${framework} mobile app supporting ${platforms} platforms with ${features} detected features`,
      framework: analysis.framework,
      platforms: platforms,
      complexity: analysis.complexity?.level || 'unknown',
      readiness: this.assessMobileReadiness(analysis),
      recommendations: this.generateMobileRecommendations(analysis).slice(0, 3)
    };
  }

  assessMobileReadiness(analysis) {
    const factors = [
      analysis.framework?.confidence > 80,
      (analysis.platforms?.summary?.totalPlatforms || 0) >= 2,
      (analysis.features?.summary?.coreFeatures?.length || 0) >= 3,
      analysis.testing?.summary?.testingFrameworks > 0,
      analysis.deployment?.summary?.platformsConfigured > 0
    ];

    const readinessScore = factors.filter(Boolean).length;
    
    if (readinessScore >= 4) return 'production-ready';
    if (readinessScore >= 3) return 'development';
    if (readinessScore >= 2) return 'prototype';
    return 'concept';
  }

  generateMobileMetrics(analysis) {
    return {
      frameworkConfidence: analysis.framework?.confidence || 0,
      platformSupport: analysis.platforms?.summary?.totalPlatforms || 0,
      featureRichness: analysis.features?.summary?.totalFeatures || 0,
      navigationComplexity: analysis.navigation?.summary?.complexityScore || 0,
      testingCoverage: analysis.testing?.summary?.testingFrameworks || 0,
      deploymentReadiness: analysis.deployment?.summary?.platformsConfigured || 0,
      accessibilityScore: analysis.accessibility?.score || 0,
      overallComplexity: analysis.complexity?.score || 0
    };
  }

  generateMobileRecommendations(analysis) {
    const recommendations = [];

    if ((analysis.framework?.confidence || 0) < 80) {
      recommendations.push({
        type: 'framework',
        priority: 'high',
        message: 'Framework detection confidence is low - verify project setup',
        action: 'Review package.json and project structure'
      });
    }

    if ((analysis.platforms?.summary?.totalPlatforms || 0) < 2) {
      recommendations.push({
        type: 'platform',
        priority: 'medium',
        message: 'Consider supporting multiple platforms for wider reach',
        action: 'Add iOS/Android platform configurations'
      });
    }

    if (!analysis.testing?.summary?.testingFrameworks) {
      recommendations.push({
        type: 'testing',
        priority: 'high',
        message: 'No testing framework detected - implement testing strategy',
        action: 'Add Jest and React Native Testing Library'
      });
    }

    if ((analysis.accessibility?.score || 0) < 60) {
      recommendations.push({
        type: 'accessibility',
        priority: 'medium',
        message: 'Improve accessibility features for better user experience',
        action: 'Add accessibility labels and screen reader support'
      });
    }

    if (!analysis.deployment?.summary?.ciConfigured) {
      recommendations.push({
        type: 'deployment',
        priority: 'medium',
        message: 'Set up CI/CD pipeline for automated builds and deployments',
        action: 'Configure GitHub Actions or Fastlane'
      });
    }

    if (!analysis.i18n?.summary?.internationalized) {
      recommendations.push({
        type: 'i18n',
        priority: 'low',
        message: 'Consider implementing internationalization for global reach',
        action: 'Add i18next or react-intl for multi-language support'
      });
    }

    return recommendations;
  }
}

module.exports = { MobileAnalyzer };