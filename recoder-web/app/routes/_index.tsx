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
  const token = url.searchParams.get('token');
  const from = url.searchParams.get('from');
  
  // Handle auth token from main app
  if (token && from === 'main-site') {
    try {
      const verifyResponse = await fetch('https://recoder.xyz/api/auth/verify-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });

      if (verifyResponse.ok) {
        const userData = await verifyResponse.json();
        // Redirect to clean URL with session cookie
        return redirect('/', {
          headers: {
            'Set-Cookie': `recoder_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
          }
        });
      }
    } catch (error) {
      console.error('Auth token verification failed:', error);
    }
  }
  
  const projectId = url.searchParams.get('projectId');
  
  if (projectId) {
    const env = context.cloudflare?.env;
    const databaseUrl = env?.DATABASE_URL || process.env.DATABASE_URL;
    
    if (databaseUrl) {
      try {
        const { neon } = await import('@neondatabase/serverless');
        const sql = neon(databaseUrl);
        
        // Get project details
        const projects = await sql`
          SELECT id, name, type, description FROM projects WHERE id = ${projectId}
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
          projectType: project.type 
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
