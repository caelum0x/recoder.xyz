'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, Activity, Globe } from 'lucide-react';
import { getServiceUrlClient, getService, type RecoderService } from '@/lib/config/platforms';

interface PlatformDetailPageProps {
  serviceId: string;
  longDescription: string;
  features: string[];
  useCases: string[];
}

export function PlatformDetailPage({ serviceId, longDescription, features, useCases }: PlatformDetailPageProps) {
  const service = getService(serviceId);
  if (!service) return <div className="min-h-screen bg-black text-white flex items-center justify-center">Service not found</div>;

  const url = getServiceUrlClient(serviceId);

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
            <Link href="/platform" className="text-sm text-gray-400 hover:text-white transition-colors">Platform</Link>
          </nav>
        </div>
      </header>

      <div className="container mx-auto max-w-4xl px-6 py-12">
        {/* Back */}
        <Link href="/platform" className="inline-flex items-center space-x-2 text-sm text-gray-500 hover:text-white transition-colors mb-8">
          <ArrowLeft className="w-4 h-4" />
          <span>All services</span>
        </Link>

        {/* Title */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">{service.label}</h1>
            <p className="text-gray-400">{service.description}</p>
            <p className="text-sm text-gray-600 font-mono mt-1">{service.productionUrl.replace('https://', '')} &middot; Port {service.port}</p>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />
            <span className="text-sm text-green-400">Online</span>
          </div>
        </div>

        {/* Launch button */}
        <div className="flex items-center space-x-4 mb-12">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            <Globe className="w-5 h-5" />
            <span>Launch {service.label}</span>
          </a>
          <Link
            href="/status"
            className="inline-flex items-center space-x-2 px-4 py-3 bg-[#222] hover:bg-[#333] rounded-lg text-sm transition-colors"
          >
            <Activity className="w-4 h-4" />
            <span>View Status</span>
          </Link>
        </div>

        {/* Description */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-4">About</h2>
          <p className="text-gray-400 leading-relaxed">{longDescription}</p>
        </div>

        {/* Features */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Features</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {features.map((feature) => (
              <div key={feature} className="flex items-start space-x-3 p-3 bg-[#111] border border-white/5 rounded-lg">
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-2 shrink-0" />
                <span className="text-sm text-gray-300">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Use Cases */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Use Cases</h2>
          <div className="space-y-3">
            {useCases.map((useCase) => (
              <div key={useCase} className="flex items-start space-x-3 p-3 bg-[#0a0a0a] border border-white/5 rounded-lg">
                <span className="text-sm text-gray-400">{useCase}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Links */}
        <div className="border-t border-white/10 pt-8">
          <h2 className="text-xl font-semibold mb-4">Quick Links</h2>
          <div className="flex flex-wrap gap-3">
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-1 text-sm text-orange-400 hover:text-orange-300">
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open {service.label}</span>
            </a>
            <Link href="/status" className="text-sm text-gray-500 hover:text-white transition-colors">System Status</Link>
            <Link href="/agents" className="text-sm text-gray-500 hover:text-white transition-colors">AI Agents</Link>
            <Link href="/plan" className="text-sm text-gray-500 hover:text-white transition-colors">Plans & Pricing</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
