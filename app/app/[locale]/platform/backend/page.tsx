import { PlatformDetailPage } from '@/components/PlatformDetailPage';

export default function BackendPlatformPage() {
  return (
    <PlatformDetailPage
      serviceId="backend"
      longDescription="The Python Backend is the core AI processing engine for the Recoder ecosystem. Built with FastAPI, it handles AI model orchestration, sandbox management, browser automation, and file operations. Powers the Suna AI IDE frontend."
      features={[
        'FastAPI-powered AI backend',
        'Multi-model AI orchestration',
        'Sandbox environment management',
        'Browser automation engine',
        'File operation processing',
        'Real-time agent execution',
        'Health and monitoring endpoints',
        'Scalable async architecture',
      ]}
      useCases={[
        'Process complex AI agent tasks with sandbox isolation',
        'Orchestrate multiple AI models for different capabilities',
        'Execute browser automation workflows',
        'Manage file operations in sandboxed environments',
      ]}
    />
  );
}
