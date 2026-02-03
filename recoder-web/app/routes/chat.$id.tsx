import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { default as IndexRoute } from './_index';

export async function loader({ params, context }: LoaderFunctionArgs) {
  const chatId = params.id;

  // Try to look up the project linked to this chat session
  // so we can pass framework/templateId for container configuration
  const env = context.cloudflare?.env;
  const databaseUrl = (env as any)?.DATABASE_URL || process.env.DATABASE_URL;

  if (databaseUrl && chatId) {
    try {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(databaseUrl);

      // Look up chat session -> project -> framework/templateId
      const results = await sql`
        SELECT p.framework, p."templateId"
        FROM chat_sessions cs
        JOIN projects p ON p.id = cs."projectId"
        WHERE cs.id = ${chatId} OR cs."urlId" = ${chatId}
        LIMIT 1
      `;

      if (results.length > 0) {
        return json({
          id: chatId,
          projectFramework: results[0].framework || undefined,
          projectTemplateId: results[0].templateId || undefined,
        });
      }
    } catch (e) {
      // Non-critical: fall through to default response without framework info
      console.debug('[chat.$id] Could not look up project framework:', e);
    }
  }

  return json({ id: chatId });
}

export default IndexRoute;
