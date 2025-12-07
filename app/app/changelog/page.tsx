import { Sparkles, Zap, Bug, Shield } from 'lucide-react';

export default function ChangelogPage() {
  const releases = [
    {
      version: '1.0.0-beta',
      date: 'December 2025',
      title: 'Public Beta Launch',
      changes: [
        { type: 'feature', text: 'Web IDE with full AI integration' },
        { type: 'feature', text: 'CLI tool for terminal-based development' },
        { type: 'feature', text: '40+ AI model support (GPT, Claude, Gemini, Llama)' },
        { type: 'feature', text: 'Google and GitHub OAuth authentication' },
        { type: 'feature', text: 'Bring Your Own API Key model - 100% free' },
        { type: 'feature', text: 'Project management dashboard' },
        { type: 'feature', text: 'MCP (Model Context Protocol) support' },
        { type: 'security', text: 'End-to-end encryption for API keys' },
      ]
    },
    {
      version: '0.9.0-alpha',
      date: 'November 2025',
      title: 'Alpha Testing',
      changes: [
        { type: 'feature', text: 'Initial Web IDE implementation' },
        { type: 'feature', text: 'Basic CLI functionality' },
        { type: 'feature', text: 'User authentication system' },
        { type: 'fix', text: 'Various stability improvements' },
      ]
    }
  ];

  const getIcon = (type: string) => {
    switch (type) {
      case 'feature': return <Sparkles className="w-4 h-4 text-green-500" />;
      case 'improvement': return <Zap className="w-4 h-4 text-blue-500" />;
      case 'fix': return <Bug className="w-4 h-4 text-orange-500" />;
      case 'security': return <Shield className="w-4 h-4 text-purple-500" />;
      default: return <Sparkles className="w-4 h-4 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold mb-6">Changelog</h1>
          <p className="text-xl text-gray-400">Track our progress and new features</p>
        </div>

        <div className="space-y-12">
          {releases.map((release, i) => (
            <div key={i} className="relative pl-8 border-l-2 border-white/10">
              <div className="absolute -left-2 top-0 w-4 h-4 bg-orange-500 rounded-full" />
              <div className="mb-4">
                <div className="flex items-center space-x-3 mb-2">
                  <span className="px-3 py-1 bg-orange-500/20 text-orange-500 rounded-full text-sm font-mono">
                    {release.version}
                  </span>
                  <span className="text-gray-500">{release.date}</span>
                </div>
                <h2 className="text-2xl font-bold">{release.title}</h2>
              </div>
              <ul className="space-y-3">
                {release.changes.map((change, j) => (
                  <li key={j} className="flex items-start space-x-3">
                    {getIcon(change.type)}
                    <span className="text-gray-300">{change.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
