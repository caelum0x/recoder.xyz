import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export default function WebPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="web"
      longDescription="Recoder Web (Bolt AI IDE) is a browser-based AI development environment built on the Bolt.new paradigm. Write, run, and deploy code directly in your browser with AI assistance. Supports 40+ AI models via BYOK (Bring Your Own Key) and provides real-time preview, terminal access, and instant deployment."
      features={[
        'In-browser full-stack development',
        'Real-time preview and hot reload',
        'Integrated terminal',
        '40+ AI models via BYOK',
        'WebContainer-based execution',
        'Instant deployment',
        'File system with drag-and-drop',
        'Multi-file editing with AI context',
      ]}
      useCases={[
        'Quick prototyping without local setup',
        'Build and deploy web apps entirely in the browser',
        'Learn to code with AI-powered guidance',
        'Collaborate on projects from any device',
      ]}
    />
  );
}
