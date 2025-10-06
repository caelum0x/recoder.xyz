# OAuth Setup Guide for Recoder Chat

## 🎯 Quick Setup Instructions

### 1. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the "Google+ API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Set application type to "Web application"
6. Add authorized redirect URIs:
   - `http://localhost:3010/api/auth/callback/google` (development)
   - `https://yourdomain.com/api/auth/callback/google` (production)
7. Copy the Client ID and Client Secret

### 2. GitHub OAuth Setup

1. Go to [GitHub Developer Settings](https://github.com/settings/applications/new)
2. Create a new OAuth App with:
   - Application name: "Recoder Chat"
   - Homepage URL: `http://localhost:3010` (development)
   - Authorization callback URL: `http://localhost:3010/api/auth/callback/github`
3. Copy the Client ID and generate a Client Secret

### 3. Update Environment Variables

Add to your `.env.local` file:

```env
# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here

# GitHub OAuth  
GITHUB_CLIENT_ID=your_github_client_id_here
GITHUB_CLIENT_SECRET=your_github_client_secret_here

# NextAuth Secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your_nextauth_secret_here
```

### 4. Test Authentication

1. Start the development server: `npm run dev`
2. Visit `http://localhost:3010/login`
3. Try the different authentication methods:
   - ✅ Google OAuth
   - ✅ GitHub OAuth
   - ✅ Guest authentication (works without OAuth setup)
   - ✅ Email/Password authentication

## 🔧 Current Status

- ✅ **Database**: Connected to Neon PostgreSQL
- ✅ **Tables**: All auth tables created successfully
- ✅ **UI**: Modern, professional ChatGPT-style design
- ✅ **Guest Auth**: Working (no OAuth required)
- ⚠️ **OAuth**: Requires client credentials (see setup above)

## 🎨 UI Features

- Professional gradient branding
- Smooth loading states with spinners
- Responsive design for all screen sizes
- Dark/light mode support
- Accessibility-focused design
- Clear visual hierarchy

## 🛠️ Troubleshooting

### "OAuth error: Could not verify"
- Check that redirect URIs match exactly
- Ensure environment variables are set correctly
- Verify OAuth app is active

### "Database connection failed"
- Check DATABASE_URL in .env.local
- Verify Neon database is accessible

### "CSRF token missing"
- This is normal for direct API testing
- Use the UI for proper authentication flow