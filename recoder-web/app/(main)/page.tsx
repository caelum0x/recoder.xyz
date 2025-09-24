"use client";

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';
/* eslint-disable @next/next/no-img-element */

import Fieldset from "@/components/fieldset";
import ArrowRightIcon from "@/components/icons/arrow-right";
import LightningBoltIcon from "@/components/icons/lightning-bolt";
import LoadingButton from "@/components/loading-button";
import Spinner from "@/components/spinner";
import bgImg from "./halo.png";
import * as Select from "@radix-ui/react-select";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState, useRef, useTransition } from "react";
import { createChat } from "./actions";
import { Context } from "./providers";
import Header from "@/components/header";
import { useS3Upload } from "next-s3-upload";
import UploadIcon from "@/components/icons/upload-icon";
import { XCircleIcon } from "@heroicons/react/20/solid";
import { MODELS, SUGGESTED_PROMPTS, AI_PROVIDERS } from "@/lib/constants";
import MobileOptimizations from "@/components/mobile-optimizations";
import EnterpriseAnalyticsDashboard from "@/components/enterprise-analytics-dashboard";
import TeamCollaboration from "@/components/team-collaboration";
import AIOrchestrationEngine from "@/components/ai-orchestration-engine";
import CodeQualityAnalyzer from "@/components/code-quality-analyzer";
import RealTimeMarketDestroyer from "@/components/real-time-market-destroyer";
import MobileAppBuilder from "@/components/mobile-app-builder";

export default function Home() {
  const { setStreamPromise } = use(Context);
  const router = useRouter();

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(MODELS[0].value);
  const [quality, setQuality] = useState("high");
  const [smartRouting, setSmartRouting] = useState(true);
  const [recommendedModel, setRecommendedModel] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState("auto");
  const [screenshotUrl, setScreenshotUrl] = useState<string | undefined>(
    undefined,
  );
  const [screenshotLoading, setScreenshotLoading] = useState(false);
  const selectedModel = MODELS.find((m) => m.value === model);
  const selectedProvider = selectedModel?.provider || "together";
  const isUsingRecommended = smartRouting && recommendedModel === model;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPending, startTransition] = useTransition();

  const { uploadToS3 } = useS3Upload();
  
  // Smart model recommendation based on prompt
  const getSmartRecommendation = async (promptText: string) => {
    if (!smartRouting || promptText.length < 10) return;
    
    try {
      const response = await fetch('/api/smart-routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptText,
          preferences: {
            speed: quality === 'low' ? 'fast' : 'balanced',
            cost: 'medium'
          }
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        setRecommendedModel(result.recommendedModel);
        if (aiProvider === 'auto') {
          setModel(result.recommendedModel);
        }
      }
    } catch (error) {
      console.warn('Smart routing failed:', error);
    }
  };
  
  const handleScreenshotUpload = async (event: any) => {
    if (prompt.length === 0) setPrompt("Build this");
    setQuality("low");
    setScreenshotLoading(true);
    let file = event.target.files[0];
    const { url } = await uploadToS3(file);
    setScreenshotUrl(url);
    setScreenshotLoading(false);
  };

  const textareaResizePrompt = prompt
    .split("\n")
    .map((text) => (text === "" ? "a" : text))
    .join("\n");

  return (
    <MobileOptimizations>
      <div className="relative flex grow flex-col">
        <div className="absolute inset-0 flex justify-center">
          <Image
            src={bgImg}
            alt=""
            className="max-h-[953px] w-full max-w-[1200px] object-cover object-top mix-blend-screen"
            priority
          />
        </div>

        <div className="isolate flex h-full grow flex-col">
          <Header />

        <div className="mt-10 flex grow flex-col items-center px-4 lg:mt-16">
          {/* Enhanced Feature Highlights */}
          <div className="mb-8 flex flex-wrap justify-center gap-3">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-full backdrop-blur-sm">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-center text-sm font-medium text-blue-700">
                Powered by <span className="font-semibold">Multi-AI Intelligence</span>
              </span>
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-full backdrop-blur-sm">
              <span className="flex items-center gap-2 text-sm font-medium text-purple-700">
                <span className="flex items-center gap-1">
                  🤖 Claude • ⚡ Groq • 🔥 Together • 🌍 OpenRouter
                </span>
              </span>
            </div>
          </div>

          {/* Enhanced Hero Section with Better Visual Hierarchy */}
          <div className="relative mb-12">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-pink-500/10 rounded-[3rem] blur-3xl transform scale-110" />
            <div className="relative bg-white/70 backdrop-blur-md border border-white/30 rounded-[2rem] p-8 md:p-12 shadow-2xl ring-1 ring-black/5">
              <div className="text-center space-y-8">
                <div className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-blue-100/80 to-purple-100/80 rounded-full text-sm font-semibold text-gray-800 border border-blue-200/50 backdrop-blur-sm">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span>Production-Ready AI Development Platform</span>
                </div>
                
                <div className="space-y-4">
                  <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight tracking-tight">
                    <span className="bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent">
                      Ship Ideas
                    </span>
                    <br />
                    <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                      Into Reality
                    </span>
                  </h1>
                  
                  <p className="text-lg md:text-xl text-gray-700 max-w-3xl mx-auto leading-relaxed font-medium">
                    Transform concepts into <span className="font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">production-ready applications</span> using our 
                    multi-AI development platform. Smart routing across <span className="font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded-md">15+ models</span> 
                    ensures optimal results for every task.
                  </p>
                </div>
                
                {/* Enhanced Feature Highlights */}
                <div className="flex flex-wrap justify-center gap-3 mt-8">
                  {[
                    { icon: "⚡", text: "Lightning Fast", color: "green" },
                    { icon: "🧠", text: "Smart AI Routing", color: "blue" },
                    { icon: "🚀", text: "Deploy Instantly", color: "purple" },
                    { icon: "🔒", text: "Enterprise Ready", color: "orange" }
                  ].map((feature) => (
                    <div key={feature.text} className={`group flex items-center gap-2 px-4 py-3 bg-white/80 rounded-xl border border-gray-200/50 backdrop-blur-sm hover:scale-105 transition-all duration-200 hover:shadow-lg ${
                      feature.color === 'green' ? 'hover:border-green-300 hover:bg-green-50/50' :
                      feature.color === 'blue' ? 'hover:border-blue-300 hover:bg-blue-50/50' :
                      feature.color === 'purple' ? 'hover:border-purple-300 hover:bg-purple-50/50' :
                      'hover:border-orange-300 hover:bg-orange-50/50'
                    }`}>
                      <span className="text-lg">{feature.icon}</span>
                      <span className="text-sm font-semibold text-gray-800">{feature.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* CURSOR KILLER FEATURES - Revolutionary AI Platform */}
          <div className="mt-16 w-full max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                <span className="bg-gradient-to-r from-red-600 via-purple-600 to-blue-600 bg-clip-text text-transparent">
                  🔥 Revolutionary AI Development Platform
                </span>
              </h2>
              <p className="text-xl text-gray-700 max-w-4xl mx-auto leading-relaxed">
                Industry-first features that <span className="font-bold text-red-600">destroy the competition</span>. 
                Technologies that Cursor, v0.dev, and other competitors <span className="font-bold text-purple-600">simply cannot match</span>.
              </p>
              
              {/* Competitive Kill Banner */}
              <div className="mt-6 bg-gradient-to-r from-red-500 via-purple-500 to-blue-500 text-white p-6 rounded-2xl shadow-2xl">
                <div className="text-2xl font-bold mb-2">💀 COMPETITION DESTROYER MODE ACTIVE 💀</div>
                <div className="text-lg opacity-90">
                  Multi-AI Orchestration • Enterprise Analytics • Real-time Collaboration • Code Quality Analysis
                </div>
              </div>
            </div>
            
            <div className="mb-16 space-y-16">
              <RealTimeMarketDestroyer className="mb-16" />
              <MobileAppBuilder />
              <AIOrchestrationEngine className="mb-16" />
              <CodeQualityAnalyzer className="mb-16" />
              <EnterpriseAnalyticsDashboard className="mb-16" />
              <TeamCollaboration className="mb-16" />
            </div>
          </div>

          {/* Platform Ecosystem Overview */}
          <div className="mt-16 w-full max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                <span className="bg-gradient-to-r from-gray-900 to-blue-800 bg-clip-text text-transparent">
                  Complete Development Ecosystem
                </span>
              </h2>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                Five integrated platforms working together to accelerate your development workflow
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Chat Platform */}
              <a 
                href="https://chat.recoder.xyz" 
                target="_blank"
                rel="noopener noreferrer"
                className="group relative overflow-hidden bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-2xl p-8 hover:shadow-2xl transition-all duration-500 hover:-translate-y-2"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl">💬</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">chat.recoder.xyz</h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    Multi-AI chat platform with smart model routing. ChatGPT competitor with 15+ AI models.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-600 group-hover:translate-x-2 transition-transform duration-300">
                      <span className="font-semibold">Start Chatting</span>
                      <ArrowRightIcon className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs text-green-600 font-medium">Live</span>
                    </div>
                  </div>
                </div>
              </a>
              
              {/* Current Platform - Web Builder */}
              <div className="group relative overflow-hidden bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-300 rounded-2xl p-8 shadow-lg">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-purple-600/10 to-pink-600/5" />
                <div className="absolute top-4 right-4 px-3 py-1 bg-blue-600 text-white text-xs font-bold rounded-full">
                  ACTIVE
                </div>
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                    <span className="text-2xl">🚀</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">web.recoder.xyz</h3>
                  <p className="text-gray-700 mb-6 leading-relaxed">
                    AI app builder platform. Complete applications from prompts with live preview and deployment.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-700">
                      <span className="font-semibold">Current Platform</span>
                      <span className="px-2 py-1 bg-blue-200 text-xs font-bold rounded-full">YOU'RE HERE</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* CLI Platform */}
              <div 
                className="group relative overflow-hidden bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-2xl p-8 hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 cursor-pointer"
                onClick={() => document.getElementById('cli-install-section')?.scrollIntoView({ behavior: 'smooth' })}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 via-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl">⚡</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">@recoder/cli</h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    Professional command-line tool with AI orchestration, smart routing, and vibe mode.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-600 group-hover:translate-x-2 transition-transform duration-300">
                      <span className="font-semibold">Install CLI</span>
                      <ArrowRightIcon className="w-5 h-5" />
                    </div>
                    <div className="text-xs text-gray-500 font-mono bg-gray-100 px-2 py-1 rounded">
                      npm i -g
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Main Website */}
              <div className="group relative overflow-hidden bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-2xl p-8 hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-gray-500/5 via-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-gray-700 to-blue-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl">🏠</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">recoder.xyz</h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    Main platform hub with authentication, billing, documentation, and user management.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-gray-600 group-hover:translate-x-2 transition-transform duration-300">
                      <span className="font-semibold">Visit Main Site</span>
                      <ArrowRightIcon className="w-5 h-5" />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* CLI Router */}
              <div className="group relative overflow-hidden bg-white/80 backdrop-blur-sm border border-gray-200/50 rounded-2xl p-8 hover:shadow-2xl transition-all duration-500 hover:-translate-y-2">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative z-10">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <span className="text-2xl">🔀</span>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">recoder-cli-router</h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    Enterprise AI model router with cost optimization and intelligent load balancing.
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-600 group-hover:translate-x-2 transition-transform duration-300">
                      <span className="font-semibold">Enterprise Router</span>
                      <ArrowRightIcon className="w-5 h-5" />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-purple-600 font-bold bg-purple-100 px-2 py-1 rounded-full">ENTERPRISE</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Professional AI Generation Form */}
          <form
            className="relative w-full max-w-4xl pt-12 lg:pt-16"
            action={async (formData) => {
              startTransition(async () => {
                const { prompt, model, quality } = Object.fromEntries(formData);

                // Validate form data with proper error handling
                if (typeof prompt !== "string" || !prompt.trim()) {
                  console.warn("Form validation: Invalid prompt");
                  return;
                }
                if (typeof model !== "string" || !model.trim()) {
                  console.warn("Form validation: Invalid model");
                  return;
                }
                if (quality !== "high" && quality !== "low") {
                  console.warn("Form validation: Invalid quality");
                  return;
                }

                try {
                  console.log('🚀 Starting chat creation...', { prompt: prompt.substring(0, 50), model, quality });
                  
                  const { chatId, lastMessageId } = await createChat(
                    prompt,
                    model,
                    quality,
                    screenshotUrl,
                  );

                  console.log('✅ Chat created successfully:', { chatId, lastMessageId });

                  const streamPromise = fetch(
                    "/api/get-next-completion-stream-promise",
                    {
                      method: "POST",
                      body: JSON.stringify({ messageId: lastMessageId, model }),
                    },
                  ).then((res) => {
                    if (!res.body) {
                      throw new Error("No body on response");
                    }
                    return res.body;
                  });

                  startTransition(() => {
                    setStreamPromise(streamPromise);
                    router.push(`/chats/${chatId}`);
                  });
                } catch (error) {
                  console.error("❌ Failed to create chat:", error);
                  // Show user-friendly error message
                  alert(`Failed to create chat: ${error instanceof Error ? error.message : 'Unknown error occurred'}`);
                }
              });
            }}
          >
            <Fieldset>
              {/* Enhanced Form Container with Professional Design */}
              <div className="relative bg-gradient-to-br from-white/95 to-white/90 backdrop-blur-md border-2 border-white/30 rounded-3xl shadow-2xl overflow-hidden ring-1 ring-black/5">
                {/* Enhanced Form Header */}
                <div className="bg-gradient-to-r from-blue-50/90 to-purple-50/90 backdrop-blur-sm p-8 border-b border-white/20">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <h3 className="text-2xl font-bold text-gray-900 tracking-tight">AI Application Builder</h3>
                      <p className="text-base text-gray-700 font-medium">Describe your app and watch it come to life with intelligent AI assistance</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {smartRouting && recommendedModel && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-100/80 to-green-100/80 rounded-full border border-blue-200/50 backdrop-blur-sm">
                          <span className="text-sm">🎯</span>
                          <span className="text-sm font-semibold text-blue-700">Smart AI Selected</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 px-3 py-2 bg-green-100/80 rounded-full border border-green-200/50">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-xs font-semibold text-green-700">ONLINE</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Enhanced Main Form Content */}
                <div className="relative flex w-full">
                  <div className="w-full p-6">
                    {screenshotLoading && (
                      <div className="relative mb-4">
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-4 border border-blue-200/50">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gray-200 rounded-xl animate-pulse flex items-center justify-center">
                              <Spinner />
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-700">Uploading image...</div>
                              <div className="text-xs text-gray-500">Processing visual input for enhanced context</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {screenshotUrl && (
                      <div className={`${isPending ? "invisible" : ""} relative mb-4`}>
                        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-2xl p-4 border border-green-200/50">
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <img
                                alt="screenshot"
                                src={screenshotUrl}
                                className="w-16 h-16 rounded-xl object-cover border-2 border-white shadow-lg"
                              />
                              <button
                                type="button"
                                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-lg transition-colors"
                                onClick={() => {
                                  setScreenshotUrl(undefined);
                                  if (fileInputRef.current) {
                                    fileInputRef.current.value = "";
                                  }
                                }}
                              >
                                ×
                              </button>
                            </div>
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-700">Visual input attached</div>
                              <div className="text-xs text-gray-500">AI will analyze this image for enhanced context</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Enhanced Textarea */}
                    <div className="relative mb-6">
                      <div className="bg-white/80 border-2 border-gray-200/50 rounded-2xl shadow-inner overflow-hidden focus-within:border-blue-300 focus-within:shadow-lg transition-all duration-200">
                        <div className="p-4">
                          <div className="invisible w-full whitespace-pre-wrap text-lg">
                            {textareaResizePrompt}
                          </div>
                          <textarea
                            placeholder="Build me a budgeting app with expense tracking, categories, and beautiful charts..."
                            required
                            name="prompt"
                            rows={1}
                            className="peer absolute inset-4 w-[calc(100%-2rem)] resize-none bg-transparent text-lg placeholder-gray-500 focus:outline-none disabled:opacity-50 font-medium"
                            value={prompt}
                            onChange={(e) => {
                              setPrompt(e.target.value);
                              // Trigger smart recommendation after user stops typing
                              if (smartRouting && e.target.value.length > 10) {
                                setTimeout(() => getSmartRecommendation(e.target.value), 1000);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault();
                                const target = event.target;
                                if (!(target instanceof HTMLTextAreaElement)) return;
                                target.closest("form")?.requestSubmit();
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Enhanced Form Controls Bar */}
                <div className="bg-gradient-to-r from-gray-50/80 to-white/80 backdrop-blur-sm border-t border-white/20 p-6">
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-6">
                      {/* Enhanced Model Selector */}
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-gray-700">AI Model:</label>
                        <Select.Root
                          name="model"
                          value={model}
                          onValueChange={setModel}
                        >
                          <Select.Trigger className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
                            isUsingRecommended 
                              ? 'text-blue-700 bg-blue-50 border-blue-200 shadow-md' 
                              : 'text-gray-700 bg-white border-gray-200 hover:border-gray-300'
                          }`}>
                            <Select.Value aria-label={model}>
                              <span className="flex items-center gap-2">
                                {isUsingRecommended && <span className="text-xs">🎯</span>}
                                <span className="font-semibold">{selectedModel?.label}</span>
                                {selectedModel?.premium && (
                                  <span className="px-2 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 text-xs font-bold rounded-full border border-purple-200">
                                    PREMIUM
                                  </span>
                                )}
                                {selectedModel?.provider && (
                                  <span className={`text-xs px-2 py-1 rounded-full ${
                                    selectedModel.provider === 'claude' ? 'bg-purple-100 text-purple-700' :
                                    selectedModel.provider === 'together' ? 'bg-blue-100 text-blue-700' :
                                    selectedModel.provider === 'groq' ? 'bg-green-100 text-green-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {selectedModel.provider}
                                  </span>
                                )}
                              </span>
                            </Select.Value>
                            <Select.Icon>
                              <ChevronDownIcon className="w-4 h-4" />
                            </Select.Icon>
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10 max-h-96 overflow-y-auto border border-gray-200/50 backdrop-blur-md">
                              <Select.Viewport className="p-3 space-y-2">
                                {/* Smart Routing Toggle */}
                                <div className="px-3 py-2 border-b border-gray-200 mb-3">
                                  <label className="flex items-center gap-3 text-sm text-gray-700 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={smartRouting}
                                      onChange={(e) => {
                                        setSmartRouting(e.target.checked);
                                        if (e.target.checked && prompt.length > 10) {
                                          getSmartRecommendation(prompt);
                                        }
                                      }}
                                      className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                                    />
                                    <span className="font-medium">🧠 Smart AI Selection</span>
                                  </label>
                                  <p className="text-xs text-gray-500 mt-1 ml-7">Automatically select the best model for your prompt</p>
                                </div>
                                
                                {/* Group models by provider */}
                                {Object.entries(AI_PROVIDERS).map(([providerId, provider]) => {
                                  const providerModels = MODELS.filter(m => m.provider === providerId);
                                  if (providerModels.length === 0 || !provider.available) return null;
                                  
                                  // Special highlighting for Claude premium models
                                  const isClaudeProvider = providerId === 'claude';
                                  const isOpenRouterProvider = providerId === 'openrouter';
                                  
                                  return (
                                    <div key={providerId} className="space-y-1">
                                      <div className={`px-3 py-2 text-xs font-bold rounded-lg border ${
                                        isClaudeProvider 
                                          ? 'text-purple-800 bg-gradient-to-r from-purple-100 to-purple-50 border-purple-200/50' 
                                          : isOpenRouterProvider
                                          ? 'text-blue-800 bg-gradient-to-r from-blue-100 to-blue-50 border-blue-200/50'
                                          : 'text-gray-800 bg-gradient-to-r from-gray-100 to-gray-50 border-gray-200/50'
                                      }`}>
                                        {isClaudeProvider && '👑 '}
                                        {isOpenRouterProvider && '🌐 '}
                                        {provider.name} {!provider.available && '(Unavailable)'}
                                        {isClaudeProvider && <span className="ml-2 text-xs bg-purple-200 text-purple-800 px-2 py-0.5 rounded-full">PREMIUM AI</span>}
                                        {isOpenRouterProvider && <span className="ml-2 text-xs bg-blue-200 text-blue-800 px-2 py-0.5 rounded-full">ALL MODELS</span>}
                                      </div>
                                      {providerModels.map((m) => (
                                        <Select.Item
                                          key={m.value}
                                          value={m.value}
                                          className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 text-sm data-[highlighted]:outline-none ml-3 border transition-all ${
                                            m.provider === 'claude' && m.premium
                                              ? 'data-[highlighted]:bg-purple-50 border-purple-200/30 bg-gradient-to-r from-purple-25 to-white hover:border-purple-300/50 hover:shadow-md'
                                              : m.free
                                              ? 'data-[highlighted]:bg-green-50 border-green-200/30 bg-gradient-to-r from-green-25 to-white hover:border-green-300/50'
                                              : m.featured
                                              ? 'data-[highlighted]:bg-blue-50 border-blue-200/30 bg-gradient-to-r from-blue-25 to-white hover:border-blue-300/50 hover:shadow-sm'
                                              : 'data-[highlighted]:bg-gray-50 border-transparent hover:border-gray-200/50'
                                          }`}
                                        >
                                          <Select.ItemText className="flex items-center gap-3 text-gray-700 flex-1">
                                            <div className="flex flex-col gap-1 flex-1">
                                              <span className="flex items-center gap-2 font-medium">
                                                {m.value === recommendedModel && smartRouting && <span className="text-xs">🎯</span>}
                                                {m.featured && <span className="text-xs">⭐</span>}
                                                {m.free && <span className="text-xs">🆓</span>}
                                                {m.reasoning && <span className="text-xs">🧠</span>}
                                                {m.code && <span className="text-xs">💻</span>}
                                                {m.multimodal && <span className="text-xs">👁️</span>}
                                                {m.label}
                                                {m.premium && (
                                                  <span className="px-2 py-1 bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 text-xs font-bold rounded-full border border-purple-200">
                                                    PREMIUM
                                                  </span>
                                                )}
                                                {m.free && (
                                                  <span className="px-2 py-1 bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 text-xs font-bold rounded-full border border-green-200">
                                                    FREE
                                                  </span>
                                                )}
                                                {m.latest && (
                                                  <span className="px-2 py-1 bg-gradient-to-r from-blue-100 to-cyan-100 text-blue-700 text-xs font-bold rounded-full border border-blue-200">
                                                    NEW
                                                  </span>
                                                )}
                                              </span>
                                              {m.description && (
                                                <span className="text-xs text-gray-500">{m.description}</span>
                                              )}
                                              {m.costPer1M && m.speed && (
                                                <div className="flex items-center gap-3 mt-1">
                                                  <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                                    ⚡ {m.speed}
                                                  </span>
                                                  <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                                    💰 {m.costPer1M}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          </Select.ItemText>
                                          <Select.ItemIndicator>
                                            <CheckIcon className="w-4 h-4 text-blue-600" />
                                          </Select.ItemIndicator>
                                        </Select.Item>
                                      ))}
                                    </div>
                                  );
                                })}
                              </Select.Viewport>
                              <Select.ScrollDownButton />
                              <Select.Arrow />
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>

                      <div className="h-6 w-px bg-gray-300" />

                      {/* Enhanced Quality Selector */}
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-gray-700">Quality:</label>
                        <Select.Root
                          name="quality"
                          value={quality}
                          onValueChange={setQuality}
                        >
                          <Select.Trigger className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all">
                            <Select.Value aria-label={quality}>
                              <span className="flex items-center gap-2">
                                <span className={quality === "high" ? "text-green-600" : "text-orange-600"}>
                                  {quality === "high" ? "🐎" : "⚡"}
                                </span>
                                <span className="font-semibold">
                                  {quality === "low" ? "Fast Mode" : "High Quality"}
                                </span>
                              </span>
                            </Select.Value>
                            <Select.Icon>
                              <ChevronDownIcon className="w-4 h-4" />
                            </Select.Icon>
                          </Select.Trigger>
                          <Select.Portal>
                            <Select.Content className="overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-black/10 border border-gray-200/50">
                              <Select.Viewport className="p-3 space-y-2">
                                {[
                                  { value: "low", label: "Fast Mode", icon: "⚡", desc: "Quick iterations and faster results" },
                                  { value: "high", label: "High Quality", icon: "🐎", desc: "Better results with more processing time" },
                                ].map((q) => (
                                  <Select.Item
                                    key={q.value}
                                    value={q.value}
                                    className="flex cursor-pointer items-center gap-3 rounded-lg p-3 text-sm data-[highlighted]:bg-blue-50 data-[highlighted]:outline-none border border-transparent hover:border-blue-200/50 transition-all"
                                  >
                                    <Select.ItemText className="flex items-center gap-3 text-gray-700 flex-1">
                                      <span className="text-lg">{q.icon}</span>
                                      <div className="flex flex-col gap-1">
                                        <span className="font-medium">{q.label}</span>
                                        <span className="text-xs text-gray-500">{q.desc}</span>
                                      </div>
                                    </Select.ItemText>
                                    <Select.ItemIndicator>
                                      <CheckIcon className="w-4 h-4 text-blue-600" />
                                    </Select.ItemIndicator>
                                  </Select.Item>
                                ))}
                              </Select.Viewport>
                              <Select.ScrollDownButton />
                              <Select.Arrow />
                            </Select.Content>
                          </Select.Portal>
                        </Select.Root>
                      </div>
                      
                      <div className="h-6 w-px bg-gray-300" />
                      
                      {/* Enhanced File Upload */}
                      <div className="flex items-center gap-3">
                        <label className="text-sm font-semibold text-gray-700">Visual:</label>
                        <label
                          htmlFor="screenshot"
                          className="flex cursor-pointer items-center gap-2 px-4 py-2 rounded-xl border-2 border-gray-200 bg-white text-sm font-medium text-gray-700 hover:border-gray-300 hover:shadow-md transition-all"
                        >
                          <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-md flex items-center justify-center">
                            <UploadIcon className="w-3 h-3 text-white" />
                          </div>
                          <span>Attach Image</span>
                        </label>
                        <input
                          id="screenshot"
                          type="file"
                          accept="image/png, image/jpeg, image/webp"
                          onChange={handleScreenshotUpload}
                          className="hidden"
                          ref={fileInputRef}
                        />
                      </div>
                    </div>

                    {/* Enhanced Submit Button */}
                    <div className="relative flex shrink-0">
                      <LoadingButton
                        className="inline-flex items-center justify-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white font-bold text-base rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 focus:outline-none focus:ring-4 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all duration-200"
                        type="submit"
                        disabled={!prompt.trim() || isPending}
                      >
                        {isPending ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <span>Generate App</span>
                            <ArrowRightIcon className="w-5 h-5" />
                          </>
                        )}
                      </LoadingButton>
                    </div>
                  </div>
                </div>

                {/* Enhanced Loading Overlay - CURSOR-KILLER UX */}
                {isPending && (
                  <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center rounded-3xl">
                    <div className="flex flex-col items-center justify-center gap-6 text-gray-700 max-w-md mx-auto">
                      {/* Advanced Loading Animation */}
                      <div className="relative">
                        <div className="w-20 h-20 border-4 border-blue-100 rounded-full animate-spin">
                          <div className="w-full h-full border-4 border-transparent border-t-blue-600 rounded-full animate-pulse"></div>
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 via-purple-600 to-pink-600 rounded-xl flex items-center justify-center shadow-lg animate-pulse">
                            <span className="text-white font-bold text-base">
                              {selectedModel?.provider === 'claude' ? '🧠' :
                               selectedModel?.provider === 'together' ? '🤝' :
                               selectedModel?.provider === 'openrouter' ? '🌐' :
                               selectedModel?.provider === 'groq' ? '⚡' :
                               'AI'}
                            </span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Progressive Loading Messages */}
                      <div className="text-center">
                        <div className="text-xl font-bold mb-2 bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                          {selectedModel?.provider === 'claude' && quality === "high"
                            ? `Claude is architecting your solution...`
                            : selectedModel?.provider === 'claude'
                            ? `Claude is crafting your application...`
                            : selectedModel?.provider === 'together' && selectedModel.value.includes('deepseek')
                            ? `DeepSeek is reasoning through your requirements...`
                            : selectedModel?.provider === 'together' && selectedModel.value.includes('qwen')
                            ? `Qwen Coder is generating optimized code...`
                            : selectedModel?.provider === 'openrouter'
                            ? `OpenRouter is selecting the optimal model...`
                            : selectedModel?.provider === 'groq'
                            ? `Groq is turbo-charging your build...`
                            : quality === "high"
                            ? `AI is creating your project plan...`
                            : screenshotUrl
                              ? "AI is analyzing your screenshot..."
                              : `AI is building your app...`}
                        </div>
                        
                        {/* Smart Model-Based Descriptions */}
                        <div className="text-sm text-gray-600 mb-4">
                          {selectedModel?.provider === 'claude' && quality === "high"
                            ? "Advanced reasoning and enterprise-grade architecture"
                            : selectedModel?.provider === 'claude'
                            ? "Superior code quality with security best practices"
                            : selectedModel?.value?.includes('deepseek')
                            ? "Deep reasoning for complex logic and algorithms"
                            : selectedModel?.value?.includes('qwen') && selectedModel?.value?.includes('coder')
                            ? "Specialized code generation with TypeScript excellence"
                            : selectedModel?.provider === 'groq'
                            ? "Ultra-fast generation with optimized performance"
                            : quality === "high" 
                            ? "This may take up to 15 seconds for optimal results" 
                            : "Fast generation in progress"}
                        </div>
                        
                        {/* Enhanced Progress Indicator */}
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-3 overflow-hidden">
                          <div className="bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 h-2 rounded-full animate-pulse" 
                               style={{
                                 width: quality === "high" ? "60%" : "80%",
                                 animation: "progress 8s ease-in-out infinite"
                               }}>
                          </div>
                        </div>
                        
                        {/* Real-time Status Updates */}
                        <div className="text-xs text-gray-500 space-y-1">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                            <span>Model: {selectedModel?.label}</span>
                          </div>
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                            <span>
                              Speed: {selectedModel?.speed || (quality === "high" ? "8-15s" : "3-8s")} • 
                              Cost: {selectedModel?.costPer1M || (quality === "high" ? "$0.50-$3.00" : "$0.10-$1.00")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Enhanced AI Model Information Panel */}
              {selectedModel && (
                <div className="info-panel mt-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                          isUsingRecommended 
                            ? 'bg-gradient-to-br from-green-500 to-blue-600' 
                            : 'bg-gradient-to-br from-blue-500 to-purple-600'
                        }`}>
                          <span className="text-white font-bold text-lg">
                            {selectedModel.provider?.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            {isUsingRecommended && (
                              <div className="info-badge">
                                <span>🎯</span>
                                <span>Smart Selected</span>
                              </div>
                            )}
                            <h4 className="font-bold text-gray-900 text-lg">{selectedModel.label}</h4>
                            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full font-medium">
                              {selectedModel.provider}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600">
                            {isUsingRecommended 
                              ? '✨ Automatically selected based on your prompt complexity and requirements' 
                              : 'Manually selected AI model'}
                          </p>
                          {selectedModel.description && (
                            <p className="text-xs text-gray-500 mt-1">{selectedModel.description}</p>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Configuration Summary */}
                    <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-200/50">
                      <div className="text-center">
                        <div className={`text-lg font-bold ${
                          quality === 'high' ? 'text-green-600' : 'text-orange-600'
                        }`}>
                          {quality === 'high' ? '🐎' : '⚡'}
                        </div>
                        <div className="text-xs font-medium text-gray-700">
                          {quality === 'high' ? 'High Quality' : 'Fast Mode'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {quality === 'high' ? 'Better results' : 'Quick iterations'}
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-600">
                          {smartRouting ? '🧠' : '🎯'}
                        </div>
                        <div className="text-xs font-medium text-gray-700">
                          {smartRouting ? 'Smart Routing' : 'Manual Select'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {smartRouting ? 'Auto-optimized' : 'User controlled'}
                        </div>
                      </div>
                      
                      <div className="text-center">
                        <div className="text-lg font-bold text-purple-600">
                          {screenshotUrl ? '📷' : '📝'}
                        </div>
                        <div className="text-xs font-medium text-gray-700">
                          {screenshotUrl ? 'Visual Input' : 'Text Only'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {screenshotUrl ? 'Image analysis' : 'Prompt based'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Enhanced Suggested Prompts */}
              <div className="mt-8">
                <div className="text-center mb-6">
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Popular Project Ideas</h4>
                  <p className="text-sm text-gray-600">Click any example to get started instantly</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {SUGGESTED_PROMPTS.map((v) => {
                    const isComplex = (v as any).complexity === 'complex';
                    const recommendedModelInfo = MODELS.find(m => m.value === (v as any).recommendedModel);
                    
                    return (
                      <button
                        key={v.title}
                        type="button"
                        onClick={() => {
                          setPrompt(v.description);
                          if (smartRouting && (v as any).recommendedModel) {
                            setModel((v as any).recommendedModel);
                            setRecommendedModel((v as any).recommendedModel);
                          }
                        }}
                        className={`group relative p-4 rounded-2xl text-left transition-all duration-300 hover:scale-105 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 ${
                          isComplex 
                            ? 'bg-gradient-to-br from-purple-100 to-blue-100 border-2 border-purple-200 hover:border-purple-300' 
                            : 'bg-white border-2 border-gray-200 hover:border-blue-300'
                        }`}
                        title={recommendedModelInfo ? `Recommended: ${recommendedModelInfo.label}` : undefined}
                      >
                        <div className="absolute top-2 right-2">
                          {isComplex && <span className="text-lg">✨</span>}
                          {recommendedModelInfo && <span className="text-xs ml-1">🎯</span>}
                        </div>
                        
                        <div>
                          <h5 className="font-semibold text-gray-900 mb-2 group-hover:text-blue-700 transition-colors">
                            {v.title}
                          </h5>
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                            {v.description.substring(0, 80)}...
                          </p>
                          {recommendedModelInfo && (
                            <div className="flex items-center gap-2">
                              <div className="w-4 h-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                <span className="text-white text-xs font-bold">{recommendedModelInfo.provider?.charAt(0).toUpperCase()}</span>
                              </div>
                              <span className="text-xs text-gray-500">
                                {recommendedModelInfo.provider} · {isComplex ? 'Complex' : 'Simple'}
                              </span>
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Templates Link */}
              <div className="mt-6 text-center">
                <Link
                  href="/templates"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-100 to-blue-100 px-4 py-2 text-sm font-medium text-purple-700 hover:from-purple-200 hover:to-blue-200 transition-all duration-200 border border-purple-200"
                >
                  <span>🎨</span>
                  Browse Templates & Components
                  <span>→</span>
                </Link>
              </div>
            </Fieldset>
          </form>
        </div>

        {/* CLI Installation Section */}
        <div id="cli-install-section" className="w-full px-4 py-16 bg-gradient-to-br from-green-50 to-blue-50 border-t border-gray-200">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              🚀 Install Recoder CLI for Advanced Development
            </h2>
            <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
              Get the full power of Recoder with our command-line interface. Includes AI orchestration, 
              smart routing across 15+ models, and professional development tools.
            </p>
            
            <div className="grid md:grid-cols-2 gap-8 mb-8">
              {/* NPM Installation */}
              <div className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-sm">
                <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-4 mx-auto">
                  <span className="text-2xl">📦</span>
                </div>
                <h3 className="text-xl font-semibold mb-4">Recoder CLI</h3>
                <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-green-600">npm install -g @recoder/cli</code>
                    <button 
                      onClick={() => navigator.clipboard?.writeText('npm install -g @recoder/cli')}
                      className="text-gray-500 hover:text-gray-700"
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                  </div>
                  <code className="text-blue-600 block">recoder --help</code>
                </div>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li>✅ AI-powered code generation</li>
                  <li>✅ Multi-model smart routing</li>
                  <li>✅ Project context learning</li>
                  <li>✅ Vibe code mode</li>
                </ul>
              </div>
              
              {/* CLI Router Installation */}
              <div className="bg-white rounded-2xl p-6 border-2 border-gray-200 shadow-sm">
                <div className="flex items-center justify-center w-12 h-12 bg-purple-100 rounded-full mb-4 mx-auto">
                  <span className="text-2xl">🔀</span>
                </div>
                <h3 className="text-xl font-semibold mb-4">CLI Router</h3>
                <div className="bg-gray-100 rounded-lg p-4 font-mono text-sm mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <code className="text-green-600">npm install -g @recoder/cli-router</code>
                    <button 
                      onClick={() => navigator.clipboard?.writeText('npm install -g @recoder/cli-router')}
                      className="text-gray-500 hover:text-gray-700"
                      title="Copy to clipboard"
                    >
                      📋
                    </button>
                  </div>
                  <code className="text-blue-600 block">recoder-router status</code>
                </div>
                <ul className="text-sm text-gray-600 space-y-2">
                  <li>⚡ Lightning-fast AI routing</li>
                  <li>💰 Cost optimization engine</li>
                  <li>🔄 Intelligent failover</li>
                  <li>📊 Usage analytics</li>
                </ul>
              </div>
            </div>
            
            {/* Feature Highlights */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              <div>
                <div className="text-3xl mb-2">🧠</div>
                <div className="font-semibold text-gray-900">15+ AI Models</div>
                <div className="text-sm text-gray-600">Claude, GPT, Gemini, Groq & more</div>
              </div>
              <div>
                <div className="text-3xl mb-2">⚡</div>
                <div className="font-semibold text-gray-900">Smart Routing</div>
                <div className="text-sm text-gray-600">Optimal model selection</div>
              </div>
              <div>
                <div className="text-3xl mb-2">💰</div>
                <div className="font-semibold text-gray-900">Cost Savings</div>
                <div className="text-sm text-gray-600">Up to 65% reduction</div>
              </div>
              <div>
                <div className="text-3xl mb-2">🔒</div>
                <div className="font-semibold text-gray-900">Enterprise Ready</div>
                <div className="text-sm text-gray-600">SOC 2 & GDPR compliant</div>
              </div>
            </div>
            
            <div className="mt-8">
              <Link 
                href="/docs/cli" 
                className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                📚 Read CLI Documentation
                <ArrowRightIcon className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>

        <footer className="w-full bg-gradient-to-r from-gray-50 to-white border-t border-gray-200 mt-20">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {/* Brand Column */}
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">R</span>
                  </div>
                  <span className="text-lg font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                    Recoder.xyz
                  </span>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed">
                  The AI-powered development platform that transforms ideas into production-ready applications.
                </p>
                <div className="flex items-center gap-3">
                  <Link href="https://github.com/recoder-xyz" className="text-gray-400 hover:text-gray-600 transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
                    </svg>
                  </Link>
                  <Link href="https://twitter.com/recoderxyz" className="text-gray-400 hover:text-gray-600 transition-colors">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                    </svg>
                  </Link>
                </div>
              </div>

              {/* Platform Links */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Platform</h4>
                <div className="space-y-3">
                  <a href="https://chat.recoder.xyz" target="_blank" rel="noopener noreferrer" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    💬 AI Chat Platform
                  </a>
                  <Link href="/" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    🛠️ Web Builder
                  </Link>
                  <Link href="/cli" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    ⚡ CLI Tool
                  </Link>
                  <Link href="/docs" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    📚 Documentation
                  </Link>
                </div>
              </div>

              {/* Features */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Features</h4>
                <div className="space-y-3">
                  <Link href="/agents" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    🤖 AI Agents
                  </Link>
                  <Link href="/templates" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    🎨 Templates
                  </Link>
                  <Link href="/game-development" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    🎮 Game Development
                  </Link>
                  <Link href="/blockchain" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    ⛓️ Blockchain Tools
                  </Link>
                </div>
              </div>

              {/* Company */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900">Company</h4>
                <div className="space-y-3">
                  <Link href="/pricing" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    💰 Pricing
                  </Link>
                  <Link href="/settings" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    ⚙️ Settings
                  </Link>
                  <Link href="/settings/privacy" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    🔐 Privacy
                  </Link>
                  <Link href="/settings/security" className="block text-gray-600 hover:text-blue-600 transition-colors text-sm">
                    🛡️ Security
                  </Link>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-200 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-sm text-gray-600">
                © 2024 Recoder.xyz. Built with AI-powered intelligence.
              </div>
              <div className="text-sm text-gray-500">
                Powered by Claude, Groq, Gemini & OpenRouter
              </div>
            </div>
          </div>
        </footer>
      </div>
      </div>
    </MobileOptimizations>
  );
}


export const runtime = "edge";
export const maxDuration = 45;
