"use client";

import { useState } from "react";
import { Template } from "./template-gallery";
import {
  X,
  Star,
  Download,
  Copy,
  Eye,
  Code,
  Play,
  Share2,
  Heart,
  ExternalLink,
  Check,
  Calendar,
  User,
  Tag,
  Zap,
  GitBranch,
} from "lucide-react";
import MonacoEditor from "./monaco-editor";

interface TemplatePreviewModalProps {
  template: Template;
  isOpen: boolean;
  onClose: () => void;
  onUseTemplate: (template: Template) => void;
}

export default function TemplatePreviewModal({
  template,
  isOpen,
  onClose,
  onUseTemplate,
}: TemplatePreviewModalProps) {
  const [activeTab, setActiveTab] = useState<"preview" | "code" | "details">("preview");
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);

  const copyCode = async () => {
    if (navigator.clipboard && template.code) {
      await navigator.clipboard.writeText(template.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareTemplate = async () => {
    if (navigator.share) {
      await navigator.share({
        title: template.name,
        text: template.description,
        url: window.location.href,
      });
    } else {
      // Fallback to clipboard
      const shareText = `Check out this amazing template: ${template.name} - ${template.description}`;
      await navigator.clipboard?.writeText(shareText);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative flex h-full">
        <div className="w-full max-w-7xl mx-auto bg-white flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{template.name}</h2>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {template.author}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {template.stars}
                  </span>
                  <span className="flex items-center gap-1">
                    <Download className="w-3 h-3" />
                    {template.downloads}
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {new Date(template.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLiked(!liked)}
                className={`p-2 rounded-lg border transition-colors ${
                  liked 
                    ? "bg-red-50 border-red-200 text-red-600" 
                    : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Heart className={`w-4 h-4 ${liked ? 'fill-current' : ''}`} />
              </button>
              
              <button
                onClick={shareTemplate}
                className="p-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <Share2 className="w-4 h-4" />
              </button>
              
              <button
                onClick={copyCode}
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy Code"}
              </button>
              
              <button
                onClick={() => onUseTemplate(template)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Play className="w-4 h-4" />
                Use Template
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab("preview")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "preview"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Eye className="w-4 h-4 inline mr-2" />
              Preview
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "code"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Code className="w-4 h-4 inline mr-2" />
              Source Code
            </button>
            <button
              onClick={() => setActiveTab("details")}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "details"
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Tag className="w-4 h-4 inline mr-2" />
              Details
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "preview" && (
              <div className="h-full p-6">
                <div className="h-full bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center">
                  <div className="text-center">
                    <Eye className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-medium text-gray-900 mb-2">Live Preview</h3>
                    <p className="text-gray-600 mb-4">
                      Interactive preview of {template.name}
                    </p>
                    <div className="text-sm text-gray-500 space-y-1">
                      <p>Framework: {template.framework}</p>
                      <p>Complexity: {template.complexity}</p>
                      <p>Use Case: {template.useCase}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "code" && (
              <div className="h-full">
                <MonacoEditor
                  value={template.code}
                  onChange={() => {}} // Read-only
                  language="typescript"
                  fileName={`${template.id}.tsx`}
                  readOnly={true}
                  height="100%"
                  showToolbar={false}
                />
              </div>
            )}

            {activeTab === "details" && (
              <div className="h-full overflow-auto p-6">
                <div className="max-w-4xl">
                  {/* Description */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Description</h3>
                    <p className="text-gray-700 leading-relaxed">{template.description}</p>
                  </div>

                  {/* Features */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Features</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {template.features.map((feature, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Zap className="w-4 h-4 text-green-500" />
                          <span className="text-gray-700">{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Tags</h3>
                    <div className="flex flex-wrap gap-2">
                      {template.tags.map(tag => (
                        <span
                          key={tag}
                          className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Dependencies */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Dependencies</h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {template.dependencies.map(dep => (
                          <div key={dep} className="flex items-center gap-2">
                            <GitBranch className="w-4 h-4 text-gray-500" />
                            <span className="text-gray-700 font-mono text-sm">{dep}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Use Case */}
                  <div className="mb-8">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Use Cases</h3>
                    <p className="text-gray-700 bg-gray-50 rounded-lg p-4">{template.useCase}</p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                      <Star className="w-6 h-6 text-yellow-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900">{template.stars}</div>
                      <div className="text-sm text-gray-500">Stars</div>
                    </div>
                    
                    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                      <Download className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900">{template.downloads}</div>
                      <div className="text-sm text-gray-500">Downloads</div>
                    </div>
                    
                    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                      <Code className="w-6 h-6 text-green-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900">{template.complexity}</div>
                      <div className="text-sm text-gray-500">Level</div>
                    </div>
                    
                    <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
                      <Tag className="w-6 h-6 text-purple-500 mx-auto mb-2" />
                      <div className="text-2xl font-bold text-gray-900">{template.category}</div>
                      <div className="text-sm text-gray-500">Category</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}