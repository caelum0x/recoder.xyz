'use client';

import { PWABuilder } from '../../components/pwa-generator/pwa-builder';

export default function PWAGeneratorPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-4">PWA Generator</h1>
          <p className="text-lg text-muted-foreground">
            Build professional Progressive Web Apps with advanced features and real backend APIs
          </p>
        </div>
        
        <PWABuilder 
          className="w-full"
          onConfigChange={(config) => {
            console.log('PWA Config changed:', config);
          }}
          onGenerate={(config) => {
            console.log('PWA Generated:', config);
          }}
        />
      </div>
    </div>
  );
}
