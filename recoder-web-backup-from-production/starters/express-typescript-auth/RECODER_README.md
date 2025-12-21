# Express TypeScript Authentication Service - Recoder.xyz Template

> Complete authentication service with JWT, email verification, and password management

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup database
npx prisma generate
npx prisma migrate dev

# Start development server
npm run dev
```

## ✨ What's Included

### Authentication Features
- **JWT Authentication** - Secure token-based auth
- **Refresh Token Rotation** - Enhanced security with token rotation
- **Email Verification** - Verify user emails on signup
- **Password Reset** - Secure password reset flow
- **Cookie Sessions** - HTTP-only cookie for refresh tokens

### Security
- **Bcrypt Hashing** - Secure password storage
- **XSS Protection** - Sanitize user inputs
- **Rate Limiting** - Protect auth endpoints from abuse
- **CORS Configuration** - Secure cross-origin requests
- **Helmet Security** - HTTP security headers

### Database & Email
- **Prisma ORM** - Type-safe database access
- **PostgreSQL** - Production-ready database
- **Nodemailer** - Email sending capability
- **Email Templates** - Beautiful HTML emails

## 📁 Project Structure

```
src/
├── controller/           # Request handlers
│   ├── auth.controller.ts
│   ├── forgotPassword.controller.ts
│   └── verifyEmail.controller.ts
├── middleware/          # Express middleware
│   ├── authLimiter.ts
│   ├── errorHandler.ts
│   ├── isAuth.ts
│   └── validate.ts
├── routes/             # API routes
│   └── v1/
│       ├── auth.route.ts
│       ├── password.route.ts
│       └── verifyEmail.route.ts
├── config/            # Configuration
│   ├── config.ts
│   ├── prisma.ts
│   └── nodemailer.ts
├── types/            # TypeScript types
├── utils/           # Utilities
├── app.ts          # Express app setup
└── index.ts       # Entry point
```

## 🔧 Environment Variables

Create a `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/mydb"

# JWT Secrets
JWT_SECRET="your-super-secret-jwt-key"
JWT_REFRESH_SECRET="your-super-secret-refresh-key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Email Configuration
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="your-email@gmail.com"
SMTP_PASS="your-app-password"
EMAIL_FROM="noreply@yourapp.com"

# Application
CLIENT_URL="http://localhost:3000"
NODE_ENV="development"
PORT=5000
```

## 📝 API Endpoints

### Authentication
```
POST /api/v1/auth/register      # Register new user
POST /api/v1/auth/login         # Login user
POST /api/v1/auth/refresh       # Refresh access token
POST /api/v1/auth/logout        # Logout user
GET  /api/v1/auth/me            # Get current user
```

### Email Verification
```
POST /api/v1/verify/send        # Send verification email
GET  /api/v1/verify/:token      # Verify email with token
```

### Password Reset
```
POST /api/v1/password/forgot    # Request password reset
POST /api/v1/password/reset     # Reset password with token
```

## 🔐 Authentication Flow

### Registration
1. User submits email & password
2. Password is hashed with bcrypt
3. User record created in database
4. Verification email sent
5. User verifies email via link

### Login
1. User submits credentials
2. Credentials validated
3. Access token (15 min) & refresh token (7 days) generated
4. Refresh token stored in HTTP-only cookie
5. Access token returned in response

### Token Refresh
1. Client sends expired access token + refresh token cookie
2. Server validates refresh token
3. New access token generated
4. Old refresh token rotated

## 🧪 Testing the API

Using curl:

```bash
# Register
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}'

# Login
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"SecurePass123!"}' \
  -c cookies.txt

# Get current user (authenticated)
curl http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -b cookies.txt
```

## 🗄️ Database Schema

The Prisma schema includes:
- **User** model with email, password, verification status
- **RefreshToken** model for token rotation
- **PasswordResetToken** model for password resets
- **VerificationToken** model for email verification

To modify the schema:
1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev`

## 📧 Email Configuration

### Gmail Setup
1. Enable 2-factor authentication
2. Generate an app password
3. Use app password in `SMTP_PASS`

### Custom SMTP
Update `.env` with your SMTP provider details

## 🔒 Security Best Practices

1. **Environment Variables** - Never commit `.env` file
2. **Secrets** - Use strong, random JWT secrets
3. **HTTPS** - Always use HTTPS in production
4. **Rate Limiting** - Enabled on all auth endpoints
5. **Token Expiry** - Short-lived access tokens
6. **Refresh Rotation** - Refresh tokens are rotated on use

## 🚀 Deployment

### Prerequisites
- PostgreSQL database
- SMTP email service
- Node.js environment

### Deploy to Production
1. Set `NODE_ENV=production`
2. Update `DATABASE_URL` with production database
3. Configure production SMTP settings
4. Update `CLIENT_URL` with production domain
5. Run database migrations: `npx prisma migrate deploy`
6. Start server: `npm start`

## 💡 Extending the Template

### Add Social Auth (Google, GitHub)
1. Install Passport.js
2. Add OAuth strategies
3. Create social auth routes
4. Link social accounts to users

### Add Role-Based Access
1. Add `role` field to User model
2. Create role middleware
3. Protect routes based on roles

### Add Two-Factor Authentication
1. Install `speakeasy` for TOTP
2. Add 2FA setup endpoint
3. Add 2FA verification step to login

---

**Template Source**: [Louis3797/express-ts-auth-service](https://github.com/Louis3797/express-ts-auth-service)  
**Adapted for**: Recoder.xyz  
**License**: MIT
