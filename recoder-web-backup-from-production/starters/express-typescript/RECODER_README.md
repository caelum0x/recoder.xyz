# Express TypeScript API - Recoder.xyz Template

> Production-ready REST API starter with TypeScript, validation, and OpenAPI documentation

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Start development server
pnpm start:dev

# Build for production
pnpm build

# Run in production
pnpm start:prod

# Run tests
pnpm test
```

## ✨ What's Included

This template provides a solid foundation for building REST APIs with:

### Core Features
- **TypeScript** - Type-safe code with strict mode enabled
- **Express 5.x** - Latest Express.js framework
- **Zod Validation** - Runtime type checking for requests
- **OpenAPI/Swagger** - Auto-generated API documentation at `/swagger`
- **Structured Logging** - Pino logger for production-grade logging
- **Testing** - Vitest + Supertest for comprehensive testing

### Architecture
- **Clean Code** - Controller → Service → Repository pattern
- **Path Aliases** - Clean imports using `@/` prefix
- **Modular Design** - Feature-based folder structure
- **Error Handling** - Centralized error handling middleware

### Security & Performance
- **Helmet** - Security headers
- **CORS** - Configurable cross-origin requests
- **Rate Limiting** - Protect against abuse
- **Input Validation** - Zod schemas for all requests

### Development
- **Fast Reload** - Hot module reloading with tsx
- **Code Quality** - Biome for linting and formatting
- **Docker Ready** - Dockerfile included
- **TypeScript Watch** - Real-time error checking

## 📁 Project Structure

```
src/
├── api/                    # API routes organized by feature
│   ├── healthCheck/       # Health check endpoint
│   └── user/              # Example user feature
│       ├── userController.ts
│       ├── userService.ts
│       ├── userRepository.ts
│       ├── userModel.ts
│       ├── userRouter.ts
│       └── __tests__/
├── common/                # Shared utilities
│   ├── middleware/       # Express middleware
│   ├── models/          # Shared models
│   └── utils/           # Utility functions
├── api-docs/            # OpenAPI documentation
├── index.ts            # Application entry point
└── server.ts          # Express server setup
```

## 🔧 Environment Variables

Create a `.env` file:

```env
NODE_ENV=development
PORT=3000
HOST=localhost
CORS_ORIGIN=http://localhost:5173
```

## 📝 Adding a New Feature

Example: Adding a "Posts" feature

1. Create feature folder:
```bash
mkdir -p src/api/post
```

2. Create files:
- `postModel.ts` - Data models/types
- `postRepository.ts` - Data access layer
- `postService.ts` - Business logic
- `postController.ts` - Request handlers
- `postRouter.ts` - Route definitions

3. Add validation schemas using Zod

4. Register router in `server.ts`

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:cov

# Watch mode (during development)
pnpm test --watch
```

## 🐳 Docker

Build and run:
```bash
docker build -t my-api .
docker run -p 3000:3000 my-api
```

## 💡 Best Practices

1. **Validation** - Always validate input with Zod schemas
2. **Error Handling** - Use ServiceResponse for consistent API responses
3. **Logging** - Use the provided logger, don't use console.log
4. **Testing** - Write tests for all endpoints
5. **Type Safety** - Leverage TypeScript, avoid `any` types

## 🔗 API Documentation

Once running, visit:
- Swagger UI: `http://localhost:3000/swagger`
- Health Check: `http://localhost:3000/api/health`

## 📚 Learn More

- [Express.js Documentation](https://expressjs.com/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Zod Documentation](https://zod.dev/)
- [Vitest Documentation](https://vitest.dev/)

---

**Template Source**: [edwinhern/express-typescript](https://github.com/edwinhern/express-typescript)  
**Adapted for**: Recoder.xyz  
**License**: MIT
