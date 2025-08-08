# Recoder Chat Mobile

The official mobile app for Recoder Chat - AI-powered development conversations on the go.

## 🚀 Features

- **Universal AI Chat**: Works with Claude, Groq, Gemini, and more
- **Cross-Platform**: iOS, Android, and Web via Expo
- **Offline Support**: Local storage with server sync
- **Unified Auth**: Seamless login across Web and Chat platforms
- **Real-time Sync**: Messages sync with desktop chat platform
- **Dark Mode**: System-aware theme switching
- **Voice & Images**: Camera and photo library integration
- **Developer-Focused**: Code syntax highlighting and formatting

## 📱 Platforms

- **iOS**: Native iOS app with full functionality
- **Android**: Native Android app with full functionality  
- **Web**: Progressive Web App (PWA)

## 🛠️ Tech Stack

- **Framework**: React Native + Expo
- **Language**: TypeScript
- **Navigation**: Expo Router (file-based)
- **Storage**: AsyncStorage + Expo SecureStore
- **UI**: Native components with custom design system
- **Backend**: Connects to Recoder Chat Platform (port 3001)

## 📋 Prerequisites

- Node.js 18+ 
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator (for iOS development)
- Android Studio (for Android development)
- Recoder Chat Platform running on `localhost:3001`

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd recoder-chat-mobile
npm install
```

### 2. Start Development Server
```bash
# Start Expo development server
npm start

# For iOS
npm run ios

# For Android  
npm run android

# For Web
npm run web
```

### 3. Configure Backend Connection

The app connects to the Recoder Chat Platform at `http://localhost:3001` by default.

For production or different environments, update the `API_BASE_URL` in:
- `contexts/AuthContext.tsx`
- `contexts/ChatContext.tsx`

## 📱 Development

### Project Structure
```
recoder-chat-mobile/
├── app/                    # Expo Router pages
│   ├── (tabs)/            # Tab navigation screens
│   ├── auth/              # Authentication screens
│   └── _layout.tsx        # Root layout
├── contexts/              # React contexts
│   ├── AuthContext.tsx    # Authentication state
│   ├── ChatContext.tsx    # Chat management
│   └── ThemeContext.tsx   # Theme management
├── components/            # Reusable components
├── assets/               # Images, fonts, icons
└── constants/            # App constants
```

### Key Features

**Authentication**
- Unified login with Recoder platforms
- Secure token storage with Expo SecureStore
- Automatic token validation and refresh

**Chat Management**
- Local chat storage with server sync
- Real-time messaging with AI
- Offline support with queue sync
- Message history and search

**Theme System**
- Light/Dark/System themes
- iOS Human Interface Guidelines colors
- Consistent design tokens

## 🔧 Configuration

### Environment Variables
Create `.env` in the project root:

```env
# Backend Configuration
EXPO_PUBLIC_API_BASE_URL=http://localhost:3001
EXPO_PUBLIC_WEB_API_URL=http://localhost:3000

# Feature Flags
EXPO_PUBLIC_ENABLE_VOICE=true
EXPO_PUBLIC_ENABLE_CAMERA=true
EXPO_PUBLIC_ENABLE_OFFLINE=true

# Analytics (Optional)
EXPO_PUBLIC_ANALYTICS_ENABLED=false
```

### Build Configuration

**EAS Build** (Recommended for production):
```bash
# Install EAS CLI
npm install -g eas-cli

# Configure project
eas build:configure

# Build for iOS
eas build --platform ios

# Build for Android
eas build --platform android
```

**Local Builds**:
```bash
# iOS (requires Xcode)
npx expo run:ios

# Android (requires Android Studio)
npx expo run:android
```

## 📊 Features Detail

### Authentication Flow
1. User enters credentials on login screen
2. App sends auth request to Recoder Chat Platform
3. Server returns unified token and user data
4. Token stored securely with Expo SecureStore
5. User data cached with AsyncStorage
6. Auto-login on app restart

### Chat Synchronization
- **Local-First**: Messages stored locally immediately
- **Background Sync**: Syncs with server when online
- **Conflict Resolution**: Last-write-wins for simplicity
- **Offline Queue**: Queues messages when offline

### AI Integration
- **Multiple Providers**: Supports all Recoder AI providers
- **Model Selection**: User can choose AI model
- **Streaming**: Real-time response streaming
- **Cost Tracking**: Usage and cost monitoring

## 🧪 Testing

```bash
# Run tests
npm test

# E2E testing with Maestro (optional)
maestro test e2e/
```

## 🚀 Deployment

### App Stores

**iOS App Store**:
1. Build with EAS: `eas build --platform ios`
2. Upload to App Store Connect
3. Submit for review

**Google Play Store**:
1. Build with EAS: `eas build --platform android`
2. Upload to Google Play Console
3. Submit for review

### Web Deployment
```bash
# Export static build
npx expo export --platform web

# Deploy to Vercel/Netlify/etc
```

## 📚 API Integration

The mobile app integrates with these Recoder APIs:

- **POST** `/api/auth/unified?action=login` - User authentication
- **POST** `/api/auth/unified?action=register` - User registration
- **GET** `/api/auth/session` - Session validation
- **GET** `/api/history` - Load chat history
- **POST** `/api/chat` - Send messages
- **DELETE** `/api/chat/:id` - Delete chats

## 🎨 Design System

The app follows iOS Human Interface Guidelines with custom Recoder branding:

**Typography**: Inter font family
**Colors**: System-aware light/dark themes
**Icons**: Expo Vector Icons (Ionicons)
**Layout**: Safe area aware layouts

## 🔒 Security

- **Secure Storage**: Auth tokens in Expo SecureStore
- **HTTPS Only**: All API calls use HTTPS in production
- **Token Rotation**: Automatic token refresh
- **Biometric Auth**: Optional Face ID/Fingerprint (coming soon)

## 📈 Analytics

Optional analytics integration:
- User engagement tracking
- Feature usage metrics  
- Performance monitoring
- Crash reporting

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push branch: `git push origin feature/amazing-feature`
5. Open Pull Request

## 📝 License

This project is part of Recoder.xyz and follows the same license terms.

## 🆘 Support

- **Documentation**: https://docs.recoder.xyz/mobile
- **Issues**: https://github.com/recoder-xyz/issues
- **Community**: https://discord.gg/recoder
- **Email**: support@recoder.xyz

---

**Happy coding with Recoder Chat Mobile! 📱🚀**