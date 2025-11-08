module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/dist/**',
      'packages/*/dist/**',
      'plugin-registry-service/**',
      'ml-training-service/**',
      'collaboration-service/**',
      'react-blog-app/**',
      'book-api/**',
      'temp/**',
      'venv/**',
      'checkpoints/**',
      'datasets/**',
      'models/**',
      '*.tsbuildinfo',
      'examples/**',
      '**/generated/**',
      'packages/cli/src/generated/**',
      'scripts/**',
      'packages/vscode-ide-companion/esbuild.js',
      'packages/vscode-ide-companion/scripts/**'
    ]
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': 'off', // Too many warnings, disable for now
      'no-console': 'off',
      'prefer-const': 'off',
      'no-var': 'error',
      'eqeqeq': 'off'
    }
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: require('@typescript-eslint/parser'),
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        global: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': require('@typescript-eslint/eslint-plugin')
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off'
    }
  }
];