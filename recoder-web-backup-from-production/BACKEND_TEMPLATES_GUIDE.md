# 🚀 Backend Templates Quick Reference Guide

> Choose the right backend template for your project in seconds

---

## 🤔 Which Template Should I Use?

### Quick Decision Tree

```
Need authentication? 
├─ Yes → Need file uploads too?
│   ├─ Yes → express-mongodb-api
│   └─ No → express-typescript-auth
└─ No → Need database?
    ├─ Yes → express-typescript or express-mongodb-api
    └─ No → Need TypeScript?
        ├─ Yes → express-typescript
        └─ No → express-simple
```

---

## 📊 Template Comparison

| Feature | express-simple | express-typescript | express-typescript-auth | express-mongodb-api |
|---------|---------------|-------------------|------------------------|---------------------|
| **Complexity** | Simple | Moderate | Advanced | Advanced |
| **Language** | JavaScript | TypeScript | TypeScript | TypeScript |
| **Database** | None | None | PostgreSQL | MongoDB |
| **Authentication** | ❌ | ❌ | ✅ | ✅ |
| **File Uploads** | ❌ | ❌ | ❌ | ✅ |
| **Email System** | ❌ | ❌ | ✅ | ✅ |
| **Validation** | ❌ | ✅ Zod | ✅ | ✅ |
| **API Docs** | ❌ | ✅ Swagger | ❌ | ❌ |
| **Testing** | ❌ | ✅ Vitest | ❌ | ❌ |
| **Caching** | ❌ | ❌ | ❌ | ✅ Redis |
| **i18n** | ❌ | ❌ | ❌ | ✅ |
| **Setup Time** | 2 min | 5 min | 15 min | 20 min |

---

## 🎯 Use Case Scenarios

### 1️⃣ Express Simple
**Best For:**
- Learning Express basics
- Quick prototypes
- Static file servers
- Single-page apps with API
- MVP testing

**Example Prompts:**
- "Create a simple Express server"
- "Build a basic API server"
- "Make a static file server"

**Setup:**
```bash
npm install
npm start
```

---

### 2️⃣ Express TypeScript
**Best For:**
- REST APIs
- Microservices
- API gateways
- Third-party integrations
- Public APIs
- Scalable services

**Example Prompts:**
- "Create a TypeScript REST API"
- "Build an API with validation and docs"
- "Make a production-ready API"
- "Create a microservice with OpenAPI"

**Key Features:**
- ✅ Type safety with TypeScript
- ✅ Request validation with Zod
- ✅ Auto-generated API documentation
- ✅ Rate limiting
- ✅ Security headers
- ✅ Structured logging
- ✅ Testing infrastructure

**Setup:**
```bash
pnpm install
pnpm start:dev
# Visit: http://localhost:3000/swagger
```

---

### 3️⃣ Express TypeScript Auth
**Best For:**
- User authentication systems
- SaaS applications
- Member portals
- Multi-user platforms
- Secure APIs
- Apps with user accounts

**Example Prompts:**
- "Create an authentication API"
- "Build a user management system"
- "Make an API with JWT auth"
- "Create a login/signup system"

**Key Features:**
- ✅ JWT authentication
- ✅ Refresh token rotation
- ✅ Email verification
- ✅ Password reset
- ✅ Secure password hashing
- ✅ Rate limiting on auth routes
- ✅ XSS protection
- ✅ Cookie sessions

**Setup:**
```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

**API Endpoints:**
- `POST /api/v1/auth/register` - Register
- `POST /api/v1/auth/login` - Login
- `POST /api/v1/auth/refresh` - Refresh token
- `GET /api/v1/auth/me` - Get user
- `POST /api/v1/verify/send` - Send verification
- `POST /api/v1/password/forgot` - Forgot password

---

### 4️⃣ Express MongoDB API
**Best For:**
- Full-stack applications
- Content management systems
- Social media platforms
- E-commerce backends
- File upload systems
- Multi-language apps
- Applications needing caching

**Example Prompts:**
- "Create a MongoDB REST API"
- "Build a backend with file uploads"
- "Make an API with caching"
- "Create a full-featured backend"

**Key Features:**
- ✅ MongoDB with Mongoose
- ✅ Complete auth system
- ✅ File upload & image processing
- ✅ Email templates
- ✅ Redis caching
- ✅ Multi-language support
- ✅ Seed data
- ✅ Docker ready

**Setup:**
```bash
npm install
npm run watch
```

**API Endpoints:**
- Authentication routes
- User management routes
- Media upload routes
- Custom routes as needed

---

## 💡 Pro Tips

### Choosing Between Auth Templates

**Use express-typescript-auth when:**
- Need PostgreSQL/SQL database
- Want Prisma ORM
- Need lightweight auth only
- Building microservices

**Use express-mongodb-api when:**
- Need MongoDB/NoSQL
- Want Mongoose ODM
- Need file uploads
- Need Redis caching
- Building monolithic apps

### Customization

All templates are starting points - customize them:
- Add/remove features as needed
- Change database providers
- Modify authentication strategy
- Add custom middleware
- Extend with new routes

### Environment Variables

Every template needs a `.env` file:
- Copy `.env.template` or `.env.example`
- Fill in your values
- Never commit `.env` to git

---

## 🔒 Security Checklist

Before deploying any template:

- [ ] Change all secrets in `.env`
- [ ] Use strong JWT secrets
- [ ] Enable HTTPS in production
- [ ] Set proper CORS origins
- [ ] Review rate limiting settings
- [ ] Update allowed file types (uploads)
- [ ] Configure email service
- [ ] Set up database backups
- [ ] Enable logging in production
- [ ] Review error messages (no leaks)

---

## 📚 Learning Resources

### For Express Beginners
1. Start with `express-simple`
2. Learn routing and middleware
3. Move to `express-typescript`
4. Add authentication with other templates

### For TypeScript Learners
- All templates except `express-simple` use TypeScript
- Check `tsconfig.json` for configuration
- Review type definitions in code
- Use VS Code for IntelliSense

### For Authentication
- Study JWT flow in auth templates
- Understand refresh token rotation
- Learn password hashing
- Review security middleware

---

## 🐛 Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Change PORT in .env or kill process
lsof -ti:3000 | xargs kill -9
```

**Database Connection Failed**
```bash
# Check DATABASE_URL in .env
# Ensure database is running
# Run migrations: npx prisma migrate dev
```

**Module Not Found**
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

**TypeScript Errors**
```bash
# Rebuild TypeScript
npm run build
```

---

## 🚀 Deployment Quick Guide

### All Templates

**Prerequisites:**
- Node.js 18+ environment
- Database (if needed)
- SMTP service (if using email)

**Environment:**
```bash
NODE_ENV=production
PORT=80
# ... other vars
```

**Build & Start:**
```bash
npm ci --production
npm run build
npm start
```

### Docker Deployment

```bash
# Build
docker build -t my-api .

# Run
docker run -p 3000:3000 --env-file .env my-api
```

### Platform-Specific

**Heroku:**
```bash
git push heroku main
heroku config:set NODE_ENV=production
```

**Railway:**
- Connect GitHub repo
- Add environment variables
- Deploy automatically

**DigitalOcean App Platform:**
- Connect repo
- Configure build/run commands
- Set environment variables

---

## 📖 Further Reading

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Prisma Docs](https://www.prisma.io/docs)
- [Mongoose Docs](https://mongoosejs.com/docs/)
- [JWT Best Practices](https://jwt.io/introduction)

---

## 🤝 Contributing

Found an issue or want to add a template?
1. Check the original template repositories
2. Submit issues/PRs there first
3. Update Recoder templates as needed

---

**Happy Coding! 🎉**

For detailed setup instructions, see each template's `RECODER_README.md` file.
