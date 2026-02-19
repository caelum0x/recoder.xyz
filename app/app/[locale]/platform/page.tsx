'use client';

import Link from 'next/link';
import { ArrowRight, Globe, Bot, Code2, Server, Cpu, Database, Sparkles, Workflow, Terminal, Shield } from 'lucide-react';
import { RECODER_SERVICES, getServiceUrlClient } from '@/lib/config/platforms';

const serviceIcons: Record<string, React.ElementType> = {
  app: Globe,
  frontend: Bot,
  web: Code2,
  'docker-backend': Server,
  backend: Cpu,
  pm: Database,
  studio: Sparkles,
  agency: Workflow,
  openclaw: Terminal,
  redis: Shield,
};

const serviceColors: Record<string, string> = {
  app: 'from-orange-500 to-red-500',
  frontend: 'from-blue-500 to-cyan-500',
  web: 'from-orange-500 to-yellow-500',
  'docker-backend': 'from-gray-500 to-slate-500',
  backend: 'from-green-500 to-teal-500',
  pm: 'from-blue-500 to-indigo-500',
  studio: 'from-indigo-500 to-violet-500',
  agency: 'from-purple-500 to-pink-500',
  openclaw: 'from-green-500 to-emerald-500',
  redis: 'from-red-500 to-orange-500',
};

export default function PlatformPage() {
  const userFacing = RECODER_SERVICES.filter(s => s.showInSwitcher);
  const infrastructure = RECODER_SERVICES.filter(s => s.internal);

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <img src="/logo.png" alt="Recoder" className="w-8 h-8 rounded-lg" />
            <span className="text-xl font-bold">recoder</span>
          </Link>
          <nav className="flex items-center space-x-6">
            <Link href="/agents" className="text-sm text-gray-400 hover:text-white transition-colors">Agents</Link>
            <Link href="/plan" className="text-sm text-gray-400 hover:text-white transition-colors">Plan</Link>
            <Link href="/status" className="text-sm text-gray-400 hover:text-white transition-colors">Status</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            <span className="bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">Platform</span> Services
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            10 deployed services powering the Recoder AI development ecosystem.
          </p>
        </div>
      </section>

      {/* User-facing services */}
      <section className="pb-12 px-6">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-xl font-semibold mb-6">Applications</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userFacing.map((service) => {
              const Icon = serviceIcons[service.id] || Globe;
              const color = serviceColors[service.id] || 'from-gray-500 to-gray-600';
              const url = getServiceUrlClient(service.id);
              return (
                <div key={service.id} className="bg-[#111] border border-white/10 rounded-xl p-5 hover:border-white/20 transition-all">
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2" title="Online" />
                  </div>
                  <h3 className="font-semibold mb-1">{service.label}</h3>
                  <p className="text-sm text-gray-500 mb-1">{service.description}</p>
                  <p className="text-xs text-gray-600 font-mono mb-4">{service.productionUrl.replace('https://', '')}</p>
                  <div className="flex items-center space-x-3">
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-orange-400 hover:text-orange-300 flex items-center space-x-1 transition-colors"
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>Open</span>
                    </a>
                    <Link
                      href={`/platform/${service.id}`}
                      className="text-sm text-gray-500 hover:text-white flex items-center space-x-1 transition-colors"
                    >
                      <span>Details</span>
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Infrastructure */}
      <section className="pb-16 px-6">
        <div className="container mx-auto max-w-5xl">
          <h2 className="text-xl font-semibold mb-6">Infrastructure</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {infrastructure.map((service) => {
              const Icon = serviceIcons[service.id] || Server;
              return (
                <div key={service.id} className="bg-[#0a0a0a] border border-white/5 rounded-lg p-4">
                  <div className="flex items-center space-x-3">
                    <Icon className="w-5 h-5 text-gray-600" />
                    <div>
                      <div className="text-sm font-medium text-gray-400">{service.label}</div>
                      <div className="text-xs text-gray-600">{service.description} &middot; Port {service.port}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
