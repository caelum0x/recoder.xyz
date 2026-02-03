import { json, redirect, type LoaderFunctionArgs, type MetaFunction } from '@remix-run/cloudflare';
import { ClientOnly } from 'remix-utils/client-only';
import { BaseChat } from '~/components/chat/BaseChat';
import { Chat } from '~/components/chat/Chat.client';
import { Header } from '~/components/header/Header';

export const meta: MetaFunction = () => {
  return [{ title: 'Recoder.xyz - AI Full-Stack Development' }, { name: 'description', content: 'Build complete full-stack applications with AI assistance - from frontend to backend, APIs to databases' }];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const mainSiteUrl = process.env.NODE_ENV === 'production' ? 'https://recoder.xyz' : 'http://localhost:3000';
  
  // Check for Better Auth session cookie (shared via crossSubDomainCookies)
  const cookies = request.headers.get('Cookie') || '';
  
  // Better Auth uses "recoder.session_token" as cookie name with prefix "recoder"
  // Check for various possible cookie formats
  const hasSessionToken = cookies.includes('recoder.session_token') || 
                          cookies.includes('recoder.session') ||
                          cookies.includes('session_token');
  
  console.log('Cookies received:', cookies);
  console.log('Has session token:', hasSessionToken);

  // Skip auth check in local development for docker-backend testing
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (!hasSessionToken && !isDevelopment) {
    return redirect(`${mainSiteUrl}/auth/signin?redirect=${encodeURIComponent(url.toString())}`);
  }
  
  const projectId = url.searchParams.get('projectId');
  
  if (projectId) {
    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;
    
    if (databaseUrl) {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(databaseUrl);
        
        // Get project details including framework and templateId for container config
        const projects = await sql`
          SELECT id, name, type, description, framework, "templateId" FROM projects WHERE id = ${projectId}
        `;
        const project = projects[0];

        if (!project) {
          return json({ error: 'Project not found' });
        }

        // Find most recent chat for this project
        const chats = await sql`
          SELECT id, "urlId" FROM chat_sessions
          WHERE "projectId" = ${projectId}
          ORDER BY "updatedAt" DESC
          LIMIT 1
        `;

        if (chats.length > 0) {
          // Redirect to existing chat
          return redirect(`/chat/${chats[0].urlId || chats[0].id}`);
        }

        // No existing chat - return project info for display
        return json({
          projectId,
          projectName: project.name,
          projectType: project.type,
          projectFramework: project.framework || undefined,
          projectTemplateId: project.templateId || undefined,
        });
      } catch (e) {
        console.error('Error loading project:', e);
      }
    }
    
    return json({ projectId });
  }
  
  return json({});
}

export default function Index() {
  return (
    <div className="flex flex-col h-full w-full">
      <Header />
      <ClientOnly fallback={<BaseChat />}>{() => <Chat />}</ClientOnly>
    </div>
  );
}
