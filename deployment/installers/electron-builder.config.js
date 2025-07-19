/**
 * Electron Builder configuration for native installers
 * Builds .dmg, .exe, .deb, .rpm, and .AppImage packages
 */

const path = require('path');
const fs = require('fs');

// Read package.json for version and metadata
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

module.exports = {
  appId: 'dev.codecraft.cli',
  productName: 'CodeCraft CLI',
  copyright: `Copyright © ${new Date().getFullYear()} CodeCraft Team`,
  
  // Build configuration
  directories: {
    output: 'build/installers',
    buildResources: 'deployment/assets'
  },
  
  // Files to include
  files: [
    'dist/**/*',
    'node_modules/**/*',
    'package.json',
    'README.md',
    'LICENSE'
  ],
  
  // Exclude unnecessary files
  extraFiles: [
    {
      from: 'build/codecraft-${os}-${arch}${ext}',
      to: 'bin/codecraft${ext}',
      filter: ['!**/*.map', '!**/test/**']
    }
  ],

  // macOS configuration
  mac: {
    category: 'public.app-category.developer-tools',
    icon: 'deployment/assets/icon.icns',
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64']
      },
      {
        target: 'tar.gz',
        arch: ['x64', 'arm64']
      }
    ],
    entitlements: 'deployment/assets/entitlements.mac.plist',
    entitlementsInherit: 'deployment/assets/entitlements.mac.plist',
    hardenedRuntime: true,
    gatekeeperAssess: false,
    minimumSystemVersion: '10.15.0',
    type: 'distribution',
    identity: process.env.MAC_SIGNING_IDENTITY || null
  },

  // macOS DMG configuration
  dmg: {
    title: '${productName} ${version}',
    icon: 'deployment/assets/icon.icns',
    iconSize: 100,
    contents: [
      {
        x: 400,
        y: 120,
        type: 'link',
        path: '/Applications'
      },
      {
        x: 200,
        y: 120,
        type: 'file'
      }
    ],
    window: {
      width: 600,
      height: 400
    },
    backgroundColor: '#ffffff',
    artifactName: 'CodeCraft-CLI-${version}-${arch}.${ext}'
  },

  // Windows configuration
  win: {
    icon: 'deployment/assets/icon.ico',
    target: [
      {
        target: 'nsis',
        arch: ['x64', 'ia32', 'arm64']
      },
      {
        target: 'portable',
        arch: ['x64', 'ia32', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'ia32', 'arm64']
      }
    ],
    publisherName: 'CodeCraft Team',
    verifyUpdateCodeSignature: false,
    certificateFile: process.env.WIN_CSC_LINK || null,
    certificatePassword: process.env.WIN_CSC_KEY_PASSWORD || null,
    timeStampServer: 'http://timestamp.digicert.com',
    rfc3161TimeStampServer: 'http://timestamp.digicert.com'
  },

  // Windows NSIS installer configuration
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    allowElevation: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'CodeCraft CLI',
    runAfterFinish: false,
    installerIcon: 'deployment/assets/icon.ico',
    uninstallerIcon: 'deployment/assets/icon.ico',
    installerHeaderIcon: 'deployment/assets/icon.ico',
    deleteAppDataOnUninstall: false,
    perMachine: true,
    artifactName: 'CodeCraft-CLI-Setup-${version}-${arch}.${ext}',
    script: 'deployment/installers/nsis-script.nsh'
  },

  // Portable Windows app configuration
  portable: {
    artifactName: 'CodeCraft-CLI-Portable-${version}-${arch}.${ext}'
  },

  // Linux configuration
  linux: {
    icon: 'deployment/assets/icon.png',
    target: [
      {
        target: 'AppImage',
        arch: ['x64', 'arm64']
      },
      {
        target: 'deb',
        arch: ['x64', 'arm64']
      },
      {
        target: 'rpm',
        arch: ['x64', 'arm64']
      },
      {
        target: 'snap',
        arch: ['x64', 'arm64']
      },
      {
        target: 'tar.gz',
        arch: ['x64', 'arm64']
      }
    ],
    category: 'Development',
    vendor: 'CodeCraft Team',
    maintainer: 'CodeCraft Team <team@codecraft.dev>',
    synopsis: packageJson.description,
    desktop: {
      Name: 'CodeCraft CLI',
      Comment: packageJson.description,
      Keywords: 'cli;development;code-generation;ai;automation;',
      StartupNotify: 'false',
      Terminal: 'true',
      Type: 'Application',
      Categories: 'Development;IDE;Programming;'
    }
  },

  // AppImage configuration
  appImage: {
    artifactName: 'CodeCraft-CLI-${version}-${arch}.${ext}',
    license: 'LICENSE'
  },

  // Debian package configuration
  deb: {
    artifactName: 'codecraft-cli_${version}_${arch}.${ext}',
    packageCategory: 'devel',
    priority: 'optional',
    depends: ['nodejs (>= 18.0.0)'],
    recommends: ['git', 'docker.io'],
    suggests: ['code'],
    fpm: [
      '--deb-user', 'root',
      '--deb-group', 'root'
    ],
    afterInstall: 'deployment/scripts/postinstall.sh',
    afterRemove: 'deployment/scripts/postremove.sh'
  },

  // RPM package configuration
  rpm: {
    artifactName: 'codecraft-cli-${version}.${arch}.${ext}',
    packageCategory: 'Development/Tools',
    license: 'MIT',
    vendor: 'CodeCraft Team',
    requires: ['nodejs >= 18.0.0'],
    recommends: ['git', 'docker'],
    fpm: [
      '--rpm-user', 'root',
      '--rpm-group', 'root'
    ],
    afterInstall: 'deployment/scripts/postinstall.sh',
    afterRemove: 'deployment/scripts/postremove.sh'
  },

  // Snap package configuration
  snap: {
    summary: packageJson.description,
    description: `CodeCraft CLI is an intelligent code generation and project management tool that helps developers create, modify, and optimize code using AI-powered assistance.`,
    grade: 'stable',
    confinement: 'classic',
    base: 'core20',
    apps: {
      codecraft: {
        command: 'bin/codecraft',
        plugs: ['home', 'network', 'network-bind', 'removable-media']
      }
    },
    plugs: {
      'dot-local-share-codecraft': {
        interface: 'personal-files',
        write: ['$HOME/.local/share/codecraft']
      },
      'dot-config-codecraft': {
        interface: 'personal-files',
        write: ['$HOME/.config/codecraft']
      }
    }
  },

  // Code signing configuration
  afterSign: 'deployment/scripts/notarize.js',
  
  // Publish configuration
  publish: [
    {
      provider: 'github',
      owner: 'recoder-team',
      repo: 'recoder',
      token: process.env.GITHUB_TOKEN,
      private: false,
      releaseType: 'release'
    }
  ],

  // Build hooks
  beforeBuild: async (context) => {
    console.log('🔧 Preparing build environment...');
    
    // Ensure binary exists
    const binaryPath = path.join(context.appDir, 'build', `codecraft-${context.platformName}-${context.arch}${context.platformName === 'win32' ? '.exe' : ''}`);
    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary not found: ${binaryPath}. Run 'npm run build:pkg' first.`);
    }
    
    console.log(`✓ Binary verified: ${binaryPath}`);
  },

  afterPack: async (context) => {
    console.log(`📦 Packaged for ${context.platformName}-${context.arch}`);
    
    // Set executable permissions on non-Windows platforms
    if (context.platformName !== 'win32') {
      const binaryPath = path.join(context.appOutDir, 'bin', 'codecraft');
      if (fs.existsSync(binaryPath)) {
        fs.chmodSync(binaryPath, '755');
        console.log(`✓ Set executable permissions: ${binaryPath}`);
      }
    }
  },

  // Compression settings
  compression: 'maximum',
  
  // Metadata
  buildVersion: process.env.BUILD_NUMBER || packageJson.version,
  
  // Environment-specific overrides
  ...(process.env.NODE_ENV === 'development' && {
    compression: 'store',
    publish: null
  })
};