"use client";

// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';
/* eslint-disable @next/next/no-img-element */

import Fieldset from "@/components/fieldset";
import ArrowRightIcon from "@/components/icons/arrow-right";
import LightningBoltIcon from "@/components/icons/lightning-bolt";
import LoadingButton from "@/components/loading-button";
import Spinner from "@/components/spinner";
import bgImg from "@/public/halo.png";
import * as Select from "@radix-ui/react-select";
import assert from "assert";
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
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            <div className="inline-flex shrink-0 items-center rounded-full border-[0.5px] bg-white px-7 py-2 text-xs text-gray-800 shadow-[0px_1px_1px_0px_rgba(0,0,0,0.25)] md:text-base">
              <span className="text-center">
                Powered by <span className="font-semibold">Multi-AI Intelligence</span>
              </span>
            </div>
            <div className="inline-flex shrink-0 items-center rounded-full border-[0.5px] bg-gradient-to-r from-blue-50 to-purple-50 px-4 py-2 text-xs text-gray-700 shadow-[0px_1px_1px_0px_rgba(0,0,0,0.15)]">
              <span className="flex items-center gap-2">
                <span className="flex items-center gap-1">
                  🤖 Claude • ⚡ Groq • 🔥 Together • 🌍 OpenRouter
                </span>
              </span>
            </div>
          </div>

          <h1 className="mt-4 text-balance text-center text-4xl leading-none text-gray-700 md:text-[64px] lg:mt-8">
            Turn your <span className="text-blue-500">idea</span>
            <br className="hidden md:block" /> into{" "}
            <span className="bg-gradient-to-r from-blue-500 to-purple-500 bg-clip-text text-transparent">
              real apps
            </span>
          </h1>
          <p className="mt-4 text-center text-gray-600 max-w-2xl mx-auto">
            AI that generates <strong>production-ready code</strong> with real functionality. 
            Smart model routing automatically selects the best AI for your task.
          </p>
          
          {/* Platform Selection */}
          <div className="mt-8 flex justify-center">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full">
              <Link 
                href="/chats" 
                className="group flex flex-col items-center p-6 bg-white rounded-2xl border-2 border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all duration-200"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">💬</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Recoder Chat</h3>
                <p className="text-gray-600 text-center text-sm">Interactive AI conversation for complex development tasks and learning</p>
                <div className="mt-4 flex items-center text-blue-600 group-hover:translate-x-1 transition-transform">
                  <span className="text-sm font-medium">Start Chatting</span>
                  <ArrowRightIcon className="ml-1 w-4 h-4" />
                </div>
              </Link>
              
              <div className="group flex flex-col items-center p-6 bg-gradient-to-br from-blue-50 to-purple-50 rounded-2xl border-2 border-blue-200 shadow-md">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-full flex items-center justify-center mb-4">
                  <span className="text-2xl">🚀</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Recoder Web</h3>
                <p className="text-gray-600 text-center text-sm">Generate complete applications from prompts (you're here!)</p>
                <div className="mt-4 flex items-center text-blue-600">
                  <span className="text-sm font-medium">Current Platform</span>
                  <span className="ml-2 text-xs bg-blue-100 px-2 py-1 rounded-full">Active</span>
                </div>
              </div>
              
              <div className="group flex flex-col items-center p-6 bg-white rounded-2xl border-2 border-gray-200 hover:border-green-300 hover:shadow-lg transition-all duration-200 cursor-pointer" onClick={() => {
                document.getElementById('cli-install-section')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <span className="text-2xl">⚡</span>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Recoder CLI</h3>
                <p className="text-gray-600 text-center text-sm">Professional command-line tool with advanced AI orchestration</p>
                <div className="mt-4 flex items-center text-green-600 group-hover:translate-x-1 transition-transform">
                  <span className="text-sm font-medium">Install CLI</span>
                  <ArrowRightIcon className="ml-1 w-4 h-4" />
                </div>
              </div>
            </div>
          </div>

          <form
            className="relative w-full max-w-2xl pt-6 lg:pt-12"
            action={async (formData) => {
              startTransition(async () => {
                const { prompt, model, quality } = Object.fromEntries(formData);

                assert.ok(typeof prompt === "string");
                assert.ok(typeof model === "string");
                assert.ok(quality === "high" || quality === "low");

                const { chatId, lastMessageId } = await createChat(
                  prompt,
                  model,
                  quality,
                  screenshotUrl,
                );

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
              });
            }}
          >
            <Fieldset>
              <div className="relative flex w-full max-w-2xl rounded-xl border-4 border-gray-300 bg-white pb-10">
                <div className="w-full">
                  {screenshotLoading && (
                    <div className="relative mx-3 mt-3">
                      <div className="rounded-xl">
                        <div className="group mb-2 flex h-16 w-[68px] animate-pulse items-center justify-center rounded bg-gray-200">
                          <Spinner />
                        </div>
                      </div>
                    </div>
                  )}
                  {screenshotUrl && (
                    <div
                      className={`${isPending ? "invisible" : ""} relative mx-3 mt-3`}
                    >
                      <div className="rounded-xl">
                        <img
                          alt="screenshot"
                          src={screenshotUrl}
                          className="group relative mb-2 h-16 w-[68px] rounded"
                        />
                      </div>
                      <button
                        type="button"
                        id="x-circle-icon"
                        className="absolute -right-3 -top-4 left-14 z-10 size-5 rounded-full bg-white text-gray-900 hover:text-gray-500"
                        onClick={() => {
                          setScreenshotUrl(undefined);
                          if (fileInputRef.current) {
                            fileInputRef.current.value = "";
                          }
                        }}
                      >
                        <XCircleIcon />
                      </button>
                    </div>
                  )}
                  <div className="relative">
                    <div className="p-3">
                      <p className="invisible w-full whitespace-pre-wrap">
                        {textareaResizePrompt}
                      </p>
                    </div>
                    <textarea
                      placeholder="Build me a budgeting app..."
                      required
                      name="prompt"
                      rows={1}
                      className="peer absolute inset-0 w-full resize-none bg-transparent p-3 placeholder-gray-500 focus-visible:outline-none disabled:opacity-50"
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
                <div className="absolute bottom-2 left-2 right-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Select.Root
                      name="model"
                      value={model}
                      onValueChange={setModel}
                    >
                      <Select.Trigger className={`inline-flex items-center gap-1 rounded-md p-1 text-sm hover:bg-gray-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300 ${
                        isUsingRecommended ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-700'
                      }`}>
                        <Select.Value aria-label={model}>
                          <span className="flex items-center gap-1">
                            {isUsingRecommended && <span className="text-xs">🎯</span>}
                            {selectedModel?.label}
                            {selectedModel?.provider && (
                              <span className="text-xs text-gray-500">({selectedModel.provider})</span>
                            )}
                          </span>
                        </Select.Value>
                        <Select.Icon>
                          <ChevronDownIcon className="size-3" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="overflow-hidden rounded-md bg-white shadow ring-1 ring-black/5 max-h-96 overflow-y-auto">
                          <Select.Viewport className="space-y-1 p-2">
                            {/* Smart Routing Toggle */}
                            <div className="px-2 py-1 border-b border-gray-200 mb-2">
                              <label className="flex items-center gap-2 text-xs text-gray-600">
                                <input
                                  type="checkbox"
                                  checked={smartRouting}
                                  onChange={(e) => {
                                    setSmartRouting(e.target.checked);
                                    if (e.target.checked && prompt.length > 10) {
                                      getSmartRecommendation(prompt);
                                    }
                                  }}
                                  className="rounded"
                                />
                                🧠 Smart AI Selection
                              </label>
                            </div>
                            
                            {/* Group models by provider */}
                            {Object.entries(AI_PROVIDERS).map(([providerId, provider]) => {
                              const providerModels = MODELS.filter(m => m.provider === providerId);
                              if (providerModels.length === 0 || !provider.available) return null;
                              
                              return (
                                <div key={providerId}>
                                  <div className="px-2 py-1 text-xs font-semibold text-gray-700 bg-gray-50 rounded">
                                    {provider.name} {!provider.available && '(Unavailable)'}
                                  </div>
                                  {providerModels.map((m) => (
                                    <Select.Item
                                      key={m.value}
                                      value={m.value}
                                      className="flex cursor-pointer items-center gap-1 rounded-md p-1 text-sm data-[highlighted]:bg-gray-100 data-[highlighted]:outline-none ml-2"
                                    >
                                      <Select.ItemText className="inline-flex items-center gap-2 text-gray-500 flex-1">
                                        <div className="flex flex-col">
                                          <span className="flex items-center gap-1">
                                            {m.value === recommendedModel && smartRouting && <span className="text-xs">🎯</span>}
                                            {m.label}
                                          </span>
                                          {m.description && (
                                            <span className="text-xs text-gray-400">{m.description}</span>
                                          )}
                                        </div>
                                      </Select.ItemText>
                                      <Select.ItemIndicator>
                                        <CheckIcon className="size-3 text-blue-600" />
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

                    <div className="h-4 w-px bg-gray-200 max-sm:hidden" />

                    <Select.Root
                      name="quality"
                      value={quality}
                      onValueChange={setQuality}
                    >
                      <Select.Trigger className="inline-flex items-center gap-1 rounded p-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-300">
                        <Select.Value aria-label={quality}>
                          <span className="max-sm:hidden">
                            {quality === "low"
                              ? "Low quality [faster]"
                              : "High quality [slower]"}
                          </span>
                          <span className="sm:hidden">
                            <LightningBoltIcon className="size-3" />
                          </span>
                        </Select.Value>
                        <Select.Icon>
                          <ChevronDownIcon className="size-3" />
                        </Select.Icon>
                      </Select.Trigger>
                      <Select.Portal>
                        <Select.Content className="overflow-hidden rounded-md bg-white shadow ring-1 ring-black/5">
                          <Select.Viewport className="space-y-1 p-2">
                            {[
                              { value: "low", label: "Low quality [faster]" },
                              {
                                value: "high",
                                label: "High quality [slower]",
                              },
                            ].map((q) => (
                              <Select.Item
                                key={q.value}
                                value={q.value}
                                className="flex cursor-pointer items-center gap-1 rounded-md p-1 text-sm data-[highlighted]:bg-gray-100 data-[highlighted]:outline-none"
                              >
                                <Select.ItemText className="inline-flex items-center gap-2 text-gray-500">
                                  {q.label}
                                </Select.ItemText>
                                <Select.ItemIndicator>
                                  <CheckIcon className="size-3 text-blue-600" />
                                </Select.ItemIndicator>
                              </Select.Item>
                            ))}
                          </Select.Viewport>
                          <Select.ScrollDownButton />
                          <Select.Arrow />
                        </Select.Content>
                      </Select.Portal>
                    </Select.Root>
                    <div className="h-4 w-px bg-gray-200 max-sm:hidden" />
                    <div>
                      <label
                        htmlFor="screenshot"
                        className="flex cursor-pointer gap-2 text-sm text-gray-400 hover:underline"
                      >
                        <div className="flex size-6 items-center justify-center rounded bg-black hover:bg-gray-700">
                          <UploadIcon className="size-4" />
                        </div>
                        <div className="flex items-center justify-center transition hover:text-gray-700">
                          Attach
                        </div>
                      </label>
                      <input
                        // name="screenshot"
                        id="screenshot"
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleScreenshotUpload}
                        className="hidden"
                        ref={fileInputRef}
                      />
                    </div>
                  </div>

                  <div className="relative flex shrink-0 has-[:disabled]:opacity-50">
                    <div className="pointer-events-none absolute inset-0 -bottom-[1px] rounded bg-blue-500" />

                    <LoadingButton
                      className="relative inline-flex size-6 items-center justify-center rounded bg-blue-500 font-medium text-white shadow-lg outline-blue-300 hover:bg-blue-500/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      type="submit"
                    >
                      <ArrowRightIcon />
                    </LoadingButton>
                  </div>
                </div>

                {isPending && (
                  <LoadingMessage
                    isHighQuality={quality === "high"}
                    screenshotUrl={screenshotUrl}
                  />
                )}
              </div>
              <div className="mt-4 flex w-full flex-wrap justify-center gap-3">
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
                      className={`rounded px-2.5 py-1.5 text-xs hover:bg-gray-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300 ${
                        isComplex ? 'bg-gradient-to-r from-purple-200 to-blue-200 border border-purple-300' : 'bg-gray-200'
                      }`}
                      title={recommendedModelInfo ? `Recommended: ${recommendedModelInfo.label}` : undefined}
                    >
                      <span className="flex items-center gap-1">
                        {isComplex && <span className="text-xs">✨</span>}
                        {v.title}
                        {recommendedModelInfo && (
                          <span className="text-xs text-gray-500">({recommendedModelInfo.provider})</span>
                        )}
                      </span>
                    </button>
                  );
                })}
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

        <footer className="flex w-full flex-col items-center justify-between space-y-3 px-5 pb-3 pt-5 text-center sm:flex-row sm:pt-2">
          <div>
            <div className="font-medium">
              Built with{" "}
              <a
                href="https://togetherai.link/?utm_source=llamacoder&utm_medium=referral&utm_campaign=example-app"
                className="font-semibold text-blue-600 underline-offset-4 transition hover:text-gray-700 hover:underline"
              >
                Llama
              </a>{" "}
              and{" "}
              <a
                href="https://togetherai.link/?utm_source=llamacoder&utm_medium=referral&utm_campaign=example-app"
                className="font-semibold text-blue-600 underline-offset-4 transition hover:text-gray-700 hover:underline"
              >
                Together AI
              </a>
              .
            </div>
          </div>
          <div className="flex space-x-4 pb-4 sm:pb-0">
            <Link
              href="https://twitter.com/nutlope"
              className="group"
              aria-label=""
            >
              <svg
                aria-hidden="true"
                className="h-6 w-6 fill-gray-500 group-hover:fill-gray-700"
              >
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0 0 22 5.92a8.19 8.19 0 0 1-2.357.646 4.118 4.118 0 0 0 1.804-2.27 8.224 8.224 0 0 1-2.605.996 4.107 4.107 0 0 0-6.993 3.743 11.65 11.65 0 0 1-8.457-4.287 4.106 4.106 0 0 0 1.27 5.477A4.073 4.073 0 0 1 2.8 9.713v.052a4.105 4.105 0 0 0 3.292 4.022 4.093 4.093 0 0 1-1.853.07 4.108 4.108 0 0 0 3.834 2.85A8.233 8.233 0 0 1 2 18.407a11.615 11.615 0 0 0 6.29 1.84" />
              </svg>
            </Link>
            <Link
              href="https://github.com/Nutlope/llamacoder"
              className="group"
              aria-label=""
            >
              <svg
                aria-hidden="true"
                className="h-6 w-6 fill-slate-500 group-hover:fill-slate-700"
              >
                <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
              </svg>
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}

function LoadingMessage({
  isHighQuality,
  screenshotUrl,
}: {
  isHighQuality: boolean;
  screenshotUrl: string | undefined;
}) {
  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white px-1 py-3 md:px-3">
      <div className="flex flex-col items-center justify-center gap-2 text-gray-500">
        <span className="animate-pulse text-balance text-center text-sm md:text-base">
          {isHighQuality
            ? `Coming up with project plan, may take 15 seconds...`
            : screenshotUrl
              ? "Analyzing your screenshot..."
              : `Creating your app...`}
        </span>

        <Spinner />
      </div>
    </div>
  );
}

export const runtime = "edge";
export const maxDuration = 45;
