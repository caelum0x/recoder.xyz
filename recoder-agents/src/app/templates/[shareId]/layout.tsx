import { backendApi } from '@/lib/api-client';
import { Metadata } from 'next';
import { resolveAgentsSiteUrl, resolveBackendApiUrl } from '@/lib/runtime-urls';

export async function generateMetadata({ params }: { params: Promise<{ shareId: string }> }): Promise<Metadata> {
  const { shareId: templateId } = await params;
  const siteUrl = resolveAgentsSiteUrl();

  try {
    const response = await fetch(`${resolveBackendApiUrl()}/templates/public/${templateId}`);

    if (!response.ok) {
      throw new Error('Template not found');
    }

    const template = await response.json();

    const title = `${template.name} - AI Worker Template | Recoder`;
    const description = template.description || 'Discover and install this AI worker template to enhance your workflow with powerful automation capabilities.';

    const ogImage = `${siteUrl}/api/og/template?shareId=${templateId}`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        url: `${siteUrl}/templates/${templateId}`,
        images: [
          {
            url: ogImage,
            width: 1200,
            height: 630,
            alt: template.name,
          }
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImage],
      },
    };
  } catch (error) {
    return {
      title: 'AI Worker Template | Recoder',
      description: 'Discover and install AI worker templates to enhance your workflow with powerful automation capabilities.',
      openGraph: {
        title: 'AI Worker Template | Recoder',
        description: 'Discover and install AI worker templates to enhance your workflow with powerful automation capabilities.',
        type: 'website',
        url: `${siteUrl}/templates/${templateId}`,
        images: [
          {
            url: `${siteUrl}/share-page/og-fallback.png`,
            width: 1200,
            height: 630,
            alt: 'Recoder Worker Template',
          }
        ],
      },
    };
  }
}

export default function TemplateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 
