import Image from "next/image";
import Link from "next/link";

import GithubIcon from "@/components/icons/github-icon";
import { getBrandConfig } from "@/lib/recoder-config";

const brandConfig = getBrandConfig();

export default function Header() {
  return (
    <header className="relative mx-auto flex w-full shrink-0 items-center justify-center py-6">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/recoder-logo.svg"
          alt={brandConfig.fullName}
          width={200}
          height={48}
          className="h-9 w-auto object-contain"
          priority
        />
      </Link>

      <div className="absolute right-3 flex items-center gap-3">
        {/* Multi-AI Indicator */}
        <div className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 px-3 py-1.5 text-xs font-medium text-blue-700 ring-1 ring-blue-200/50 lg:flex">
          <div className="flex -space-x-1">
            <div className="h-3 w-3 rounded-full bg-blue-500 ring-1 ring-white" title="Claude" />
            <div className="h-3 w-3 rounded-full bg-purple-500 ring-1 ring-white" title="Groq" />
            <div className="h-3 w-3 rounded-full bg-green-500 ring-1 ring-white" title="Gemini" />
            <div className="h-3 w-3 rounded-full bg-orange-500 ring-1 ring-white" title="Ollama" />
          </div>
          <span>Multi-AI</span>
        </div>

        {/* GitHub Link */}
        <a
          href={brandConfig.urls.github()}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto hidden items-center gap-3 rounded-full bg-white/95 px-5 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-gray-100 transition-all hover:bg-white hover:shadow-md hover:ring-gray-200 sm:flex"
        >
          <GithubIcon className="h-[18px] w-[18px]" />
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-900">Production-Ready</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-emerald-500"
            >
              <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">Code</span>
          </div>
        </a>

        {/* CLI & Extension Links */}
        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href={brandConfig.urls.github()}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            CLI
          </Link>
          <Link
            href="https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-200"
          >
            VS Code
          </Link>
        </div>
      </div>
    </header>
  );
}
