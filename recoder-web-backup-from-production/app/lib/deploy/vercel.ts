export interface DeployOptions {
  projectName: string;
  files: Record<string, string>;
  framework: 'nextjs' | 'react' | 'static';
}

export async function deployToVercel(options: DeployOptions, token: string): Promise<{ url: string }> {
  const { projectName, files, framework } = options;

  // Create deployment
  const response = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: projectName,
      files: Object.entries(files).map(([file, data]) => ({
        file,
        data: Buffer.from(data).toString('base64'),
      })),
      projectSettings: {
        framework: framework === 'static' ? null : framework,
      },
    }),
  });

  if (!response.ok) {
    throw new Error('Deployment failed');
  }

  const data = await response.json();
  return { url: `https://${data.url}` };
}

export async function deployToNetlify(options: DeployOptions, token: string): Promise<{ url: string }> {
  const { projectName, files } = options;

  // Create site
  const siteResponse = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: projectName }),
  });

  const site = await siteResponse.json();

  // Deploy files
  const deployResponse = await fetch(`https://api.netlify.com/api/v1/sites/${site.id}/deploys`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: Object.fromEntries(
        Object.entries(files).map(([path, content]) => [
          path,
          Buffer.from(content).toString('base64'),
        ])
      ),
    }),
  });

  const deploy = await deployResponse.json();
  return { url: deploy.url };
}
