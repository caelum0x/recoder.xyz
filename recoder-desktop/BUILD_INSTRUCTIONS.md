# Recoder Desktop - Build Instructions

## 🏗️ Building Desktop App Installers

### Prerequisites

1. **Node.js 18+** and **npm/yarn**
2. **Platform-specific tools**:
   - **macOS**: Xcode Command Line Tools
   - **Windows**: Visual Studio Build Tools or Visual Studio Community
   - **Linux**: Standard build tools (`build-essential` on Ubuntu)

### Installation

```bash
cd recoder-desktop
npm install
```

### Development

```bash
# Run in development mode
npm run dev

# Run production build locally
npm start
```

### Building Installers

#### macOS (DMG + ZIP)
```bash
# Build for current architecture
npm run dist-mac

# Build for both Intel and Apple Silicon
npm run build-mac

# Build specific architecture
npx electron-builder --mac --x64
npx electron-builder --mac --arm64
```

**Output**: `dist/Recoder Desktop-{version}-{arch}.dmg`

#### Windows (NSIS + Portable)
```bash
# Build for Windows
npm run dist-win

# Build specific architecture
npx electron-builder --win --x64
npx electron-builder --win --ia32
```

**Output**: 
- `dist/Recoder Desktop-Setup-{version}-{arch}.exe` (Installer)
- `dist/Recoder Desktop-Portable-{version}-{arch}.exe` (Portable)

#### Linux (AppImage + DEB + RPM)
```bash
# Build for Linux
npm run dist-linux

# Build specific format
npx electron-builder --linux appimage
npx electron-builder --linux deb
npx electron-builder --linux rpm
```

**Output**:
- `dist/Recoder Desktop-{version}-{arch}.AppImage`
- `dist/Recoder Desktop-{version}-{arch}.deb`
- `dist/Recoder Desktop-{version}-{arch}.rpm`

#### All Platforms
```bash
# Build for all platforms (requires appropriate SDKs)
npm run dist-all
```

### Code Signing & Notarization

#### macOS Code Signing
1. **Developer Certificate**: Install from Apple Developer Program
2. **Environment Variables**:
   ```bash
   export APPLE_ID="your-apple-id@example.com"
   export APPLE_ID_PASS="app-specific-password"
   export APPLE_TEAM_ID="your-team-id"
   export CSC_LINK="path/to/certificate.p12"
   export CSC_KEY_PASSWORD="certificate-password"
   ```

3. **Build with signing**:
   ```bash
   npm run release-mac
   ```

#### Windows Code Signing
1. **Certificate**: Obtain from trusted CA
2. **Environment Variables**:
   ```bash
   export CSC_LINK="path/to/certificate.p12"
   export CSC_KEY_PASSWORD="certificate-password"
   ```

3. **Build with signing**:
   ```bash
   npm run release-win
   ```

### Publishing to GitHub Releases

```bash
# Publish release to GitHub
npm run release

# Platform-specific releases
npm run release-mac
npm run release-win
npm run release-linux
```

**Requirements**:
- `GH_TOKEN` environment variable with GitHub token
- Repository configured in `package.json`

### Auto-Updates

The app includes `electron-updater` for automatic updates:

1. **Release Process**:
   - Build and publish to GitHub Releases
   - App automatically checks for updates
   - Users get notification when update available

2. **Update Files**:
   - macOS: Uses `latest-mac.yml`
   - Windows: Uses `latest.yml`
   - Linux: Uses `latest-linux.yml`

### Build Optimization

#### Size Optimization
- **Dependencies**: Only production dependencies included
- **File Filtering**: Excludes dev files, docs, tests
- **Compression**: Maximum compression enabled
- **Resource Optimization**: Optimized icons and assets

#### Performance
- **Native Dependencies**: Rebuilt for target platform
- **Code Optimization**: Minified JavaScript
- **Asset Optimization**: Compressed images and resources

### Troubleshooting

#### Common Issues

1. **Native Dependencies**:
   ```bash
   npm rebuild --runtime=electron --target=28.0.0 --disturl=https://electronjs.org/headers --build-from-source
   ```

2. **Permission Errors (macOS)**:
   ```bash
   # Fix entitlements
   codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" dist/mac/Recoder\ Desktop.app
   ```

3. **Windows Build on macOS/Linux**:
   ```bash
   # Install wine for cross-platform building
   npm install --global electron-builder
   ```

4. **Missing Icons**:
   - Ensure all icon sizes present in `assets/` folder
   - Use `.icns` for macOS, `.ico` for Windows, `.png` for Linux

#### Debug Build Process
```bash
# Enable debug logging
DEBUG=electron-builder npm run dist

# Build without publishing
npm run pack
```

### CI/CD Integration

#### GitHub Actions Example
```yaml
name: Build and Release

on:
  push:
    tags: ['v*']

jobs:
  build:
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      
      - run: npm install
      - run: npm run dist
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Platform-Specific Notes

#### macOS
- **Universal Binaries**: Supports both Intel and Apple Silicon
- **Notarization**: Required for distribution outside App Store
- **Gatekeeper**: Code signing prevents security warnings

#### Windows
- **Architectures**: x64 and ia32 supported
- **SmartScreen**: Code signing prevents warnings
- **File Associations**: Automatically registers supported file types

#### Linux
- **Package Formats**: AppImage (universal), DEB (Debian/Ubuntu), RPM (Red Hat/Fedora)
- **Dependencies**: Listed in package configuration
- **Desktop Integration**: Automatic .desktop file creation

---

**Ready to distribute Recoder Desktop across all platforms! 🚀**