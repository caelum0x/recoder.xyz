export interface ExportOptions {
  framework: 'react' | 'nextjs' | 'html';
  typescript: boolean;
  styling: 'tailwind' | 'css' | 'inline';
}

export function generateReactComponent(name: string, jsx: string, options: ExportOptions): string {
  const ext = options.typescript ? 'tsx' : 'jsx';
  const imports = options.styling === 'tailwind' ? '' : "import './styles.css';\n";
  
  return `${imports}export default function ${name}() {
  return (
    ${jsx}
  );
}`;
}

export function generateNextJSPage(jsx: string, options: ExportOptions): string {
  return `export default function Page() {
  return (
    <main className="min-h-screen p-8">
      ${jsx}
    </main>
  );
}`;
}

export function generateHTML(jsx: string): string {
  const html = jsx
    .replace(/className=/g, 'class=')
    .replace(/{([^}]+)}/g, '$1')
    .replace(/style={{([^}]+)}}/g, (_, styles) => {
      const cssProps = styles.split(',').map((s: string) => {
        const [key, val] = s.split(':');
        const cssKey = key.trim().replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${cssKey}:${val.trim()}`;
      }).join(';');
      return `style="${cssProps}"`;
    });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Page</title>
</head>
<body>
  ${html}
</body>
</html>`;
}

export function generatePackageJSON(framework: 'react' | 'nextjs'): string {
  const deps = framework === 'nextjs'
    ? { next: '^14.0.0', react: '^18.0.0', 'react-dom': '^18.0.0' }
    : { react: '^18.0.0', 'react-dom': '^18.0.0' };

  return JSON.stringify({
    name: 'generated-project',
    version: '1.0.0',
    scripts: framework === 'nextjs'
      ? { dev: 'next dev', build: 'next build', start: 'next start' }
      : { dev: 'vite', build: 'vite build' },
    dependencies: deps,
  }, null, 2);
}

export function exportProject(jsx: string, options: ExportOptions): Record<string, string> {
  const files: Record<string, string> = {};

  if (options.framework === 'html') {
    files['index.html'] = generateHTML(jsx);
  } else if (options.framework === 'nextjs') {
    files['package.json'] = generatePackageJSON('nextjs');
    files['app/page.tsx'] = generateNextJSPage(jsx, options);
  } else {
    files['package.json'] = generatePackageJSON('react');
    files['src/App.tsx'] = generateReactComponent('App', jsx, options);
  }

  return files;
}
