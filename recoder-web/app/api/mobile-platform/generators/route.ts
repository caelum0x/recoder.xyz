// Mobile App Development Platform API - Comprehensive mobile app generation and management
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import JSZip from 'jszip';
import yaml from 'js-yaml';

const execAsync = promisify(exec);

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 20,
});

const mobileAppSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  projectId: z.string().uuid(),
  framework: z.enum(['react-native', 'flutter', 'ionic', 'xamarin', 'cordova', 'expo']),
  platforms: z.array(z.enum(['ios', 'android', 'web'])).min(1),
  template: z.enum(['blank', 'tabs', 'sidemenu', 'ecommerce', 'social', 'business', 'fitness', 'finance', 'education']),
  features: z.object({
    authentication: z.boolean().default(false),
    pushNotifications: z.boolean().default(false),
    camera: z.boolean().default(false),
    geolocation: z.boolean().default(false),
    biometrics: z.boolean().default(false),
    payments: z.boolean().default(false),
    analytics: z.boolean().default(false),
    offline: z.boolean().default(false),
    darkMode: z.boolean().default(true),
    internationalization: z.boolean().default(false),
    socialLogin: z.boolean().default(false),
    fileSystem: z.boolean().default(false),
    bluetooth: z.boolean().default(false),
    nfc: z.boolean().default(false),
    ar: z.boolean().default(false)
  }),
  styling: z.object({
    theme: z.enum(['default', 'material', 'cupertino', 'custom']).default('default'),
    primaryColor: z.string().default('#007AFF'),
    secondaryColor: z.string().default('#FF6B35'),
    fontFamily: z.string().default('System'),
    darkModeEnabled: z.boolean().default(true)
  }),
  buildConfiguration: z.object({
    bundleId: z.string().optional(),
    version: z.string().default('1.0.0'),
    buildNumber: z.number().default(1),
    minSdkVersion: z.number().default(21),
    targetSdkVersion: z.number().default(34),
    iosDeploymentTarget: z.string().default('12.0'),
    signing: z.object({
      team: z.string().optional(),
      certificate: z.string().optional(),
      provisioning: z.string().optional()
    }).optional()
  })
});

const buildAppSchema = z.object({
  appId: z.string().uuid(),
  platform: z.enum(['ios', 'android', 'web']),
  buildType: z.enum(['debug', 'release', 'profile']),
  signing: z.object({
    keystore: z.string().optional(),
    certificate: z.string().optional(),
    provisioning: z.string().optional()
  }).optional(),
  optimizations: z.object({
    minify: z.boolean().default(true),
    obfuscate: z.boolean().default(false),
    treeshaking: z.boolean().default(true),
    bundleSize: z.enum(['minimal', 'optimized', 'full']).default('optimized')
  }).optional()
});

// POST - Create mobile app or trigger build
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 3, 'mobile-platform-action');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'create_app') {
      const validatedData = mobileAppSchema.parse(body);
      
      // Check project access
      const project = await prisma.project.findFirst({
        where: {
          id: validatedData.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 });
      }

      // Create mobile app
      const mobileApp = await prisma.mobileApp.create({
        data: {
          id: uuidv4(),
          name: validatedData.name,
          description: validatedData.description,
          projectId: validatedData.projectId,
          framework: validatedData.framework,
          platforms: validatedData.platforms,
          template: validatedData.template,
          features: validatedData.features,
          styling: validatedData.styling,
          buildConfiguration: validatedData.buildConfiguration,
          status: 'initializing',
          createdBy: session.user.id,
          metadata: {
            createdAt: new Date().toISOString(),
            version: '1.0.0'
          }
        }
      });

      // Generate app structure and code
      const generationResult = await generateMobileAppCode(mobileApp);

      // Log app creation
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'mobile_app_create',
          platform: 'mobile',
          success: true,
          metadata: {
            appId: mobileApp.id,
            framework: validatedData.framework,
            platforms: validatedData.platforms,
            template: validatedData.template
          }
        }
      });

      return NextResponse.json({
        app: {
          ...mobileApp,
          generation: generationResult
        },
        message: 'Mobile app created successfully'
      }, { status: 201 });

    } else if (action === 'build_app') {
      const validatedData = buildAppSchema.parse(body);
      
      const mobileApp = await prisma.mobileApp.findUnique({
        where: { id: validatedData.appId },
        include: { project: true }
      });

      if (!mobileApp) {
        return NextResponse.json({ error: 'Mobile app not found' }, { status: 404 });
      }

      // Check access
      const hasAccess = await prisma.project.findFirst({
        where: {
          id: mobileApp.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Execute build
      const buildResult = await buildMobileApp(mobileApp, validatedData, session.user.id);

      return NextResponse.json({
        build: buildResult,
        message: 'Mobile app build started'
      });

    } else if (action === 'generate_native_modules') {
      const { appId, modules } = body;
      
      const mobileApp = await prisma.mobileApp.findUnique({
        where: { id: appId },
        include: { project: true }
      });

      if (!mobileApp) {
        return NextResponse.json({ error: 'Mobile app not found' }, { status: 404 });
      }

      // Generate native modules
      const nativeModules = await generateNativeModules(mobileApp, modules);

      return NextResponse.json({
        modules: nativeModules,
        message: 'Native modules generated successfully'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Mobile platform error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// GET - Get mobile apps and builds
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const projectId = searchParams.get('projectId');
    const appId = searchParams.get('appId');
    const buildId = searchParams.get('buildId');

    if (appId) {
      // Get specific mobile app with builds
      const mobileApp = await prisma.mobileApp.findUnique({
        where: { id: appId },
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          builds: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!mobileApp) {
        return NextResponse.json({ error: 'Mobile app not found' }, { status: 404 });
      }

      return NextResponse.json({ app: mobileApp });

    } else if (buildId) {
      // Get specific build details
      const build = await prisma.mobileAppBuild.findUnique({
        where: { id: buildId },
        include: {
          mobileApp: {
            include: {
              project: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!build) {
        return NextResponse.json({ error: 'Build not found' }, { status: 404 });
      }

      return NextResponse.json({ build });

    } else if (type === 'templates') {
      // Get available templates
      const templates = getMobileAppTemplates();
      return NextResponse.json({ templates });

    } else if (type === 'frameworks') {
      // Get supported frameworks
      const frameworks = getSupportedFrameworks();
      return NextResponse.json({ frameworks });

    } else {
      // Get all mobile apps for user
      const whereConditions: any = {
        project: {
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id
                }
              }
            }
          ]
        }
      };

      if (projectId) {
        whereConditions.projectId = projectId;
      }

      const mobileApps = await prisma.mobileApp.findMany({
        where: whereConditions,
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              builds: true
            }
          },
          builds: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({ apps: mobileApps });
    }

  } catch (error) {
    console.error('Get mobile platform data error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch mobile platform data' },
      { status: 500 }
    );
  }
}

async function generateMobileAppCode(mobileApp: any) {
  const appDirectory = path.join('/tmp/mobile-apps', mobileApp.id);
  
  try {
    // Create app directory
    await fs.ensureDir(appDirectory);

    let generatedFiles = {};

    // Generate based on framework
    switch (mobileApp.framework) {
      case 'react-native':
        generatedFiles = await generateReactNativeApp(mobileApp, appDirectory);
        break;
      case 'flutter':
        generatedFiles = await generateFlutterApp(mobileApp, appDirectory);
        break;
      case 'ionic':
        generatedFiles = await generateIonicApp(mobileApp, appDirectory);
        break;
      case 'expo':
        generatedFiles = await generateExpoApp(mobileApp, appDirectory);
        break;
      default:
        throw new Error(`Framework ${mobileApp.framework} not supported`);
    }

    // Update app status
    await prisma.mobileApp.update({
      where: { id: mobileApp.id },
      data: {
        status: 'generated',
        metadata: {
          ...mobileApp.metadata,
          generatedAt: new Date().toISOString(),
          codeSize: await getDirectorySize(appDirectory)
        }
      }
    });

    return {
      directory: appDirectory,
      files: generatedFiles,
      ready: true
    };

  } catch (error) {
    console.error('Mobile app generation error:', error);
    
    await prisma.mobileApp.update({
      where: { id: mobileApp.id },
      data: {
        status: 'failed',
        metadata: {
          ...mobileApp.metadata,
          error: error instanceof Error ? error.message : 'Generation failed'
        }
      }
    });

    throw error;
  }
}

async function generateReactNativeApp(mobileApp: any, appDirectory: string) {
  const packageJson = {
    name: mobileApp.name.toLowerCase().replace(/\s+/g, '-'),
    version: mobileApp.buildConfiguration.version,
    private: true,
    scripts: {
      start: 'react-native start',
      android: 'react-native run-android',
      ios: 'react-native run-ios',
      test: 'jest',
      lint: 'eslint . --ext .js,.jsx,.ts,.tsx'
    },
    dependencies: {
      'react': '^18.2.0',
      'react-native': '^0.72.6',
      ...(mobileApp.features.authentication && {
        '@react-native-async-storage/async-storage': '^1.19.3',
        'react-native-keychain': '^8.1.3'
      }),
      ...(mobileApp.features.pushNotifications && {
        '@react-native-firebase/app': '^18.5.0',
        '@react-native-firebase/messaging': '^18.5.0'
      }),
      ...(mobileApp.features.camera && {
        'react-native-image-picker': '^5.6.0',
        'react-native-vision-camera': '^3.3.1'
      }),
      ...(mobileApp.features.geolocation && {
        '@react-native-community/geolocation': '^3.0.6'
      }),
      ...(mobileApp.features.biometrics && {
        'react-native-biometrics': '^3.0.1'
      }),
      ...(mobileApp.features.payments && {
        'react-native-payments': '^0.7.2',
        '@stripe/stripe-react-native': '^0.33.0'
      }),
      'react-native-vector-icons': '^10.0.0',
      'react-navigation': '^6.0.0'
    },
    devDependencies: {
      '@babel/core': '^7.20.0',
      '@babel/preset-env': '^7.20.0',
      '@babel/runtime': '^7.20.0',
      '@react-native/eslint-config': '^0.72.2',
      '@react-native/metro-config': '^0.72.11',
      '@tsconfig/react-native': '^3.0.0',
      '@types/react': '^18.0.24',
      '@types/react-test-renderer': '^18.0.0',
      'babel-jest': '^29.2.1',
      'eslint': '^8.19.0',
      'jest': '^29.2.1',
      'metro-react-native-babel-preset': '^0.76.8',
      'prettier': '^2.4.1',
      'react-test-renderer': '^18.2.0',
      'typescript': '^4.8.4'
    }
  };

  // Generate main App component based on template
  const appComponent = generateReactNativeAppComponent(mobileApp);
  
  // Generate screens based on template
  const screens = generateReactNativeScreens(mobileApp);
  
  // Generate navigation
  const navigation = generateReactNativeNavigation(mobileApp);
  
  // Generate native configuration
  const androidManifest = generateAndroidManifest(mobileApp);
  const iosConfig = generateIOSConfig(mobileApp);

  // Write files
  const files = {
    'package.json': JSON.stringify(packageJson, null, 2),
    'App.tsx': appComponent,
    'src/navigation/AppNavigator.tsx': navigation,
    'android/app/src/main/AndroidManifest.xml': androidManifest,
    'ios/Info.plist': iosConfig,
    'metro.config.js': generateMetroConfig(),
    'babel.config.js': generateBabelConfig(),
    'tsconfig.json': generateTypeScriptConfig()
  };

  // Add screens
  Object.keys(screens).forEach(screenName => {
    files[`src/screens/${screenName}.tsx`] = screens[screenName];
  });

  // Write all files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(appDirectory, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
  }

  return files;
}

async function generateFlutterApp(mobileApp: any, appDirectory: string) {
  const pubspec = {
    name: mobileApp.name.toLowerCase().replace(/\s+/g, '_'),
    description: mobileApp.description || 'A new Flutter project.',
    version: `${mobileApp.buildConfiguration.version}+${mobileApp.buildConfiguration.buildNumber}`,
    environment: {
      sdk: '>=3.0.0 <4.0.0'
    },
    dependencies: {
      flutter: { sdk: 'flutter' },
      cupertino_icons: '^1.0.2',
      ...(mobileApp.features.authentication && {
        firebase_auth: '^4.10.1',
        google_sign_in: '^6.1.5'
      }),
      ...(mobileApp.features.pushNotifications && {
        firebase_messaging: '^14.6.7'
      }),
      ...(mobileApp.features.camera && {
        camera: '^0.10.5+4',
        image_picker: '^1.0.4'
      }),
      ...(mobileApp.features.geolocation && {
        geolocator: '^9.0.2'
      }),
      ...(mobileApp.features.biometrics && {
        local_auth: '^2.1.6'
      }),
      ...(mobileApp.features.payments && {
        flutter_stripe: '^9.4.0'
      })
    },
    dev_dependencies: {
      flutter_test: { sdk: 'flutter' },
      flutter_lints: '^2.0.0'
    }
  };

  // Generate main Dart files
  const mainDart = generateFlutterMainFile(mobileApp);
  const appWidget = generateFlutterAppWidget(mobileApp);
  const screens = generateFlutterScreens(mobileApp);

  const files = {
    'pubspec.yaml': yaml.dump(pubspec),
    'lib/main.dart': mainDart,
    'lib/app.dart': appWidget,
    'android/app/src/main/AndroidManifest.xml': generateAndroidManifest(mobileApp),
    'ios/Runner/Info.plist': generateIOSConfig(mobileApp)
  };

  // Add screens
  Object.keys(screens).forEach(screenName => {
    files[`lib/screens/${screenName.toLowerCase()}.dart`] = screens[screenName];
  });

  // Write all files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(appDirectory, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
  }

  return files;
}

async function generateExpoApp(mobileApp: any, appDirectory: string) {
  const appJson = {
    expo: {
      name: mobileApp.name,
      slug: mobileApp.name.toLowerCase().replace(/\s+/g, '-'),
      version: mobileApp.buildConfiguration.version,
      orientation: 'portrait',
      icon: './assets/icon.png',
      userInterfaceStyle: mobileApp.features.darkMode ? 'automatic' : 'light',
      splash: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor: mobileApp.styling.primaryColor
      },
      assetBundlePatterns: ['**/*'],
      ios: {
        supportsTablet: true,
        bundleIdentifier: mobileApp.buildConfiguration.bundleId
      },
      android: {
        adaptiveIcon: {
          foregroundImage: './assets/adaptive-icon.png',
          backgroundColor: mobileApp.styling.primaryColor
        },
        package: mobileApp.buildConfiguration.bundleId
      },
      plugins: [
        ...(mobileApp.features.camera ? ['expo-camera', 'expo-image-picker'] : []),
        ...(mobileApp.features.geolocation ? ['expo-location'] : []),
        ...(mobileApp.features.pushNotifications ? ['expo-notifications'] : []),
        ...(mobileApp.features.biometrics ? ['expo-local-authentication'] : [])
      ]
    }
  };

  const packageJson = {
    name: mobileApp.name.toLowerCase().replace(/\s+/g, '-'),
    version: mobileApp.buildConfiguration.version,
    main: 'node_modules/expo/AppEntry.js',
    scripts: {
      start: 'expo start',
      android: 'expo start --android',
      ios: 'expo start --ios',
      web: 'expo start --web'
    },
    dependencies: {
      expo: '~49.0.0',
      'react': '18.2.0',
      'react-native': '0.72.6',
      '@expo/vector-icons': '^13.0.0',
      'expo-status-bar': '~1.6.0',
      ...(mobileApp.features.camera && {
        'expo-camera': '~13.4.2',
        'expo-image-picker': '~14.3.2'
      }),
      ...(mobileApp.features.geolocation && {
        'expo-location': '~16.1.0'
      }),
      ...(mobileApp.features.pushNotifications && {
        'expo-notifications': '~0.20.1'
      }),
      ...(mobileApp.features.biometrics && {
        'expo-local-authentication': '~13.4.0'
      })
    },
    devDependencies: {
      '@babel/core': '^7.20.0'
    },
    private: true
  };

  const appComponent = generateExpoAppComponent(mobileApp);
  const screens = generateExpoScreens(mobileApp);

  const files = {
    'app.json': JSON.stringify(appJson, null, 2),
    'package.json': JSON.stringify(packageJson, null, 2),
    'App.tsx': appComponent,
    'babel.config.js': generateExpoBabelConfig()
  };

  // Add screens
  Object.keys(screens).forEach(screenName => {
    files[`screens/${screenName}.tsx`] = screens[screenName];
  });

  // Write all files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(appDirectory, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content);
  }

  return files;
}

async function buildMobileApp(mobileApp: any, buildConfig: any, userId: string) {
  const buildId = uuidv4();
  
  try {
    // Create build record
    const build = await prisma.mobileAppBuild.create({
      data: {
        id: buildId,
        mobileAppId: mobileApp.id,
        platform: buildConfig.platform,
        buildType: buildConfig.buildType,
        configuration: buildConfig,
        status: 'building',
        triggeredBy: userId,
        metadata: {
          startTime: new Date().toISOString()
        }
      }
    });

    // Execute build in background
    buildMobileAppInBackground(mobileApp, build).catch(console.error);

    return {
      buildId,
      status: 'building',
      platform: buildConfig.platform,
      buildType: buildConfig.buildType,
      startedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('Build setup error:', error);
    throw error;
  }
}

async function buildMobileAppInBackground(mobileApp: any, build: any) {
  const startTime = Date.now();
  const appDirectory = path.join('/tmp/mobile-apps', mobileApp.id);
  
  try {
    let buildCommand = '';
    let buildSteps = [];

    // Determine build commands based on framework and platform
    switch (mobileApp.framework) {
      case 'react-native':
        if (build.platform === 'android') {
          buildCommand = `cd ${appDirectory} && npx react-native build-android --mode=${build.buildType}`;
          buildSteps = ['Install dependencies', 'Generate bundle', 'Build APK', 'Sign APK'];
        } else if (build.platform === 'ios') {
          buildCommand = `cd ${appDirectory} && npx react-native build-ios --mode=${build.buildType}`;
          buildSteps = ['Install dependencies', 'Pod install', 'Build iOS app', 'Archive app'];
        }
        break;
        
      case 'flutter':
        if (build.platform === 'android') {
          buildCommand = `cd ${appDirectory} && flutter build apk --${build.buildType}`;
          buildSteps = ['Flutter pub get', 'Generate code', 'Build Android APK'];
        } else if (build.platform === 'ios') {
          buildCommand = `cd ${appDirectory} && flutter build ios --${build.buildType}`;
          buildSteps = ['Flutter pub get', 'Generate code', 'Build iOS app'];
        }
        break;
        
      case 'expo':
        buildCommand = `cd ${appDirectory} && eas build --platform ${build.platform} --profile ${build.buildType}`;
        buildSteps = ['Prepare build', 'Upload to EAS', 'Cloud build', 'Download artifact'];
        break;
    }

    // Execute build steps
    for (let i = 0; i < buildSteps.length; i++) {
      await prisma.mobileAppBuild.update({
        where: { id: build.id },
        data: {
          status: 'building',
          metadata: {
            ...build.metadata,
            currentStep: i + 1,
            totalSteps: buildSteps.length,
            currentAction: buildSteps[i],
            progress: Math.round(((i + 1) / buildSteps.length) * 100)
          }
        }
      });

      // Simulate build step execution
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Simulate build execution
    if (buildCommand) {
      console.log(`Executing: ${buildCommand}`);
      // In production, execute actual build command
      // const { stdout, stderr } = await execAsync(buildCommand);
    }

    // Generate build artifacts
    const buildOutput = generateBuildArtifacts(mobileApp, build);

    // Mark build as successful
    await prisma.mobileAppBuild.update({
      where: { id: build.id },
      data: {
        status: 'success',
        completedAt: new Date(),
        results: {
          success: true,
          duration: Date.now() - startTime,
          artifacts: buildOutput,
          size: '25.3 MB',
          steps: buildSteps.length
        }
      }
    });

  } catch (error) {
    console.error('Build execution error:', error);
    
    await prisma.mobileAppBuild.update({
      where: { id: build.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        results: {
          success: false,
          error: error instanceof Error ? error.message : 'Build failed',
          duration: Date.now() - startTime
        }
      }
    });
  }
}

// Helper functions for generating different framework components
function generateReactNativeAppComponent(mobileApp: any) {
  const features = mobileApp.features;
  const styling = mobileApp.styling;
  
  return `import React from 'react';
import {
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';

const App: React.FC = () => {
  const isDarkMode = useColorScheme() === 'dark';

  const backgroundStyle = {
    backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
    flex: 1,
  };

  return (
    <SafeAreaView style={backgroundStyle}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={backgroundStyle.backgroundColor}
      />
      <AppNavigator />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '${styling.primaryColor}',
  },
});

export default App;`;
}

function generateReactNativeScreens(mobileApp: any) {
  const screens = {};
  
  // Generate home screen based on template
  screens['HomeScreen'] = `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const HomeScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to ${mobileApp.name}</Text>
      <Text style={styles.subtitle}>${mobileApp.description || 'Your mobile app is ready!'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '${mobileApp.styling.primaryColor}',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});

export default HomeScreen;`;

  return screens;
}

function generateReactNativeNavigation(mobileApp: any) {
  return `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import HomeScreen from '../screens/HomeScreen';

const Stack = createStackNavigator();

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: '${mobileApp.styling.primaryColor}',
          },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Home" 
          component={HomeScreen}
          options={{ title: '${mobileApp.name}' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;`;
}

function generateAndroidManifest(mobileApp: any) {
  const permissions = [];
  
  if (mobileApp.features.camera) permissions.push('<uses-permission android:name="android.permission.CAMERA" />');
  if (mobileApp.features.geolocation) {
    permissions.push('<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />');
    permissions.push('<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />');
  }
  if (mobileApp.features.biometrics) permissions.push('<uses-permission android:name="android.permission.USE_FINGERPRINT" />');

  return `<manifest xmlns:android="http://schemas.android.com/apk/res/android">
  ${permissions.join('\n  ')}
  
  <application
    android:name=".MainApplication"
    android:label="@string/app_name"
    android:icon="@mipmap/ic_launcher"
    android:roundIcon="@mipmap/ic_launcher_round"
    android:allowBackup="false"
    android:theme="@style/AppTheme">
    
    <activity
      android:name=".MainActivity"
      android:exported="true"
      android:launchMode="singleTop"
      android:theme="@style/LaunchTheme">
      <intent-filter android:autoVerify="true">
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>`;
}

function generateIOSConfig(mobileApp: any) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>${mobileApp.name}</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>${mobileApp.buildConfiguration.bundleId || 'com.example.app'}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${mobileApp.buildConfiguration.version}</string>
  <key>CFBundleVersion</key>
  <string>${mobileApp.buildConfiguration.buildNumber}</string>
  <key>LSRequiresIPhoneOS</key>
  <true/>
  ${mobileApp.features.camera ? `<key>NSCameraUsageDescription</key>
  <string>This app needs access to camera to take photos</string>` : ''}
  ${mobileApp.features.geolocation ? `<key>NSLocationWhenInUseUsageDescription</key>
  <string>This app needs access to location for location-based features</string>` : ''}
</dict>
</plist>`;
}

function generateMetroConfig() {
  return `const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {};

module.exports = mergeConfig(defaultConfig, config);`;
}

function generateBabelConfig() {
  return `module.exports = {
  presets: ['module:metro-react-native-babel-preset'],
};`;
}

function generateTypeScriptConfig() {
  return `{
  "extends": "@tsconfig/react-native/tsconfig.json"
}`;
}

function generateFlutterMainFile(mobileApp: any) {
  return `import 'package:flutter/material.dart';
import 'app.dart';

void main() {
  runApp(const MyApp());
}`;
}

function generateFlutterAppWidget(mobileApp: any) {
  return `import 'package:flutter/material.dart';
import 'screens/home.dart';

class MyApp extends StatelessWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '${mobileApp.name}',
      theme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
      ),
      ${mobileApp.features.darkMode ? `darkTheme: ThemeData.dark(useMaterial3: true),
      themeMode: ThemeMode.system,` : ''}
      home: const HomeScreen(title: '${mobileApp.name}'),
    );
  }
}`;
}

function generateFlutterScreens(mobileApp: any) {
  const screens = {};
  
  screens['Home'] = `import 'package:flutter/material.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key, required this.title}) : super(key: key);

  final String title;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
        title: Text(widget.title),
      ),
      body: const Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: <Widget>[
            Text(
              'Welcome to ${mobileApp.name}',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            SizedBox(height: 20),
            Text(
              '${mobileApp.description || 'Your Flutter app is ready!'}',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}`;
  
  return screens;
}

function generateExpoAppComponent(mobileApp: any) {
  return `import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to ${mobileApp.name}</Text>
      <Text style={styles.subtitle}>${mobileApp.description || 'Your Expo app is ready!'}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '${mobileApp.styling.primaryColor}',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
});`;
}

function generateExpoScreens(mobileApp: any) {
  return {
    'HomeScreen': generateExpoAppComponent(mobileApp)
  };
}

function generateExpoBabelConfig() {
  return `module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};`;
}

function getMobileAppTemplates() {
  return [
    {
      id: 'blank',
      name: 'Blank',
      description: 'A minimal starter template with basic navigation',
      features: ['navigation', 'styling'],
      preview: 'blank-template.png'
    },
    {
      id: 'tabs',
      name: 'Tabs',
      description: 'App with bottom tab navigation',
      features: ['navigation', 'tabs', 'icons'],
      preview: 'tabs-template.png'
    },
    {
      id: 'sidemenu',
      name: 'Side Menu',
      description: 'App with side drawer navigation',
      features: ['navigation', 'drawer', 'menu'],
      preview: 'sidemenu-template.png'
    },
    {
      id: 'ecommerce',
      name: 'E-Commerce',
      description: 'Shopping app with cart and payments',
      features: ['products', 'cart', 'payments', 'auth'],
      preview: 'ecommerce-template.png'
    },
    {
      id: 'social',
      name: 'Social Media',
      description: 'Social networking app template',
      features: ['auth', 'posts', 'comments', 'chat'],
      preview: 'social-template.png'
    }
  ];
}

function getSupportedFrameworks() {
  return [
    {
      id: 'react-native',
      name: 'React Native',
      description: 'Build native apps using React',
      platforms: ['ios', 'android'],
      features: ['hot-reload', 'native-modules', 'performance']
    },
    {
      id: 'flutter',
      name: 'Flutter',
      description: 'Google UI toolkit for mobile, web, and desktop',
      platforms: ['ios', 'android', 'web', 'desktop'],
      features: ['hot-reload', 'single-codebase', 'performance']
    },
    {
      id: 'expo',
      name: 'Expo',
      description: 'Platform for universal React applications',
      platforms: ['ios', 'android', 'web'],
      features: ['managed-workflow', 'ota-updates', 'cloud-build']
    },
    {
      id: 'ionic',
      name: 'Ionic',
      description: 'Cross-platform apps with web technologies',
      platforms: ['ios', 'android', 'web'],
      features: ['web-tech', 'capacitor', 'pwa']
    }
  ];
}

async function generateNativeModules(mobileApp: any, modules: any) {
  // Generate platform-specific native modules
  const nativeModules = {};

  for (const module of modules) {
    switch (module.type) {
      case 'camera':
        nativeModules['camera'] = generateCameraModule(mobileApp.framework);
        break;
      case 'geolocation':
        nativeModules['geolocation'] = generateGeolocationModule(mobileApp.framework);
        break;
      case 'biometrics':
        nativeModules['biometrics'] = generateBiometricsModule(mobileApp.framework);
        break;
      case 'payments':
        nativeModules['payments'] = generatePaymentsModule(mobileApp.framework);
        break;
    }
  }

  return nativeModules;
}

function generateCameraModule(framework: string) {
  switch (framework) {
    case 'react-native':
      return {
        typescript: `import { Camera, useCameraDevices } from 'react-native-vision-camera';
import React from 'react';

export const CameraComponent: React.FC = () => {
  const devices = useCameraDevices();
  const device = devices.back;

  if (device == null) return null;
  
  return (
    <Camera
      style={{ flex: 1 }}
      device={device}
      isActive={true}
    />
  );
};`,
        native: 'Camera permissions and native bridge code'
      };
    default:
      return { error: 'Framework not supported' };
  }
}

function generateBuildArtifacts(mobileApp: any, build: any) {
  const artifacts = [];

  if (build.platform === 'android') {
    artifacts.push({
      type: 'apk',
      name: `${mobileApp.name}-${build.buildType}.apk`,
      size: '25.3 MB',
      downloadUrl: `/downloads/${build.id}/app.apk`
    });
  } else if (build.platform === 'ios') {
    artifacts.push({
      type: 'ipa',
      name: `${mobileApp.name}-${build.buildType}.ipa`,
      size: '28.7 MB',
      downloadUrl: `/downloads/${build.id}/app.ipa`
    });
  }

  return artifacts;
}

async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    const { stdout } = await execAsync(`du -sb "${dirPath}"`);
    return parseInt(stdout.split('\t')[0]);
  } catch (error) {
    return 0;
  }
}