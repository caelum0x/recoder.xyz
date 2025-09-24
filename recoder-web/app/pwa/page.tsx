import { Metadata } from 'next';
import PWAManager from '@/components/pwa/pwa-manager';
import PWAInstallPrompt from '@/components/pwa/pwa-install-prompt';

export const metadata: Metadata = {
  title: 'Progressive Web App - Recoder.xyz',
  description: 'Manage your Progressive Web App settings, installation, and offline features',
  keywords: 'PWA, Progressive Web App, offline, service worker, cache, notifications'
};

export default function PWAPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Progressive Web App</h1>
        <p className="text-muted-foreground">
          Manage your PWA installation, offline features, and performance settings.
        </p>
      </div>

      {/* Install prompt */}
      <PWAInstallPrompt />

      {/* Main PWA management interface */}
      <PWAManager />
    </div>
  );
}