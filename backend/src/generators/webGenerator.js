const { BaseGenerator } = require('./baseGenerator');
const { logger } = require('../utils/logger');
const path = require('path');

class WebGenerator extends BaseGenerator {
  constructor(options = {}) {
    super(options);
    this.registerWebTemplates();
  }

  registerWebTemplates() {
    // React templates
    this.registerTemplate('reactComponent', (data) => this.generateReactComponent(data));
    this.registerTemplate('reactHook', (data) => this.generateReactHook(data));
    this.registerTemplate('reactContext', (data) => this.generateReactContext(data));
    this.registerTemplate('reactApp', (data) => this.generateReactApp(data));

    // Vue templates
    this.registerTemplate('vueComponent', (data) => this.generateVueComponent(data));
    this.registerTemplate('vueStore', (data) => this.generateVueStore(data));
    this.registerTemplate('vueApp', (data) => this.generateVueApp(data));

    // Angular templates
    this.registerTemplate('angularComponent', (data) => this.generateAngularComponent(data));
    this.registerTemplate('angularService', (data) => this.generateAngularService(data));
    this.registerTemplate('angularModule', (data) => this.generateAngularModule(data));

    // Common web templates
    this.registerTemplate('htmlTemplate', (data) => this.generateHTMLTemplate(data));
    this.registerTemplate('cssStyles', (data) => this.generateCSSStyles(data));
    this.registerTemplate('jsModule', (data) => this.generateJSModule(data));
    this.registerTemplate('tsModule', (data) => this.generateTSModule(data));

    // Build configuration templates
    this.registerTemplate('webpack', (data) => this.generateWebpackConfig(data));
    this.registerTemplate('vite', (data) => this.generateViteConfig(data));
    this.registerTemplate('babel', (data) => this.generateBabelConfig(data));
    this.registerTemplate('eslint', (data) => this.generateESLintConfig(data));

    // Testing templates
    this.registerTemplate('jestConfig', (data) => this.generateJestConfig(data));
    this.registerTemplate('testComponent', (data) => this.generateComponentTest(data));
    this.registerTemplate('e2eTest', (data) => this.generateE2ETest(data));
  }

  async generate(input, context = {}) {
    try {
      this.validateInput(input, ['framework', 'projectName']);

      const result = await this.performAsyncGeneration(input, async () => {
        const config = this.mergeConfigurations(
          this.getDefaultWebConfig(),
          input,
          context
        );

        const structure = await this.generateWebStructure(config);
        return await this.generateFromStructure(structure);
      });

      return this.createGenerationResult(true, {
        framework: input.framework,
        features: input.features || [],
        buildTool: input.buildTool || 'vite'
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  getDefaultWebConfig() {
    return {
      framework: 'react',
      typescript: true,
      buildTool: 'vite',
      styling: 'css',
      stateManagement: 'context',
      routing: true,
      testing: true,
      linting: true,
      features: ['responsive', 'pwa', 'seo'],
      components: ['Header', 'Footer', 'Navigation', 'Layout']
    };
  }

  async generateWebStructure(config) {
    const structure = {};

    // Base files
    structure['package.json'] = this.generatePackageJson(config);
    structure['index.html'] = { template: 'htmlTemplate', data: config };

    // Framework-specific structure
    if (config.framework === 'react') {
      structure.src = this.generateReactStructure(config);
    } else if (config.framework === 'vue') {
      structure.src = this.generateVueStructure(config);
    } else if (config.framework === 'angular') {
      structure.src = this.generateAngularStructure(config);
    }

    // Build configuration
    if (config.buildTool === 'webpack') {
      structure['webpack.config.js'] = { template: 'webpack', data: config };
    } else if (config.buildTool === 'vite') {
      structure['vite.config.js'] = { template: 'vite', data: config };
    }

    // Common configuration files
    if (config.typescript) {
      structure['tsconfig.json'] = this.generateTSConfig(config);
    }

    if (config.linting) {
      structure['.eslintrc.js'] = { template: 'eslint', data: config };
      structure['.prettierrc'] = this.generatePrettierConfig(config);
    }

    structure['.babelrc'] = { template: 'babel', data: config };

    // Testing configuration
    if (config.testing) {
      structure['jest.config.js'] = { template: 'jestConfig', data: config };
      structure['__tests__'] = this.generateTestStructure(config);
    }

    // Styling
    structure['src']['styles'] = this.generateStyleStructure(config);

    // PWA files
    if (config.features.includes('pwa')) {
      structure.public = {
        'manifest.json': this.generatePWAManifest(config),
        'sw.js': this.generateServiceWorker(config)
      };
    }

    return structure;
  }

  generateReactStructure(config) {
    const structure = {
      'App.jsx': { template: 'reactApp', data: config },
      'main.jsx': this.generateReactMain(config),
      components: {},
      hooks: {},
      context: {},
      utils: {},
      pages: {}
    };

    // Generate components
    config.components.forEach(componentName => {
      const componentData = { ...config, componentName };
      structure.components[`${componentName}.jsx`] = {
        template: 'reactComponent',
        data: componentData
      };
    });

    // Generate hooks
    const hooks = ['useAuth', 'useApi', 'useLocalStorage'];
    hooks.forEach(hookName => {
      structure.hooks[`${hookName}.js`] = {
        template: 'reactHook',
        data: { ...config, hookName }
      };
    });

    // Generate context
    if (config.stateManagement === 'context') {
      structure.context['AuthContext.jsx'] = {
        template: 'reactContext',
        data: { ...config, contextName: 'Auth' }
      };
    }

    // Generate pages
    const pages = ['Home', 'About', 'Contact'];
    pages.forEach(pageName => {
      structure.pages[`${pageName}.jsx`] = {
        template: 'reactComponent',
        data: { ...config, componentName: pageName, isPage: true }
      };
    });

    return structure;
  }

  generateVueStructure(config) {
    const structure = {
      'App.vue': { template: 'vueApp', data: config },
      'main.js': this.generateVueMain(config),
      components: {},
      composables: {},
      stores: {},
      utils: {},
      views: {}
    };

    // Generate components
    config.components.forEach(componentName => {
      structure.components[`${componentName}.vue`] = {
        template: 'vueComponent',
        data: { ...config, componentName }
      };
    });

    // Generate stores (Pinia)
    if (config.stateManagement === 'pinia') {
      structure.stores['auth.js'] = {
        template: 'vueStore',
        data: { ...config, storeName: 'auth' }
      };
    }

    return structure;
  }

  generateAngularStructure(config) {
    const structure = {
      'app.component.ts': { template: 'angularComponent', data: config },
      'app.module.ts': { template: 'angularModule', data: config },
      'main.ts': this.generateAngularMain(config),
      components: {},
      services: {},
      modules: {}
    };

    // Generate components
    config.components.forEach(componentName => {
      const kebabName = this.toKebabCase(componentName);
      structure.components[kebabName] = {
        [`${kebabName}.component.ts`]: {
          template: 'angularComponent',
          data: { ...config, componentName }
        },
        [`${kebabName}.component.html`]: this.generateAngularTemplate(componentName),
        [`${kebabName}.component.css`]: this.generateAngularStyles(componentName)
      };
    });

    return structure;
  }

  generateReactComponent(data) {
    const { componentName, typescript = false, isPage = false } = data;
    const ext = typescript ? 'tsx' : 'jsx';
    
    return `import React${data.stateManagement === 'hooks' ? ', { useState, useEffect }' : ''} from 'react';
${data.styling === 'styled-components' ? `import styled from 'styled-components';` : ''}
import './${componentName}.${data.styling === 'css' ? 'css' : 'scss'}';

${data.styling === 'styled-components' ? `const Container = styled.div\`
  padding: 1rem;
  max-width: 1200px;
  margin: 0 auto;
\`;` : ''}

${typescript ? `interface ${componentName}Props {
  // Define your props here
}` : ''}

const ${componentName}${typescript ? `: React.FC<${componentName}Props>` : ''} = (${typescript ? 'props' : '{ ...props }'}) => {
  ${data.stateManagement === 'hooks' ? `const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  useEffect(() => {
    // Component initialization logic
  }, []);` : ''}

  ${isPage ? `
  useEffect(() => {
    document.title = '${componentName} - ${data.projectName}';
  }, []);` : ''}

  return (
    ${data.styling === 'styled-components' ? '<Container>' : `<div className="${this.toKebabCase(componentName)}">`}
      <h${isPage ? '1' : '2'}>${componentName}</h${isPage ? '1' : '2'}>
      {${isPage ? `
      <p>Welcome to the ${componentName} page!</p>` : `
      <p>${componentName} component content goes here.</p>`}}
      ${data.stateManagement === 'hooks' ? `
      {loading && <div className="loading">Loading...</div>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}` : ''}
    ${data.styling === 'styled-components' ? '</Container>' : '</div>'}
  );
};

export default ${componentName};`;
  }

  generateReactHook(data) {
    const { hookName, typescript = false } = data;
    
    return `import { useState, useEffect, useCallback } from 'react';

${typescript ? `interface ${hookName.replace('use', '')}State {
  // Define your state type here
}` : ''}

export const ${hookName} = () => {
  const [state, setState] = useState${typescript ? `<${hookName.replace('use', '')}State | null>`  : ''}(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState${typescript ? '<string | null>' : ''}(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Implement your ${hookName.replace('use', '').toLowerCase()} logic here
      const result = await fetch('/api/${hookName.replace('use', '').toLowerCase()}');
      const data = await result.json();
      setState(data);
    } catch (err) {
      setError(err${typescript ? ' as Error' : ''}.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return {
    state,
    loading,
    error,
    refetch
  };
};`;
  }

  generateReactContext(data) {
    const { contextName, typescript = false } = data;
    
    return `import React, { createContext, useContext, useReducer, useEffect } from 'react';

${typescript ? `interface ${contextName}State {
  // Define your state interface here
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

interface User {
  id: string;
  email: string;
  name: string;
}

interface ${contextName}ContextType extends ${contextName}State {
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (userData: Partial<User>) => Promise<void>;
}` : ''}

const initial${contextName}State${typescript ? `: ${contextName}State` : ''} = {
  user: null,
  isAuthenticated: false,
  loading: true
};

const ${contextName}Context = createContext${typescript ? `<${contextName}ContextType | undefined>`  : ''}(undefined);

const ${contextName.toLowerCase()}Reducer = (state${typescript ? `: ${contextName}State` : ''}, action${typescript ? ': any' : ''}) => {
  switch (action.type) {
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        loading: false
      };
    case 'LOGOUT':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        loading: false
      };
    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload
      };
    default:
      return state;
  }
};

export const ${contextName}Provider${typescript ? ': React.FC<{ children: React.ReactNode }>' : ''} = ({ children }) => {
  const [state, dispatch] = useReducer(${contextName.toLowerCase()}Reducer, initial${contextName}State);

  useEffect(() => {
    // Check for existing authentication on mount
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          // Verify token and get user data
          const response = await fetch('/api/auth/me', {
            headers: { Authorization: \`Bearer \${token}\` }
          });
          
          if (response.ok) {
            const user = await response.json();
            dispatch({ type: 'LOGIN_SUCCESS', payload: user });
          } else {
            localStorage.removeItem('token');
            dispatch({ type: 'SET_LOADING', payload: false });
          }
        } else {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    };

    checkAuth();
  }, []);

  const login = async (email${typescript ? ': string' : ''}, password${typescript ? ': string' : ''}) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const { user, token } = await response.json();
        localStorage.setItem('token', token);
        dispatch({ type: 'LOGIN_SUCCESS', payload: user });
      } else {
        throw new Error('Login failed');
      }
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    dispatch({ type: 'LOGOUT' });
  };

  const register = async (userData${typescript ? ': Partial<User>' : ''}) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (response.ok) {
        const { user, token } = await response.json();
        localStorage.setItem('token', token);
        dispatch({ type: 'LOGIN_SUCCESS', payload: user });
      } else {
        throw new Error('Registration failed');
      }
    } catch (error) {
      dispatch({ type: 'SET_LOADING', payload: false });
      throw error;
    }
  };

  const value${typescript ? `: ${contextName}ContextType` : ''} = {
    ...state,
    login,
    logout,
    register
  };

  return (
    <${contextName}Context.Provider value={value}>
      {children}
    </${contextName}Context.Provider>
  );
};

export const use${contextName} = () => {
  const context = useContext(${contextName}Context);
  if (context === undefined) {
    throw new Error('use${contextName} must be used within a ${contextName}Provider');
  }
  return context;
};`;
  }

  generateReactApp(data) {
    return `import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
${data.stateManagement === 'context' ? `import { AuthProvider } from './context/AuthContext';` : ''}
import Layout from './components/Layout';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import './styles/main.css';

function App() {
  return (
    ${data.stateManagement === 'context' ? '<AuthProvider>' : ''}
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
          </Routes>
        </Layout>
      </Router>
    ${data.stateManagement === 'context' ? '</AuthProvider>' : ''}
  );
}

export default App;`;
  }

  generateReactMain(data) {
    return `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
  }

  generateHTMLTemplate(data) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.projectName}</title>
  <meta name="description" content="${data.description || `${data.projectName} - Modern web application`}">
  
  <!-- Favicon -->
  <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  
  <!-- Preconnect to external domains -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  
  ${data.features?.includes('pwa') ? `
  <!-- PWA Manifest -->
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="#000000">` : ''}
  
  <!-- Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  
  <!-- CSS -->
  <link rel="stylesheet" href="/src/styles/main.css">
</head>
<body>
  <div id="root"></div>
  
  ${data.features?.includes('pwa') ? `
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration);
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError);
          });
      });
    }
  </script>` : ''}
  
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;
  }

  generateWebpackConfig(data) {
    return `const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  mode: isProduction ? 'production' : 'development',
  
  entry: './src/main.${data.typescript ? 'tsx' : 'jsx'}',
  
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: isProduction ? '[name].[contenthash].js' : '[name].js',
    publicPath: '/',
    clean: true
  },
  
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/components'),
      '@pages': path.resolve(__dirname, 'src/pages'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@styles': path.resolve(__dirname, 'src/styles')
    }
  },
  
  module: {
    rules: [
      {
        test: /\\.(js|jsx${data.typescript ? '|ts|tsx' : ''})$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              '@babel/preset-react'${data.typescript ? ',\n              \'@babel/preset-typescript\'' : ''}
            ]
          }
        }
      },
      {
        test: /\\.css$/,
        use: [
          isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
          'css-loader',
          'postcss-loader'
        ]
      },
      {
        test: /\\.(scss|sass)$/,
        use: [
          isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
          'css-loader',
          'postcss-loader',
          'sass-loader'
        ]
      },
      {
        test: /\\.(png|jpg|jpeg|gif|svg|webp)$/,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name].[hash][ext]'
        }
      },
      {
        test: /\\.(woff|woff2|eot|ttf|otf)$/,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name].[hash][ext]'
        }
      }
    ]
  },
  
  plugins: [
    new CleanWebpackPlugin(),
    
    new HtmlWebpackPlugin({
      template: './index.html',
      minify: isProduction
    }),
    
    ...(isProduction ? [
      new MiniCssExtractPlugin({
        filename: '[name].[contenthash].css',
        chunkFilename: '[id].[contenthash].css'
      })
    ] : [])
  ],
  
  devServer: {
    historyApiFallback: true,
    port: 3000,
    hot: true,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:${data.backendPort || 8000}',
        changeOrigin: true
      }
    }
  },
  
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\\\/]node_modules[\\\\/]/,
          name: 'vendors',
          priority: 10,
          chunks: 'all'
        }
      }
    }
  }
};`;
  }

  generateViteConfig(data) {
    return `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@pages': resolve(__dirname, 'src/pages'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@styles': resolve(__dirname, 'src/styles')
    }
  },
  
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:${data.backendPort || 8000}',
        changeOrigin: true
      }
    }
  },
  
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom']
        }
      }
    }
  },
  
  css: {
    modules: {
      localsConvention: 'camelCase'
    },
    preprocessorOptions: {
      scss: {
        additionalData: '@import "@/styles/variables.scss";'
      }
    }
  }
});`;
  }

  generatePackageJson(config) {
    const dependencies = {
      react: '^18.2.0',
      'react-dom': '^18.2.0'
    };

    const devDependencies = {
      '@vitejs/plugin-react': '^4.0.0',
      vite: '^4.4.0'
    };

    if (config.routing) {
      dependencies['react-router-dom'] = '^6.8.0';
    }

    if (config.typescript) {
      devDependencies['@types/react'] = '^18.2.0';
      devDependencies['@types/react-dom'] = '^18.2.0';
      devDependencies['typescript'] = '^5.0.0';
    }

    if (config.testing) {
      devDependencies.jest = '^29.5.0';
      devDependencies['@testing-library/react'] = '^13.4.0';
      devDependencies['@testing-library/jest-dom'] = '^5.16.0';
    }

    if (config.linting) {
      devDependencies.eslint = '^8.45.0';
      devDependencies['eslint-plugin-react'] = '^7.32.0';
      devDependencies.prettier = '^3.0.0';
    }

    return JSON.stringify({
      name: config.projectName,
      private: true,
      version: '0.0.0',
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
        ...(config.testing && { test: 'jest' }),
        ...(config.linting && { 
          lint: 'eslint . --ext js,jsx,ts,tsx',
          'lint:fix': 'eslint . --ext js,jsx,ts,tsx --fix',
          format: 'prettier --write .'
        })
      },
      dependencies,
      devDependencies
    }, null, 2);
  }

  generateTSConfig(config) {
    return JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        useDefineForClassFields: true,
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext',
        skipLibCheck: true,
        moduleResolution: 'bundler',
        allowImportingTsExtensions: true,
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: 'react-jsx',
        strict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noFallthroughCasesInSwitch: true,
        baseUrl: '.',
        paths: {
          '@/*': ['./src/*'],
          '@components/*': ['./src/components/*'],
          '@pages/*': ['./src/pages/*'],
          '@utils/*': ['./src/utils/*'],
          '@styles/*': ['./src/styles/*']
        }
      },
      include: ['src'],
      references: [{ path: './tsconfig.node.json' }]
    }, null, 2);
  }

  generateStyleStructure(config) {
    const structure = {
      'main.css': this.generateMainCSS(config),
      'variables.css': this.generateCSSVariables(config),
      'components.css': this.generateComponentStyles(config),
      'utilities.css': this.generateUtilityClasses(config)
    };

    if (config.styling === 'scss') {
      Object.keys(structure).forEach(key => {
        const newKey = key.replace('.css', '.scss');
        structure[newKey] = structure[key];
        delete structure[key];
      });
    }

    return structure;
  }

  generateMainCSS(config) {
    return `/* Main CSS for ${config.projectName} */
@import './variables.css';
@import './components.css';
@import './utilities.css';

/* Reset and base styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html {
  font-size: 16px;
  scroll-behavior: smooth;
}

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: var(--color-text);
  background-color: var(--color-background);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Links */
a {
  color: var(--color-primary);
  text-decoration: none;
  transition: color 0.2s ease;
}

a:hover {
  color: var(--color-primary-dark);
}

/* Buttons */
button {
  font-family: inherit;
  font-size: inherit;
  border: none;
  background: none;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* Responsive images */
img {
  max-width: 100%;
  height: auto;
}

/* Focus styles */
:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
  :root {
    --color-background: #0f172a;
    --color-surface: #1e293b;
    --color-text: #f1f5f9;
    --color-text-muted: #94a3b8;
  }
}`;
  }

  generateCSSVariables(config) {
    return `:root {
  /* Colors */
  --color-primary: #3b82f6;
  --color-primary-dark: #2563eb;
  --color-primary-light: #93c5fd;
  
  --color-secondary: #64748b;
  --color-secondary-dark: #475569;
  --color-secondary-light: #cbd5e1;
  
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #06b6d4;
  
  --color-background: #ffffff;
  --color-surface: #f8fafc;
  --color-border: #e2e8f0;
  
  --color-text: #1e293b;
  --color-text-muted: #64748b;
  
  /* Spacing */
  --space-xs: 0.25rem;
  --space-sm: 0.5rem;
  --space-md: 1rem;
  --space-lg: 1.5rem;
  --space-xl: 2rem;
  --space-2xl: 3rem;
  
  /* Typography */
  --font-size-xs: 0.75rem;
  --font-size-sm: 0.875rem;
  --font-size-base: 1rem;
  --font-size-lg: 1.125rem;
  --font-size-xl: 1.25rem;
  --font-size-2xl: 1.5rem;
  --font-size-3xl: 1.875rem;
  --font-size-4xl: 2.25rem;
  
  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;
  
  /* Borders */
  --border-radius-sm: 0.25rem;
  --border-radius-md: 0.375rem;
  --border-radius-lg: 0.5rem;
  --border-radius-xl: 0.75rem;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);
  
  /* Transitions */
  --transition-fast: 0.15s ease;
  --transition-normal: 0.2s ease;
  --transition-slow: 0.3s ease;
  
  /* Z-index */
  --z-dropdown: 1000;
  --z-sticky: 1020;
  --z-fixed: 1030;
  --z-modal-backdrop: 1040;
  --z-modal: 1050;
  --z-popover: 1060;
  --z-tooltip: 1070;
}`;
  }

  generateComponentStyles(config) {
    return `/* Component styles */

/* Button components */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-sm) var(--space-md);
  font-weight: var(--font-weight-medium);
  border-radius: var(--border-radius-md);
  transition: var(--transition-normal);
  text-decoration: none;
  border: 1px solid transparent;
  cursor: pointer;
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.btn-primary:hover {
  background-color: var(--color-primary-dark);
  border-color: var(--color-primary-dark);
}

.btn-secondary {
  background-color: var(--color-secondary);
  color: white;
  border-color: var(--color-secondary);
}

.btn-outline {
  background-color: transparent;
  color: var(--color-primary);
  border-color: var(--color-primary);
}

.btn-outline:hover {
  background-color: var(--color-primary);
  color: white;
}

/* Card component */
.card {
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  padding: var(--space-lg);
  box-shadow: var(--shadow-sm);
  transition: var(--transition-normal);
}

.card:hover {
  box-shadow: var(--shadow-md);
}

.card-header {
  margin-bottom: var(--space-md);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.card-title {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  margin-bottom: var(--space-xs);
}

.card-body {
  color: var(--color-text-muted);
}

/* Form components */
.form-group {
  margin-bottom: var(--space-md);
}

.form-label {
  display: block;
  font-weight: var(--font-weight-medium);
  margin-bottom: var(--space-xs);
  color: var(--color-text);
}

.form-input {
  width: 100%;
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-base);
  transition: var(--transition-fast);
}

.form-input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgb(59 130 246 / 0.1);
}

/* Navigation */
.nav {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.nav-link {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--border-radius-md);
  transition: var(--transition-fast);
}

.nav-link:hover {
  background-color: var(--color-surface);
}

.nav-link.active {
  background-color: var(--color-primary);
  color: white;
}

/* Loading spinner */
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--color-border);
  border-top: 2px solid var(--color-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}`;
  }

  generateUtilityClasses(config) {
    return `/* Utility classes */

/* Display */
.d-none { display: none; }
.d-block { display: block; }
.d-inline { display: inline; }
.d-inline-block { display: inline-block; }
.d-flex { display: flex; }
.d-grid { display: grid; }

/* Flexbox */
.flex-row { flex-direction: row; }
.flex-column { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.flex-nowrap { flex-wrap: nowrap; }

.justify-start { justify-content: flex-start; }
.justify-center { justify-content: center; }
.justify-end { justify-content: flex-end; }
.justify-between { justify-content: space-between; }
.justify-around { justify-content: space-around; }

.items-start { align-items: flex-start; }
.items-center { align-items: center; }
.items-end { align-items: flex-end; }
.items-stretch { align-items: stretch; }

/* Grid */
.grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }

.gap-xs { gap: var(--space-xs); }
.gap-sm { gap: var(--space-sm); }
.gap-md { gap: var(--space-md); }
.gap-lg { gap: var(--space-lg); }
.gap-xl { gap: var(--space-xl); }

/* Spacing */
.m-0 { margin: 0; }
.m-auto { margin: auto; }
.mt-auto { margin-top: auto; }
.mr-auto { margin-right: auto; }
.mb-auto { margin-bottom: auto; }
.ml-auto { margin-left: auto; }

.p-0 { padding: 0; }
.p-xs { padding: var(--space-xs); }
.p-sm { padding: var(--space-sm); }
.p-md { padding: var(--space-md); }
.p-lg { padding: var(--space-lg); }
.p-xl { padding: var(--space-xl); }

/* Text */
.text-xs { font-size: var(--font-size-xs); }
.text-sm { font-size: var(--font-size-sm); }
.text-base { font-size: var(--font-size-base); }
.text-lg { font-size: var(--font-size-lg); }
.text-xl { font-size: var(--font-size-xl); }
.text-2xl { font-size: var(--font-size-2xl); }

.font-normal { font-weight: var(--font-weight-normal); }
.font-medium { font-weight: var(--font-weight-medium); }
.font-semibold { font-weight: var(--font-weight-semibold); }
.font-bold { font-weight: var(--font-weight-bold); }

.text-left { text-align: left; }
.text-center { text-align: center; }
.text-right { text-align: right; }

.text-primary { color: var(--color-primary); }
.text-secondary { color: var(--color-secondary); }
.text-success { color: var(--color-success); }
.text-warning { color: var(--color-warning); }
.text-error { color: var(--color-error); }
.text-muted { color: var(--color-text-muted); }

/* Width & Height */
.w-full { width: 100%; }
.w-auto { width: auto; }
.h-full { height: 100%; }
.h-auto { height: auto; }
.min-h-screen { min-height: 100vh; }

/* Position */
.relative { position: relative; }
.absolute { position: absolute; }
.fixed { position: fixed; }
.sticky { position: sticky; }

/* Visibility */
.visible { visibility: visible; }
.invisible { visibility: hidden; }
.opacity-0 { opacity: 0; }
.opacity-50 { opacity: 0.5; }
.opacity-100 { opacity: 1; }

/* Responsive utilities */
@media (min-width: 640px) {
  .sm\\:d-block { display: block; }
  .sm\\:d-flex { display: flex; }
  .sm\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 768px) {
  .md\\:d-block { display: block; }
  .md\\:d-flex { display: flex; }
  .md\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

@media (min-width: 1024px) {
  .lg\\:d-block { display: block; }
  .lg\\:d-flex { display: flex; }
  .lg\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}`;
  }

  generatePWAManifest(config) {
    return JSON.stringify({
      name: config.projectName,
      short_name: config.projectName,
      description: config.description || `${config.projectName} - Modern web application`,
      start_url: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#3b82f6',
      orientation: 'portrait-primary',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        }
      ],
      categories: ['productivity', 'utilities'],
      lang: 'en'
    }, null, 2);
  }

  generateServiceWorker(config) {
    return `const CACHE_NAME = '${config.projectName}-v1';
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});`;
  }
}

module.exports = { WebGenerator };