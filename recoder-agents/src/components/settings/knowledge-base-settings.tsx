'use client';

import { FileText, ExternalLink, FolderOpen, Upload, Bot } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function KnowledgeBaseSettings() {
  const t = useTranslations('settings.knowledgeBase');
  const router = useRouter();

  return (
    <div className="p-4 sm:p-6 pb-12 sm:pb-6 space-y-5 sm:space-y-6 min-w-0 max-w-full overflow-x-hidden">
      <div>
        <div className="flex items-start justify-between mb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">{t('title') || 'Knowledge Base'}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('description') || 'Upload and manage documents for your workers'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Upload files and documents that your workers can reference for more accurate, context-aware responses.
            Each worker can be assigned specific knowledge base entries from their configuration page.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
              <Upload className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Upload files</p>
                <p className="text-xs text-muted-foreground mt-0.5">PDF, DOC, TXT, MD, CSV and more (50MB limit)</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
              <FolderOpen className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Organize in folders</p>
                <p className="text-xs text-muted-foreground mt-0.5">Group related files for easy management</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-card">
              <Bot className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Assign to workers</p>
                <p className="text-xs text-muted-foreground mt-0.5">Choose which files each worker can access</p>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => router.push('/agents')}
              className="gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Manage Knowledge Base in Worker Config
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Open any worker&apos;s configuration and navigate to the Knowledge tab to upload files and manage assignments.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
