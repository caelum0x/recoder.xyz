# Express MongoDB REST API - Recoder.xyz Template

> Full-featured backend with MongoDB, authentication, file uploads, and email templates

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server (with watch)
npm run watch

# Build for production
npm run build

# Start production server
npm start
```

## ✨ What's Included

### Core Features
- **MongoDB & Mongoose** - NoSQL database with ODM
- **Complete Authentication** - JWT-based auth system
- **File Uploads** - Multer for file handling
- **Image Processing** - Sharp for image optimization
- **Email Templates** - Beautiful HTML emails
- **Redis Caching** - Fast data caching
- **i18n** - Multi-language support
- **TypeScript** - Type-safe code

### Architecture
- **MVC Pattern** - Models, Views (templates), Controllers
- **Middleware Stack** - Authentication, validation, error handling
- **Service Layer** - Business logic separation
- **Repository Pattern** - Data access abstraction

### Security & Performance
- **JWT Authentication** - Secure token-based auth
- **Bcrypt Hashing** - Password encryption
- **CORS** - Cross-origin configuration
- **Rate Limiting** - API abuse protection
- **Input Validation** - Comprehensive validation
- **Winston Logger** - Production logging

## 📁 Project Structure

```
src/
├── controllers/        # Request handlers
│   ├── authController.ts
│   ├── userController.ts
│   └── mediaController.ts
├── models/            # Mongoose models
│   ├── User.ts
│   └── Media.ts
├── middlewares/       # Express middleware
│   ├── authMiddleware.ts
│   ├── corsMiddleware.ts
│   └── uploadSingleImageMiddleware.ts
├── routes/           # API routes
│   ├── authRoutes.ts
│   ├── userRoutes.ts
│   └── mediaRoutes.ts
├── services/         # Business logic
│   ├── authService.ts
│   └── userService.ts
├── guards/          # Authorization guards
├── dataSources/    # Database connections
│   ├── mongoose.ts
│   └── redis.ts
├── mailer/        # Email functionality
│   ├── mailer.ts
│   └── userMail.ts
├── infrastructure/ # Utilities
│   ├── logger.ts
│   ├── upload.ts
│   └── image.ts
├── templates/     # Email templates (EJS)
├── i18n/         # Translations
└── index.ts     # Entry point
```

## 🔧 Environment Variables

Create a `.env` file:

```env
# Server
NODE_ENV=development
PORT=3000

# Database
MONGO_URI=mongodb://localhost:27017/myapp
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRATION=7d

# Email (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
EMAIL_FROM=noreply@myapp.com

# File Upload
MAX_FILE_SIZE=5242880
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp

# Frontend
CLIENT_URL=http://localhost:3000
```

## 📝 API Endpoints

### Authentication
```
POST /api/auth/register          # Register new user
POST /api/auth/login             # Login user
POST /api/auth/refresh           # Refresh token
POST /api/auth/logout            # Logout user
POST /api/auth/forgot-password   # Request password reset
POST /api/auth/reset-password    # Reset password
POST /api/auth/verify-email      # Verify email
```

### Users
```
GET    /api/users           # Get all users (admin)
GET    /api/users/:id       # Get user by ID
PUT    /api/users/:id       # Update user
DELETE /api/users/:id       # Delete user
GET    /api/users/me        # Get current user
PUT    /api/users/me        # Update current user
```

### Media
```
POST   /api/media/upload    # Upload file
GET    /api/media/:id       # Get media by ID
DELETE /api/media/:id       # Delete media
GET    /api/media           # List all media
```

## 🔐 Authentication Flow

### User Registration
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!",
    "name": "John Doe"
  }'
```

### User Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123!"
  }'
```

Response includes:
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "email": "...", "name": "..." },
    "tokens": {
      "accessToken": "...",
      "refreshToken": "..."
    }
  }
}
```

### Authenticated Request
```bash
curl http://localhost:3000/api/users/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 📤 File Upload

Upload an image:
```bash
curl -X POST http://localhost:3000/api/media/upload \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -F "file=@/path/to/image.jpg" \
  -F "alt=Profile picture"
```

Features:
- Automatic image optimization
- Multiple size generation (thumbnail, medium, large)
- WebP conversion
- Metadata extraction
- CDN-ready URLs

## 📧 Email System

The template includes:
- **Transactional Emails** - Welcome, password reset, verification
- **EJS Templates** - Beautiful HTML emails
- **Inline CSS** - Email-client compatible
- **Text Fallback** - Plain text version
- **i18n Support** - Multi-language emails

Send custom email:
```typescript
import { sendMail } from './mailer/mailer';

await sendMail({
  to: 'user@example.com',
  subject: 'Welcome!',
  template: 'welcome',
  context: { name: 'John' }
});
```

## 🌍 Internationalization

Supported languages: English, Spanish, French, German

Add translation:
```typescript
// src/i18n/locales/en.json
{
  "auth": {
    "welcome": "Welcome",
    "login_success": "Login successful"
  }
}
```

Use in code:
```typescript
req.t('auth.welcome')
```

## 💾 Redis Caching

Cache frequently accessed data:
```typescript
import { redis } from './dataSources/redis';

// Set cache
await redis.set('user:123', JSON.stringify(user), 'EX', 3600);

// Get cache
const cached = await redis.get('user:123');
```

Cache invalidation strategies included.

## 🗄️ Database Models

### User Model
```typescript
{
  email: string;
  password: string;
  name: string;
  avatar?: string;
  role: 'user' | 'admin';
  isEmailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### Media Model
```typescript
{
  user: ObjectId;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  url: string;
  thumbnails: {
    small: string;
    medium: string;
    large: string;
  };
  alt?: string;
  createdAt: Date;
}
```

## 🧪 Seeding Database

```bash
npm run seed
```

Creates:
- Admin user
- Sample users
- Sample media files
- Test data

## 🐳 Docker Support

```bash
# Build image
docker build -t my-api .

# Run with docker-compose
docker-compose up

# Scale services
docker-compose up --scale api=3
```

Includes:
- Multi-stage builds
- MongoDB service
- Redis service
- Nginx reverse proxy

## 🔒 Security Features

1. **Helmet** - Security headers
2. **CORS** - Configurable origins
3. **Rate Limiting** - Per-endpoint limits
4. **Input Sanitization** - XSS protection
5. **Password Hashing** - Bcrypt with salt
6. **JWT Rotation** - Token refresh mechanism
7. **HTTPS Enforcement** - Production only
8. **File Type Validation** - Whitelist approach

## 🚀 Deployment

### Prerequisites
- MongoDB database (Atlas, self-hosted)
- Redis instance (Redis Cloud, self-hosted)
- SMTP email service
- Node.js environment (18+)

### Environment Setup
1. Set production environment variables
2. Update CORS origins
3. Configure MongoDB connection string
4. Setup Redis connection
5. Configure email service

### Deploy Steps
```bash
# Install production dependencies
npm ci --production

# Build TypeScript
npm run build

# Start production server
NODE_ENV=production npm start
```

## 💡 Extending the Template

### Add WebSocket Support
```bash
npm install socket.io
```

### Add Payment Processing
```bash
npm install stripe
```

### Add Real-time Notifications
Integrate with Firebase Cloud Messaging or Pusher

### Add Search Functionality
Integrate MongoDB Atlas Search or Elasticsearch

---

**Template Source**: [watscho/express-mongodb-rest-api-boilerplate](https://github.com/watscho/express-mongodb-rest-api-boilerplate)  
**Adapted for**: Recoder.xyz  
**License**: MIT
