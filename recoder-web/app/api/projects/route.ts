import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/lib/logger';

// Fallback project storage directory
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

// Ensure projects directory exists (for fallback)
async function ensureProjectsDir() {
  try {
    await fs.access(PROJECTS_DIR);
  } catch {
    await fs.mkdir(PROJECTS_DIR, { recursive: true });
  }
}

/**
 * GET /api/projects - Get user projects from backend
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get('limit') || '20';
    const offset = searchParams.get('offset') || '0';
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    // Extract user for authentication
    const authHeader = request.headers.get('authorization');
    const userIdHeader = request.headers.get('x-user-id');
    
    logger.info('Loading projects from backend', {
      userId: userIdHeader,
      limit,
      offset,
      type,
      status
    });

    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      
      // Build query parameters
      const queryParams = new URLSearchParams({
        limit,
        offset
      });
      
      if (type) queryParams.append('type', type);
      if (status) queryParams.append('status', status);

      const response = await fetch(`${backendUrl}/api/projects?${queryParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader || 'Bearer anonymous',
          'x-user-id': userIdHeader || 'anonymous'
        }
      });

      if (!response.ok) {
        throw new Error(`Backend API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      logger.info('Projects retrieved from backend', {
        count: data.data?.projects?.length || 0,
        userId: userIdHeader
      });

      return NextResponse.json({
        success: true,
        data: data.data,
        message: 'Projects retrieved successfully',
        source: 'backend'
      });

    } catch (backendError) {
      logger.warn('Backend failed, falling back to local file system', {
        error: backendError instanceof Error ? backendError.message : 'Unknown error'
      });
      
      // Fallback to local file system
      await ensureProjectsDir();
      const projects = await fs.readdir(PROJECTS_DIR);
      const projectList: any[] = [];

      for (const projectName of projects) {
        const projectPath = path.join(PROJECTS_DIR, projectName);
        const stats = await fs.stat(projectPath);
        
        if (stats.isDirectory()) {
          try {
            // Read project metadata
            const metadataPath = path.join(projectPath, '.recoder', 'metadata.json');
            const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf-8'));
            
            projectList.push({
              id: projectName,
              name: metadata.name || projectName,
              description: metadata.description || '',
              framework: metadata.framework || 'react',
              createdAt: metadata.createdAt || stats.birthtime.toISOString(),
              updatedAt: stats.mtime.toISOString(),
              path: projectPath,
              type: metadata.type || 'web',
              status: 'development',
              technology: metadata.technology || ['React'],
              progress: metadata.progress || 0
            });
          } catch {
            // If no metadata exists, create basic info
            projectList.push({
              id: projectName,
              name: projectName,
              description: '',
              framework: 'react',
              createdAt: stats.birthtime.toISOString(),
              updatedAt: stats.mtime.toISOString(),
              path: projectPath,
              type: 'web',
              status: 'development',
              technology: ['React'],
              progress: 0
            });
          }
        }
      }

      return NextResponse.json({ 
        success: true,
        data: { projects: projectList },
        source: 'local'
      });
    }

  } catch (error) {
    logger.error('Error retrieving projects:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to retrieve projects',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

/**
 * POST /api/projects - Create new project in backend
 */
export async function POST(request: NextRequest) {
  try {
    const { name, description, framework = 'react', template = 'blank' } = await request.json();
    
    if (!name) {
      return NextResponse.json({ 
        success: false,
        error: 'Project name is required' 
      }, { status: 400 });
    }

    // Extract user for authentication
    const authHeader = request.headers.get('authorization');
    const userIdHeader = request.headers.get('x-user-id');

    logger.info('Creating project via backend', {
      name,
      framework,
      userId: userIdHeader
    });

    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';

      const response = await fetch(`${backendUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader || 'Bearer anonymous',
          'x-user-id': userIdHeader || 'anonymous'
        },
        body: JSON.stringify({
          name,
          type: 'web', // Map framework to type
          description,
          config: {
            framework,
            template,
            technology: framework === 'react' ? ['React', 'JavaScript'] : [framework],
            progress: 0,
            createdViaWeb: true
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Backend API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();

      logger.info('Project created in backend', {
        projectId: data.data?.id,
        name: data.data?.name,
        userId: userIdHeader
      });

      return NextResponse.json({
        success: true,
        data: data.data,
        message: 'Project created successfully',
        source: 'backend'
      });

    } catch (backendError) {
      logger.warn('Backend failed, falling back to local creation', {
        error: backendError instanceof Error ? backendError.message : 'Unknown error'
      });
      
      // Fallback to local file storage
      await ensureProjectsDir();
      
      const projectId = uuidv4();
      const projectPath = path.join(PROJECTS_DIR, projectId);
      const metadataDir = path.join(projectPath, '.recoder');
    
    // Create project directory structure
    await fs.mkdir(projectPath, { recursive: true });
    await fs.mkdir(metadataDir, { recursive: true });
    await fs.mkdir(path.join(projectPath, 'src'), { recursive: true });
    await fs.mkdir(path.join(projectPath, 'public'), { recursive: true });

    // Create project metadata
    const metadata = {
      id: projectId,
      name,
      description,
      framework,
      template,
      type: 'web',
      technology: framework === 'react' ? ['React', 'JavaScript'] : [framework],
      progress: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(metadataDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );

    // Create initial files based on template
    if (template === 'react' || framework === 'react') {
      // Create package.json
      const packageJson = {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        version: '1.0.0',
        private: true,
        dependencies: {
          'react': '^18.2.0',
          'react-dom': '^18.2.0',
          'react-scripts': '5.0.1'
        },
        scripts: {
          'start': 'react-scripts start',
          'build': 'react-scripts build',
          'test': 'react-scripts test',
          'eject': 'react-scripts eject'
        }
      };

      await fs.writeFile(
        path.join(projectPath, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );

      // Create App.jsx
      const appJsx = `import React from 'react';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Welcome to ${name}</h1>
        <p>Your new React application is ready!</p>
        <p>Start editing src/App.jsx to customize this page.</p>
      </header>
    </div>
  );
}

export default App;
`;

      await fs.writeFile(path.join(projectPath, 'src', 'App.jsx'), appJsx);

      // Create index.js
      const indexJs = `import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

      await fs.writeFile(path.join(projectPath, 'src', 'index.js'), indexJs);

      // Create App.css
      const appCss = `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 20px;
  color: white;
  min-height: 50vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.App-header h1 {
  margin: 0 0 16px 0;
  font-size: 2.5rem;
}

.App-header p {
  font-size: 1.2rem;
  margin: 8px 0;
}
`;

      await fs.writeFile(path.join(projectPath, 'src', 'App.css'), appCss);

      // Create index.css
      const indexCss = `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

code {
  font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
    monospace;
}
`;

      await fs.writeFile(path.join(projectPath, 'src', 'index.css'), indexCss);

      // Create public/index.html
      const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="${description || `${name} - Created with Recoder.xyz`}" />
    <title>${name}</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>
`;

      await fs.writeFile(path.join(projectPath, 'public', 'index.html'), indexHtml);
    }

    logger.info(`Created new project: ${name} (${projectId})`);

      return NextResponse.json({
        success: true,
        data: {
          project: {
            id: projectId,
            name,
            description,
            framework,
            createdAt: metadata.createdAt,
            path: projectPath
          }
        },
        source: 'local'
      });
    }

  } catch (error) {
    logger.error('Error creating project:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to create project' 
    }, { status: 500 });
  }
}
