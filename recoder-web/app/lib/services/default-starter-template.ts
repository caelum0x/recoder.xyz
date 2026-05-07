export const VITE_REACT_TEMPLATE: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'vite-react-typescript-starter',
    private: true,
    version: '0.0.0',
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      lint: 'eslint .',
      preview: 'vite preview',
      typecheck: 'tsc --noEmit -p tsconfig.app.json',
    },
    dependencies: {
      'lucide-react': '^0.344.0',
      react: '^18.3.1',
      'react-dom': '^18.3.1',
    },
    devDependencies: {
      '@eslint/js': '^9.9.1',
      '@types/react': '^18.3.5',
      '@types/react-dom': '^18.3.0',
      '@vitejs/plugin-react': '^4.3.1',
      autoprefixer: '^10.4.18',
      eslint: '^9.9.1',
      'eslint-plugin-react-hooks': '^5.1.0-rc.0',
      'eslint-plugin-react-refresh': '^0.4.11',
      globals: '^15.9.0',
      postcss: '^8.4.35',
      tailwindcss: '^3.4.1',
      typescript: '^5.5.3',
      'typescript-eslint': '^8.3.0',
      vite: '^5.4.2',
    },
  }, null, 2),

  'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React + TS</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,

  'vite.config.ts': `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
`,

  'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,

  'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,

  'tsconfig.json': JSON.stringify({
    files: [],
    references: [
      { path: './tsconfig.app.json' },
      { path: './tsconfig.node.json' },
    ],
  }, null, 2),

  'tsconfig.app.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      useDefineForClassFields: true,
      lib: ['ES2020', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: 'force',
      noEmit: true,
      jsx: 'react-jsx',
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['src'],
  }, null, 2),

  'tsconfig.node.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2023'],
      module: 'ESNext',
      skipLibCheck: true,
      moduleResolution: 'bundler',
      allowImportingTsExtensions: true,
      isolatedModules: true,
      moduleDetection: 'force',
      noEmit: true,
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noFallthroughCasesInSwitch: true,
    },
    include: ['vite.config.ts'],
  }, null, 2),

  'src/main.tsx': `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
`,

  'src/App.tsx': `function App() {
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <p className="text-xl text-gray-700">Start prompting (or editing) to see magic happen :)</p>
    </div>
  );
}

export default App;
`,

  'src/index.css': `@tailwind base;
@tailwind components;
@tailwind utilities;
`,

  'src/vite-env.d.ts': `/// <reference types="vite/client" />
`,
};

export function getViteReactTemplateFiles(): Array<{ path: string; content: string }> {
  return Object.entries(VITE_REACT_TEMPLATE).map(([path, content]) => ({
    path,
    content,
  }));
}
