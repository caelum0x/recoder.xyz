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
      typescript = true,
      styling = 'tailwind',
      features = [],
      type = 'full_application',
      include_preview = true,
      userId
    } = await request.json();

    if (!prompt) {
      return NextResponse.json({ 
        success: false,
        error: 'AI prompt is required' 
      }, { status: 400 });
    }

    // Extract user for tracking
    const authHeader = request.headers.get('authorization');
    const userIdHeader = request.headers.get('x-user-id');
    const trackingUserId = userId || userIdHeader || 'anonymous-' + Date.now();

    logger.info('AI app generation requested', {
      prompt: prompt.substring(0, 100),
      framework,
      type,
      userId: trackingUserId
    });

    // Try production engine first for advanced generation
    let generationResult;
    let projectFiles: ProjectFile[] = [];
    let projectName = name;
    let projectDescription = description;
    let usingProductionEngine = false;

    try {
      // Attempt to use production engine for real AI generation
      logger.info('Attempting production engine generation');
      
      const productionRequest = {
        prompt,
        type: 'app_generation',
        framework,
        features: {
          typescript,
          styling,
          responsive: true,
          modern: true,
          interactive: true,
          ...features.reduce((acc: Record<string, boolean>, f: string) => ({ ...acc, [f]: true }), {})
        },
        output_format: 'structured_files'
      };

      // Use OpenRouter for real AI generation with best models
      const openRouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      
      if (!openRouterKey) {
        throw new Error('OpenRouter API key not configured');
      }

      // Select best model for code generation
      const model = selectBestModelForTask('code_generation', framework);
      
      const aiPrompt = generateAppPrompt(prompt, framework, typescript, styling, features);
      
      const response = await fetch(openRouterUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openRouterKey}`,
          'HTTP-Referer': 'https://recoder.xyz',
          'X-Title': 'Recoder AI App Generator'
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert full-stack developer. Generate complete, production-ready web applications. Return your response as a JSON object with a "files" array containing file objects with "path" and "content" properties. Each file should be complete and functional.'
            },
            {
              role: 'user',
              content: aiPrompt
            }
          ],
          temperature: 0.3,
          max_tokens: 8000,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`Production engine failed: ${response.status} ${response.statusText}`);
      }

      const aiResponse = await response.json();
      
      if (aiResponse.choices && aiResponse.choices[0]?.message?.content) {
        const aiContent = JSON.parse(aiResponse.choices[0].message.content);
        generationResult = {
          success: true,
          files: aiContent.files || [],
          metadata: {
            name: extractAppNameFromPrompt(prompt),
            description: `AI-generated ${framework} application`,
            model: model,
            usage: aiResponse.usage
          }
        };
      } else {
        throw new Error('Invalid AI response format');
      }
      
      if (generationResult.success && generationResult.files && generationResult.files.length > 0) {
        usingProductionEngine = true;
        projectName = generationResult.metadata?.name || extractAppNameFromPrompt(prompt);
        projectDescription = generationResult.metadata?.description || `AI-generated ${framework} application: ${prompt.substring(0, 100)}...`;
        
        // Convert production engine files to our format
        projectFiles = generationResult.files.map((file: any) => ({
          path: file.path,
          content: file.content
        }));

        logger.info('Production engine generation successful', {
          filesCount: projectFiles.length,
          projectName
        });

        // Track AI usage with real backend API
        try {
          const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
          const usageResponse = await fetch(`${backendUrl}/api/usage-monitoring/track`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': trackingUserId
            },
            body: JSON.stringify({
              provider: getProviderFromModel(model),
              model: model,
              inputTokens: generationResult.metadata?.usage?.prompt_tokens || estimateTokens(prompt),
              outputTokens: generationResult.metadata?.usage?.completion_tokens || estimateTokens(projectFiles.map(f => f.content).join('')),
              feature: 'app_generation',
              platform: 'web',
              metadata: { framework, type, filesGenerated: projectFiles.length, aiModel: model }
            })
          });

          if (usageResponse.ok) {
            logger.info('AI usage tracked successfully', { userId: trackingUserId });
          } else {
            logger.warn('Failed to track usage', { 
              status: usageResponse.status,
              userId: trackingUserId 
            });
          }
        } catch (trackingError) {
          logger.error('Usage tracking error', { 
            error: trackingError instanceof Error ? trackingError.message : 'Unknown error',
            userId: trackingUserId 
          });
        }
      }
    } catch (error) {
      logger.warn('Production engine failed, falling back to local generation', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    // Fallback to local generation if production engine failed
    if (!usingProductionEngine) {
      logger.info('Using fallback local generation');
      
      projectName = projectName || extractAppNameFromPrompt(prompt);
      projectDescription = projectDescription || `Generated from: "${prompt.substring(0, 100)}..."`;
      
      if (framework === 'react') {
        projectFiles = generateReactProject(projectName, projectDescription, prompt, typescript, styling, features);
      } else if (framework === 'next') {
        projectFiles = generateNextProject(projectName, projectDescription, prompt, typescript, styling, features);
      } else {
        projectFiles = generateVanillaProject(projectName, projectDescription, prompt, styling, features);
      }
    }

    // Save project to backend database
    let projectId;
    let savedProject;
    
    try {
      const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
      
      // Create project in backend database
      const projectResponse = await fetch(`${backendUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': trackingUserId,
          'Authorization': `Bearer ${authHeader || 'anonymous'}`
        },
        body: JSON.stringify({
          name: projectName,
          type: 'web', // Map framework to type
          description: projectDescription,
          config: {
            framework,
            typescript,
            styling,
            features,
            prompt: prompt.substring(0, 500),
            aiGenerated: true,
            filesCount: projectFiles.length,
            usingProductionEngine,
            generatedAt: new Date().toISOString()
          }
        })
      });

      if (projectResponse.ok) {
        const projectData = await projectResponse.json();
        savedProject = projectData.data;
        projectId = savedProject.id;
        
        // Save project files to backend as well
        try {
          await fetch(`${backendUrl}/api/projects/${projectId}/files`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-user-id': trackingUserId,
              'Authorization': `Bearer ${authHeader || 'anonymous'}`
            },
            body: JSON.stringify({
              files: projectFiles.map(file => ({
                path: file.path,
                content: file.content,
                type: getFileType(file.path),
                size: file.content.length
              }))
            })
          });
        } catch (filesError) {
          logger.warn('Failed to save project files to backend', { error: filesError });
        }
        
        logger.info('Project saved to backend successfully', { 
          projectId,
          userId: trackingUserId 
        });
      } else {
        throw new Error(`Backend project save failed: ${projectResponse.status}`);
      }
    } catch (backendError) {
      logger.warn('Failed to save project to backend, falling back to local storage', {
        error: backendError instanceof Error ? backendError.message : 'Unknown error'
      });
      
      // Fallback to local file storage
      projectId = uuidv4();
      const projectPath = path.join(PROJECTS_DIR, projectId);
      await fs.mkdir(projectPath, { recursive: true });

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
      
      savedProject = metadata;
    }

    logger.info(`AI-generated project created: ${projectId}`);

    // Generate response based on request type
    const responseData: any = {
      project: savedProject,
      files: projectFiles.map(f => ({ 
        name: path.basename(f.path),
        path: f.path, 
        content: f.content,
        size: f.content.length,
        type: getFileType(f.path)
      })),
      message: `Successfully generated ${framework} project with ${usingProductionEngine ? 'AI assistance' : 'fallback generation'}`,
      usingAI: usingProductionEngine,
      savedToBackend: !!savedProject?.id // Indicate if project was saved to backend
    };

    // Add preview data if requested
    if (include_preview) {
      const previewFile = projectFiles.find(f => 
        f.path.includes('App.') || f.path.includes('index.') || f.path.includes('main.')
      );
      
      if (previewFile) {
        responseData.preview = {
          content: previewFile.content,
          type: getFileType(previewFile.path)
        };
      }
    }

    // Add explanation for chat interface
    if (type === 'full_application') {
      responseData.explanation = `I've created a complete ${framework} application based on your request. The app includes:\n\n${projectFiles.map(f => `• ${path.basename(f.path)} - ${getFileDescription(f.path)}`).join('\n')}\n\n${usingProductionEngine ? 'This was generated using advanced AI assistance for optimal code quality.' : 'This was generated using fallback generation with standard templates.'}`;
    }

    return NextResponse.json({
      success: true,
      data: responseData
    });

  } catch (error) {
    logger.error('Error in AI project generation:', error);
    return NextResponse.json({ 
      success: false,
      error: 'Failed to generate project with AI',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// Helper functions
function extractAppNameFromPrompt(prompt: string): string {
  const words = prompt.toLowerCase().split(' ');
  const appWords = words.filter(word => 
    !['build', 'create', 'make', 'a', 'an', 'the', 'with', 'using', 'app', 'application'].includes(word)
  ).slice(0, 3);
  return appWords.map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'AI Generated App';
}

function getFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.tsx': case '.ts': return 'typescript';
    case '.jsx': case '.js': return 'javascript';
    case '.css': return 'css';
    case '.html': return 'html';
    case '.json': return 'json';
    case '.md': return 'markdown';
    default: return 'text';
  }
}

function getFileDescription(filePath: string): string {
  const name = path.basename(filePath);
  if (name.includes('App.')) return 'Main application component';
  if (name.includes('index.')) return 'Entry point';
  if (name.includes('package.json')) return 'Package configuration';
  if (name.includes('.css')) return 'Stylesheet';
  if (name.includes('.html')) return 'HTML template';
  return 'Application file';
}

function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

// Model selection based on OpenRouter top models
function selectBestModelForTask(task: string, framework: string): string {
  switch (task) {
    case 'code_generation':
      // Use the best coding models from OpenRouter
      if (framework === 'react' || framework === 'next') {
        return 'qwen/qwen-2.5-coder-32b-instruct'; // Qwen3 Coder - excellent for React/JS
      } else {
        return 'anthropic/claude-3-5-sonnet-20241022'; // Claude 3.5 Sonnet for general coding
      }
    default:
      return 'anthropic/claude-3-5-sonnet-20241022'; // Default to Claude Sonnet
  }
}

function getProviderFromModel(model: string): string {
  if (model.includes('anthropic')) return 'anthropic';
  if (model.includes('google')) return 'google';
  if (model.includes('deepseek')) return 'deepseek';
  if (model.includes('qwen')) return 'qwen';
  return 'openrouter';
}

function generateAppPrompt(prompt: string, framework: string, typescript: boolean, styling: string, features: string[]): string {
  return `Generate a complete, production-ready ${framework} application based on this request: "${prompt}"

Requirements:
- Framework: ${framework}
- TypeScript: ${typescript ? 'Yes' : 'No'}
- Styling: ${styling}
- Features: ${features.join(', ')}

Generate a fully functional application with:
1. Complete file structure
2. All necessary dependencies in package.json
3. Working components with proper imports
4. Responsive design
5. Modern best practices
6. Proper error handling
7. Clean, readable code

Return the response as a JSON object with this structure:
{
  "files": [
    {
      "path": "src/App.tsx",
      "content": "// Complete file content here"
    },
    {
      "path": "package.json", 
      "content": "// Complete package.json content"
    }
    // ... more files
  ]
}

Make sure every file is complete and the application is immediately runnable.`;
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
    (packageJson.dependencies as Record<string, string>)['@types/react'] = '^18.2.0';
    (packageJson.dependencies as Record<string, string>)['@types/react-dom'] = '^18.2.0';
    (packageJson.dependencies as Record<string, string>)['typescript'] = '^5.0.0';
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
    (packageJson.dependencies as Record<string, string>)['@types/react'] = '^18.2.0';
    (packageJson.dependencies as Record<string, string>)['@types/react-dom'] = '^18.2.0';
    (packageJson.dependencies as Record<string, string>)['@types/node'] = '^20.0.0';
    (packageJson.dependencies as Record<string, string>)['typescript'] = '^5.0.0';
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
