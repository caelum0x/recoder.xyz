# OAuth Setup for Recoder Chat

Google and GitHub OAuth have been successfully configured in the Recoder Chat application.

## ✅ What's Already Configured

### 1. NextAuth.js Setup
- ✅ NextAuth configuration in `app/(auth)/auth.ts`
- ✅ Google provider configured
- ✅ GitHub provider configured
- ✅ SessionProvider wrapped around the app in `app/layout.tsx`
- ✅ OAuth buttons added to login page with proper styling

### 2. UI Components
- ✅ OAuth sign-in buttons in login form
- ✅ Loading states for OAuth operations
- ✅ Error handling for OAuth failures
- ✅ Guest sign-in option also available

### 3. Environment Variables
- ✅ Environment variables template in `.env.local`
- ✅ NextAuth URL and secret configured

## 🔧 What You Need to Do

### 1. Set Up Google OAuth

1. **Go to Google Cloud Console:**
   - Visit https://console.cloud.google.com/
   - Create a new project or select existing one

2. **Enable Google+ API:**
   - Go to "APIs & Services" > "Library"
   - Search for "Google+ API" and enable it

3. **Create OAuth 2.0 Credentials:**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - Authorized redirect URIs: `http://localhost:3010/api/auth/callback/google`

4. **Update Environment Variables:**
   ```bash
   GOOGLE_CLIENT_ID=your-actual-google-client-id
   GOOGLE_CLIENT_SECRET=your-actual-google-client-secret
   ```

### 2. Set Up GitHub OAuth

1. **Go to GitHub Settings:**
   - Visit https://github.com/settings/applications/new
   - Or go to Settings > Developer settings > OAuth Apps

2. **Create New OAuth App:**
   - Application name: "Recoder Chat"
   - Homepage URL: `http://localhost:3010`
   - Authorization callback URL: `http://localhost:3010/api/auth/callback/github`

3. **Update Environment Variables:**
   ```bash
   GITHUB_CLIENT_ID=your-actual-github-client-id
   GITHUB_CLIENT_SECRET=your-actual-github-client-secret
   ```

### 3. Set NextAuth Secret

Generate a secure secret for NextAuth:

```bash
# Generate a random secret
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then update:
```bash
NEXTAUTH_SECRET=your-generated-secret-here
```

## 🚀 Testing OAuth

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Visit `http://localhost:3010/login`

3. Try signing in with:
   - Google account
   - GitHub account
   - Guest mode (no credentials needed)

## 🔒 Security Notes

- Never commit real OAuth credentials to version control
- Use different OAuth apps for development and production
- Set appropriate redirect URIs for each environment
- Rotate secrets regularly in production

## 📝 Additional Features

The OAuth implementation includes:

- **User Type Detection:** Distinguishes between regular and guest users
- **Session Management:** Proper session handling with NextAuth
- **Error Handling:** Graceful error handling for OAuth failures
- **Loading States:** Visual feedback during OAuth processes
- **Database Integration:** Uses Drizzle adapter for user storage

## 🛠️ Production Deployment

For production, update the following:

1. **Environment Variables:**
   ```bash
   NEXTAUTH_URL=https://your-production-domain.com
   NEXTAUTH_SECRET=your-production-secret
   ```

2. **OAuth App Settings:**
   - Update redirect URIs to production URLs
   - Create separate OAuth apps for production
   - Use production database credentials

3. **Security Headers:**
   - Ensure HTTPS is enabled
   - Set proper CORS headers
   - Configure security headers in Next.js

The OAuth setup is now complete and ready for use!