import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export default function FrontendPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="frontend"
      longDescription="Recoder Frontend (Suna AI IDE) is a full-featured autonomous AI development environment. It provides AI agents that can write, debug, and deploy code independently. With browser automation, file management, and sandboxed execution, it handles complex development workflows end-to-end."
      features={[
        'Autonomous AI coding agents',
        'Browser automation and web scraping',
        'File system management and editing',
        'Sandboxed code execution',
        'Real-time collaboration',
        'Git integration and version control',
        'Multi-model support (Claude, GPT-4, Gemini)',
        'Custom agent configurations',
      ]}
      useCases={[
        'Build full-stack applications with AI agents doing the heavy lifting',
        'Automate repetitive development tasks like testing and refactoring',
        'Prototype new features rapidly with autonomous coding assistance',
        'Debug complex issues with AI-powered code analysis',
      ]}
    />
  );
}
