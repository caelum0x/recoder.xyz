import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from '@/lib/logger';

// Define the ProjectFile interface
interface ProjectFile {
  path: string;
  content: string;
}

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

export async function POST(request: NextRequest) {
  try {
    const { 
      prompt, 
      name, 
      description,
      framework = 'react',
      typescript = false,
      styling = 'css',
      features = []
    } = await request.json();

    if (!prompt) {
      return NextResponse.json({ 
        success: false,
        error: 'AI prompt is required' 
      }, { status: 400 });
    }

    // Generate project name if not provided
    const projectName = name || `AI Generated ${framework.charAt(0).toUpperCase() + framework.slice(1)} App`;
    const projectDescription = description || `Generated from: "${prompt.substring(0, 100)}..."`;

    logger.info(`AI generating project: ${projectName} with ${framework}`);

    // Create project structure based on framework and preferences
    const projectId = uuidv4();
    const projectPath = path.join(PROJECTS_DIR, projectId);

    await fs.mkdir(projectPath, { recursive: true });

    let projectFiles: ProjectFile[] = [];

    if (framework === 'react') {
      projectFiles = generateReactProject(projectName, projectDescription, prompt, typescript, styling, features);
    } else if (framework === 'next') {
      projectFiles = generateNextProject(projectName, projectDescription, prompt, typescript, styling, features);
    } else {
      projectFiles = generateVanillaProject(projectName, projectDescription, prompt, styling, features);
    }

    // Create all files in the project directory
    for (const file of projectFiles) {
      const filePath = path.join(projectPath, file.path);
      const fileDir = path.dirname(filePath);
      
      await fs.mkdir(fileDir, { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf-8');
    }

    // Create project metadata
    const metadata = {
      id: projectId,
      name: projectName,
      description: projectDescription,
      framework,
      typescript,
      styling,
      features,
      prompt: prompt.substring(0, 500),
      createdAt: new Date().toISOString(),
      aiGenerated: true
    };

    const metadataPath = path.join(projectPath, '.recoder');
    await fs.mkdir(metadataPath, { recursive: true });
    await fs.writeFile(
      path.join(metadataPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );

    logger.info(`AI-generated project created: ${projectId}`);

    return NextResponse.json({
      success: true,
      data: {
        project: metadata,
        files: projectFiles.map(f => ({ path: f.path, size: f.content.length })),
        message: `Successfully generated ${framework} project with AI assistance`
      }
    });

  } catch (error) {
    logger.error('Error in AI project generation:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to generate project with AI' 
    }, { status: 500 });
  }
}

function generateReactProject(name: string, description: string, prompt: string, typescript: boolean, styling: string, features: string[]): ProjectFile[] {
  const ext = typescript ? 'tsx' : 'jsx';
  const indexExt = typescript ? 'ts' : 'js';
  
  const packageJson = {
    name: name.toLowerCase().replace(/\s+/g, '-'),
    version: '1.0.0',
    description,
    private: true,
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      'react-scripts': '^5.0.1'
    },
    scripts: {
      start: 'react-scripts start',
      build: 'react-scripts build',
      test: 'react-scripts test',
      eject: 'react-scripts eject'
    },
    browserslist: {
      production: ['>0.2%', 'not dead', 'not op_mini all'],
      development: ['last 1 chrome version', 'last 1 firefox version', 'last 1 safari version']
    }
  };

  if (typescript) {
    packageJson.dependencies['@types/react'] = '^18.2.0';
    packageJson.dependencies['@types/react-dom'] = '^18.2.0';
    packageJson.dependencies['typescript'] = '^5.0.0';
  }

  return [
    {
      path: 'package.json',
      content: JSON.stringify(packageJson, null, 2)
    },
    {
      path: `src/App.${ext}`,
      content: generateAppComponent(name, description, prompt, typescript, styling)
    },
    {
      path: `src/index.${indexExt}`,
      content: generateIndexFile(typescript)
    },
    {
      path: 'src/App.css',
      content: generateAppCSS(styling)
    },
    {
      path: 'src/index.css',
      content: generateGlobalCSS()
    },
    {
      path: 'public/index.html',
      content: generateIndexHTML(name)
    }
  ];
}

function generateNextProject(name: string, description: string, prompt: string, typescript: boolean, styling: string, features: string[]): ProjectFile[] {
  const ext = typescript ? 'tsx' : 'jsx';
  
  const packageJson = {
    name: name.toLowerCase().replace(/\s+/g, '-'),
    version: '1.0.0',
    description,
    private: true,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      lint: 'next lint'
    },
    dependencies: {
      next: '^14.0.0',
      react: '^18.2.0',
      'react-dom': '^18.2.0'
    }
  };

  if (typescript) {
    packageJson.dependencies['@types/react'] = '^18.2.0';
    packageJson.dependencies['@types/react-dom'] = '^18.2.0';
    packageJson.dependencies['@types/node'] = '^20.0.0';
    packageJson.dependencies['typescript'] = '^5.0.0';
  }

  return [
    {
      path: 'package.json',
      content: JSON.stringify(packageJson, null, 2)
    },
    {
      path: `pages/index.${ext}`,
      content: generateNextHomePage(name, description, prompt, typescript)
    },
    {
      path: `pages/_app.${ext}`,
      content: generateNextAppFile(typescript)
    },
    {
      path: 'styles/globals.css',
      content: generateGlobalCSS()
    }
  ];
}

function generateVanillaProject(name: string, description: string, prompt: string, styling: string, features: string[]): ProjectFile[] {
  return [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: name.toLowerCase().replace(/\s+/g, '-'),
        version: '1.0.0',
        description,
        main: 'index.html',
        scripts: {
          start: 'python -m http.server 8000',
          dev: 'live-server .'
        }
      }, null, 2)
    },
    {
      path: 'index.html',
      content: generateVanillaHTML(name, description, prompt)
    },
    {
      path: 'script.js',
      content: generateVanillaJS(prompt)
    },
    {
      path: 'style.css',
      content: generateVanillaCSS()
    }
  ];
}

function generateAppComponent(name: string, description: string, prompt: string, typescript: boolean, styling: string) {
  const importType = typescript ? "import React from 'react';" : "import React from 'react';";
  const componentType = typescript ? ': React.FC' : '';
  
  return `${importType}
import './App.css';

function App()${componentType} {
  return (
    <div className="App">
      <header className="App-header">
        <h1>${name}</h1>
        <p>${description}</p>
        <div className="app-content">
          <p>This app was generated based on: <em>"${prompt}"</em></p>
          <button className="cta-button">
            Get Started
          </button>
        </div>
      </header>
    </div>
  );
}

export default App;`;
}

function generateIndexFile(typescript: boolean) {
  const importType = typescript ? "import React from 'react';" : "import React from 'react';";
  
  return `${importType}
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
}

function generateAppCSS(styling: string) {
  return `.App {
  text-align: center;
}

.App-header {
  background-color: #282c34;
  padding: 40px;
  color: white;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.app-content {
  max-width: 600px;
  margin: 20px 0;
}

.cta-button {
  background-color: #61dafb;
  border: none;
  color: #282c34;
  padding: 12px 24px;
  font-size: 16px;
  font-weight: bold;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.cta-button:hover {
  background-color: #21b7d4;
}`;
}

function generateGlobalCSS() {
  return `body {
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

* {
  box-sizing: border-box;
}`;
}

function generateIndexHTML(name: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="${name} - AI Generated App" />
    <title>${name}</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
  </body>
</html>`;
}

function generateNextHomePage(name: string, description: string, prompt: string, typescript: boolean) {
  const typeImport = typescript ? "import type { NextPage } from 'next';" : "";
  const componentType = typescript ? ": NextPage" : "";
  
  return `import React from 'react';
${typeImport}

const Home${componentType} = () => {
  return (
    <div className="container">
      <main className="main">
        <h1 className="title">${name}</h1>
        <p className="description">${description}</p>
        <div className="grid">
          <div className="card">
            <h2>AI Generated</h2>
            <p>This project was created based on: "${prompt}"</p>
          </div>
          <div className="card">
            <h2>Next.js</h2>
            <p>Built with Next.js for optimal performance and SEO.</p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Home;`;
}

function generateNextAppFile(typescript: boolean) {
  const typeImport = typescript ? "import type { AppProps } from 'next/app';" : "";
  const propsType = typescript ? "{ Component, pageProps }: AppProps" : "{ Component, pageProps }";
  
  return `import React from 'react';
${typeImport}
import '../styles/globals.css';

function MyApp(${propsType}) {
  return <Component {...pageProps} />;
}

export default MyApp;`;
}

function generateVanillaHTML(name: string, description: string, prompt: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>${name}</h1>
            <p>${description}</p>
        </header>
        <main>
            <div class="content">
                <p>This application was generated based on: <em>"${prompt}"</em></p>
                <button id="cta-button">Get Started</button>
            </div>
        </main>
    </div>
    <script src="script.js"></script>
</body>
</html>`;
}

function generateVanillaJS(prompt: string) {
  return `document.addEventListener('DOMContentLoaded', function() {
    const button = document.getElementById('cta-button');
    
    button.addEventListener('click', function() {
        alert('Welcome to your AI-generated application!\\n\\nGenerated from: "${prompt}"');
    });
    
    // Add some interactive functionality
    console.log('Application loaded successfully!');
});`;
}

function generateVanillaCSS() {
  return `* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
    line-height: 1.6;
    color: #333;
    background-color: #f4f4f4;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

header {
    text-align: center;
    margin-bottom: 40px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 60px 20px;
    border-radius: 10px;
}

header h1 {
    font-size: 3em;
    margin-bottom: 10px;
}

header p {
    font-size: 1.2em;
    opacity: 0.9;
}

.content {
    background: white;
    padding: 40px;
    border-radius: 10px;
    box-shadow: 0 5px 15px rgba(0,0,0,0.1);
    text-align: center;
}

#cta-button {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    padding: 15px 30px;
    font-size: 18px;
    border-radius: 50px;
    cursor: pointer;
    margin-top: 20px;
    transition: transform 0.3s ease;
}

#cta-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(0,0,0,0.2);
}`;
}
