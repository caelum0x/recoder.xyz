/**
 * Starter File Loader
 * Loads actual files from pre-bundled JSON file
 * Works in Cloudflare Workers by importing the JSON directly
 */

import { log, logVerbose } from './starter-config';
// Import the bundle directly as a module - works in both Node.js and Cloudflare Workers
import startersBundleData from './starters-bundle.json';

export interface LoadedStarterFiles {
  starterId: string;
  files: Record<string, string>; // filepath -> content
  packageJson: any;
  fileCount: number;
}

// Cache the bundle in memory
let startersBundle: any = null;

function loadBundle() {
  if (startersBundle) {
    return startersBundle;
  }

  try {
    // Use the imported JSON data directly
    startersBundle = startersBundleData;
    return startersBundle;
  } catch (error) {
    console.error('Failed to load starters bundle:', error);
    return {};
  }
}

/**
 * Load all files from a starter template (from pre-bundled data or virtual generation)
 * Returns actual file contents ready to inject into artifact
 */
export async function loadStarterFiles(starterId: string): Promise<LoadedStarterFiles> {
  log(`📦 Loading starter files from bundle: ${starterId}`);

  // Check if this is a virtual starter that needs to be generated
  if (starterId === 'express-auth-libsql') {
    log(`✨ Generating virtual WebContainer-compatible starter: ${starterId}`);
    return generateExpressAuthLibSQL();
  }

  const bundle = loadBundle();
  const starter = bundle[starterId];

  if (!starter) {
    const available = Object.keys(bundle).slice(0, 10).join(', ');
    throw new Error(`Starter "${starterId}" not found in bundle. Available: ${available}...`);
  }

  const { files, packageJson, metadata } = starter;

  logVerbose(`   Found ${metadata.fileCount} files`);
  Object.keys(files).slice(0, 5).forEach((f: string) => {
    logVerbose(`   - ${f}`);
  });

  log(`✅ Loaded ${metadata.fileCount} files from ${starterId}`);

  return {
    starterId,
    files,
    packageJson,
    fileCount: metadata.fileCount,
  };
}

/**
 * Generate artifact with pre-loaded starter files
 * This creates a complete recoderArtifact with all starter files already included
 */
export function generateStarterArtifact(
  loadedStarter: LoadedStarterFiles,
  artifactId: string,
  title: string
): string {
  const { files, packageJson } = loadedStarter;

  let artifact = `<recoderArtifact id="${artifactId}" title="${title}">\n`;

  // Add package.json first if it exists
  if (packageJson && files['package.json']) {
    artifact += `  <recoderAction type="file" filePath="package.json">\n`;
    artifact += files['package.json'];
    artifact += `\n  </recoderAction>\n\n`;
  }

  // Add all other files
  const sortedFiles = Object.keys(files)
    .filter((path) => path !== 'package.json') // Skip package.json, we already added it
    .sort((a, b) => {
      // Prioritize config files and source files
      const aIsConfig = /\.(json|config|rc)$/.test(a);
      const bIsConfig = /\.(json|config|rc)$/.test(b);
      if (aIsConfig && !bIsConfig) return -1;
      if (!aIsConfig && bIsConfig) return 1;

      // Then by directory depth (shallow first)
      const aDepth = a.split('/').length;
      const bDepth = b.split('/').length;
      if (aDepth !== bDepth) return aDepth - bDepth;

      // Finally alphabetically
      return a.localeCompare(b);
    });

  for (const filePath of sortedFiles) {
    const content = files[filePath];
    artifact += `  <recoderAction type="file" filePath="${filePath}">\n`;
    artifact += content;
    artifact += `\n  </recoderAction>\n\n`;
  }

  // Add install command
  if (packageJson) {
    artifact += `  <recoderAction type="shell">\n`;
    artifact += `npm install\n`;
    artifact += `  </recoderAction>\n\n`;

    // Add README with dev server instructions instead of running it
    const devCommand = packageJson.scripts?.dev || packageJson.scripts?.start || 'npm run dev';
    artifact += `  <recoderAction type="file" filePath="README.md">\n`;
    artifact += `# Getting Started\n\n`;
    artifact += `Dependencies are installed. To start the development server:\n\n`;
    artifact += `\`\`\`bash\n`;
    artifact += `${devCommand}\n`;
    artifact += `\`\`\`\n\n`;
    artifact += `The server will start and provide a URL to access your application.\n`;
    artifact += `  </recoderAction>\n`;
  }

  artifact += `</recoderArtifact>`;

  return artifact;
}

/**
 * Generate customization instructions for AI
 * This tells the AI what to modify in the pre-loaded starter
 */
export function generateCustomizationInstructions(
  loadedStarter: LoadedStarterFiles,
  userRequest: string
): string {
  const { starterId, fileCount, packageJson } = loadedStarter;

  return `
🎯 STARTER TEMPLATE LOADED: ${starterId}

I've already loaded ${fileCount} files from the ${starterId} starter template into the project.
All the base code is already there - you don't need to recreate it!

WHAT'S ALREADY INCLUDED:
${packageJson ? `- Framework: ${packageJson.dependencies ? Object.keys(packageJson.dependencies).slice(0, 5).join(', ') : 'N/A'}` : ''}
- ${fileCount} pre-coded files
- Complete project structure
- All dependencies configured

USER'S REQUEST: ${userRequest}

YOUR TASK:
1. ✅ The starter files are ALREADY in the project
2. ✅ Identify which files need customization for the user's request
3. ✅ ONLY modify/add files that need changes
4. ❌ DO NOT recreate existing files unless they need modification
5. ❌ DO NOT generate boilerplate - it's already there

EXAMPLE:
- If user wants "add a contact page" → Only create the contact page component
- If user wants "change theme to dark mode" → Only modify theme/style files
- If user wants "add authentication" → Only add auth-related files

Focus on the DELTA (changes needed), not the FULL project!
`.trim();
}

/**
 * Generate Express Auth API with libSQL (WebContainer-compatible)
 * This is a virtual starter that's generated on-the-fly
 */
function generateExpressAuthLibSQL(): LoadedStarterFiles {
  const files: Record<string, string> = {};

  // package.json
  const packageJson = {
    name: 'express-auth-api',
    version: '1.0.0',
    description: 'Express TypeScript API with JWT authentication and libSQL database',
    main: 'dist/index.js',
    scripts: {
      dev: 'tsx watch src/index.ts',
      build: 'tsc',
      start: 'node dist/index.js',
      'db:migrate': 'tsx src/db/migrate.ts',
    },
    dependencies: {
      express: '^4.18.2',
      '@libsql/client': '^0.5.2',
      jsonwebtoken: '^9.0.2',
      bcryptjs: '^2.4.3',
      cors: '^2.8.5',
      dotenv: '^16.4.5',
      helmet: '^7.1.0',
    },
    devDependencies: {
      '@types/express': '^4.17.21',
      '@types/node': '^20.11.19',
      '@types/jsonwebtoken': '^9.0.5',
      '@types/bcryptjs': '^2.4.6',
      '@types/cors': '^2.8.17',
      typescript: '^5.3.3',
      tsx: '^4.7.1',
    },
  };
  files['package.json'] = JSON.stringify(packageJson, null, 2);

  // tsconfig.json
  files['tsconfig.json'] = JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        lib: ['ES2022'],
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        resolveJsonModule: true,
        moduleResolution: 'node',
      },
      include: ['src/**/*'],
      exclude: ['node_modules', 'dist'],
    },
    null,
    2
  );

  // .env.example
  files['.env.example'] = `# Server Configuration
PORT=3000
NODE_ENV=development

# Database
DATABASE_URL=file:local.db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=30d`;

  // .gitignore
  files['.gitignore'] = `node_modules/
dist/
.env
*.db
*.db-shm
*.db-wal
.DS_Store`;

  // src/types/user.ts
  files['src/types/user.ts'] = `export interface User {
  id: number;
  email: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserCreateInput {
  email: string;
  username: string;
  password: string;
}

export interface UserPublic {
  id: number;
  email: string;
  username: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: UserPublic;
}`;

  // src/db/client.ts
  files['src/db/client.ts'] = `import { createClient } from '@libsql/client';
import * as dotenv from 'dotenv';

dotenv.config();

export const db = createClient({
  url: process.env.DATABASE_URL || 'file:local.db',
});

export async function initializeDatabase() {
  console.log('🔄 Initializing database...');

  await db.execute(\`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  \`);

  await db.execute(\`
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)
  \`);

  await db.execute(\`
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)
  \`);

  console.log('✅ Database initialized successfully');
}`;

  // src/db/migrate.ts
  files['src/db/migrate.ts'] = `import { initializeDatabase } from './client';

async function migrate() {
  try {
    await initializeDatabase();
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

migrate();`;

  // src/db/users.ts
  files['src/db/users.ts'] = `import { db } from './client';
import type { User, UserCreateInput, UserPublic } from '../types/user';
import bcrypt from 'bcryptjs';

export async function createUser(input: UserCreateInput): Promise<UserPublic> {
  const passwordHash = await bcrypt.hash(input.password, 10);

  const result = await db.execute({
    sql: \`
      INSERT INTO users (email, username, password_hash)
      VALUES (?, ?, ?)
      RETURNING id, email, username, created_at
    \`,
    args: [input.email, input.username, passwordHash],
  });

  const row = result.rows[0];
  return {
    id: row.id as number,
    email: row.email as string,
    username: row.username as string,
    createdAt: row.created_at as string,
  };
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE email = ?',
    args: [email],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id as number,
    email: row.email as string,
    username: row.username as string,
    passwordHash: row.password_hash as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function findUserById(id: number): Promise<User | null> {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id as number,
    email: row.email as string,
    username: row.username as string,
    passwordHash: row.password_hash as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function verifyPassword(
  password: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}`;

  // src/middleware/auth.ts
  files['src/middleware/auth.ts'] = `import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { findUserById } from '../db/users';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    username: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

export async function authenticateToken(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    const user = await findUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
    };

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function generateAccessToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export function generateRefreshToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  });
}`;

  // src/routes/auth.ts
  files['src/routes/auth.ts'] = `import { Router } from 'express';
import { createUser, findUserByEmail, verifyPassword } from '../db/users';
import {
  generateAccessToken,
  generateRefreshToken,
  authenticateToken,
  AuthRequest,
} from '../middleware/auth';
import type { UserCreateInput } from '../types/user';

const router = Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const input: UserCreateInput = { email, username, password };
    const user = await createUser(input);

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.status(201).json({
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);

    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user (protected route example)
router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

export default router;`;

  // src/index.ts
  files['src/index.ts'] = `import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import * as dotenv from 'dotenv';
import { initializeDatabase } from './db/client';
import authRouter from './routes/auth';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Express Auth API with libSQL',
    version: '1.0.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me (requires Bearer token)',
      },
    },
  });
});

app.use('/api/auth', authRouter);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function start() {
  try {
    await initializeDatabase();

    app.listen(PORT, () => {
      console.log(\`✅ Server running on http://localhost:\${PORT}\`);
      console.log(\`📚 API Documentation: http://localhost:\${PORT}\`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();`;

  // README.md
  files['README.md'] = `# Express Auth API with libSQL

A complete Express TypeScript authentication API using JWT tokens and libSQL database.

**WebContainer Compatible** - Uses pure JavaScript dependencies that work in browser environments.

## Features

- ✅ User registration and login
- ✅ JWT-based authentication (access + refresh tokens)
- ✅ Password hashing with bcrypt
- ✅ libSQL database (@libsql/client - WebContainer compatible)
- ✅ TypeScript for type safety
- ✅ Security best practices (Helmet, CORS)

## Quick Start

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Set up environment variables:**
   \`\`\`bash
   cp .env.example .env
   # Edit .env and set your JWT_SECRET
   \`\`\`

3. **Initialize database:**
   \`\`\`bash
   npm run db:migrate
   \`\`\`

4. **Start development server:**
   \`\`\`bash
   npm run dev
   \`\`\`

Server runs at \`http://localhost:3000\`

## API Endpoints

### Authentication

**Register**
\`\`\`bash
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securepassword123"
}
\`\`\`

**Login**
\`\`\`bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepassword123"
}
\`\`\`

**Get Current User (Protected)**
\`\`\`bash
GET /api/auth/me
Authorization: Bearer <your-access-token>
\`\`\`

## Project Structure

\`\`\`
├── src/
│   ├── db/
│   │   ├── client.ts      # Database client and initialization
│   │   ├── migrate.ts     # Database migration script
│   │   └── users.ts       # User database operations
│   ├── middleware/
│   │   └── auth.ts        # JWT authentication middleware
│   ├── routes/
│   │   └── auth.ts        # Authentication routes
│   ├── types/
│   │   └── user.ts        # TypeScript types
│   └── index.ts           # Express app entry point
├── .env.example           # Environment variables template
├── package.json
└── tsconfig.json
\`\`\`

## Why libSQL?

This API uses **@libsql/client** instead of Prisma because:

- ✅ Works in WebContainer (browser-based development)
- ✅ No native binaries required
- ✅ Pure JavaScript/TypeScript
- ✅ Compatible with edge runtimes

If you need Prisma-like features, consider:
- **Drizzle ORM** - TypeScript-first ORM with libSQL support
- **Kysely** - Type-safe SQL query builder

## Security Notes

- Change \`JWT_SECRET\` in production
- Use HTTPS in production
- Consider adding rate limiting
- Implement refresh token rotation
- Add email verification for registration

## License

MIT`;

  log(`✅ Generated express-auth-libsql virtual starter with ${Object.keys(files).length} files`);

  return {
    starterId: 'express-auth-libsql',
    files,
    packageJson,
    fileCount: Object.keys(files).length,
  };
}
