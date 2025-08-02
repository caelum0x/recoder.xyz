"use client";

import { useState } from "react";
import TemplateGallery, { Template } from "@/components/template-gallery";
import TemplatePreviewModal from "@/components/template-preview-modal";
import ComponentLibrary from "@/components/component-library";
import { Palette, Code2, Sparkles, Rocket, ArrowRight } from "lucide-react";

export default function TemplatesPage() {
  const [activeSection, setActiveSection] = useState<"overview" | "templates" | "components">("overview");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleTemplateSelect = (template: Template) => {
    setSelectedTemplate(template);
    setShowPreview(true);
  };

  const handleTemplateUse = (template: Template) => {
    // Create a new chat with the template
    window.location.href = `/?template=${template.id}`;
  };

  if (activeSection === "templates") {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-8">
                <button
                  onClick={() => setActiveSection("overview")}
                  className="text-lg font-semibold text-gray-900"
                >
                  ← Back
                </button>
                <h1 className="text-xl font-semibold text-gray-900">Templates</h1>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveSection("components")}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Components
                </button>
              </div>
            </div>
          </div>
        </nav>

        <TemplateGallery
          onTemplateSelect={handleTemplateSelect}
          onTemplateUse={handleTemplateUse}
        />

        {selectedTemplate && (
          <TemplatePreviewModal
            template={selectedTemplate}
            isOpen={showPreview}
            onClose={() => setShowPreview(false)}
            onUseTemplate={handleTemplateUse}
          />
        )}
      </div>
    );
  }

  if (activeSection === "components") {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Navigation */}
        <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-8">
                <button
                  onClick={() => setActiveSection("overview")}
                  className="text-lg font-semibold text-gray-900"
                >
                  ← Back
                </button>
                <h1 className="text-xl font-semibold text-gray-900">Components</h1>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setActiveSection("templates")}
                  className="text-gray-600 hover:text-gray-900"
                >
                  Templates
                </button>
              </div>
            </div>
          </div>
        </nav>

        <ComponentLibrary />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 py-20">
          <div className="text-center">
            <div className="flex justify-center mb-6">
              <div className="flex items-center gap-3 bg-white rounded-full px-6 py-3 shadow-lg border border-gray-200">
                <Sparkles className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-medium text-gray-700">Templates & Components</span>
              </div>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Build Faster with{" "}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Ready-Made Code
              </span>
            </h1>

            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Skip the boilerplate and jumpstart your development with our collection of 
              production-ready templates and components. Copy, customize, and ship faster.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setActiveSection("templates")}
                className="inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-medium text-lg shadow-lg"
              >
                <Rocket className="w-5 h-5" />
                Browse Templates
                <ArrowRight className="w-4 h-4" />
              </button>
              
              <button
                onClick={() => setActiveSection("components")}
                className="inline-flex items-center gap-2 px-8 py-4 bg-white text-gray-900 border-2 border-gray-200 rounded-xl hover:border-gray-300 transition-colors font-medium text-lg shadow-lg"
              >
                <Code2 className="w-5 h-5" />
                View Components
              </button>
            </div>
          </div>
        </div>

        {/* Background decoration */}
        <div className="absolute top-20 left-10 w-20 h-20 bg-blue-200 rounded-full opacity-50 blur-xl" />
        <div className="absolute top-40 right-20 w-32 h-32 bg-purple-200 rounded-full opacity-50 blur-xl" />
        <div className="absolute bottom-20 left-1/4 w-24 h-24 bg-pink-200 rounded-full opacity-50 blur-xl" />
      </div>

      {/* Features Section */}
      <div className="max-w-7xl mx-auto px-4 py-20">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          {/* Templates */}
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Palette className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Complete Templates</h2>
            </div>
            
            <p className="text-lg text-gray-600">
              Full-featured application templates ready for production. From dashboards 
              to e-commerce stores, get everything you need to start building immediately.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Production-ready code with best practices</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Multiple frameworks and technologies</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Real functionality, not mock implementations</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span>Comprehensive documentation and setup guides</span>
              </div>
            </div>

            <button
              onClick={() => setActiveSection("templates")}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Explore Templates
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Templates Preview */}
          <div className="relative">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-purple-600 p-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-white bg-opacity-30 rounded-full" />
                  <div className="w-3 h-3 bg-white bg-opacity-30 rounded-full" />
                  <div className="w-3 h-3 bg-white bg-opacity-30 rounded-full" />
                </div>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                  <div className="h-3 bg-gray-100 rounded w-5/6" />
                  <div className="grid grid-cols-2 gap-4 mt-6">
                    <div className="h-20 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg" />
                    <div className="h-20 bg-gradient-to-br from-purple-100 to-purple-200 rounded-lg" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Components */}
        <div className="grid md:grid-cols-2 gap-16 items-center mt-32">
          {/* Components Preview */}
          <div className="relative order-2 md:order-1">
            <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8">
              <div className="space-y-6">
                {/* Sample Button Component */}
                <div className="flex gap-3">
                  <button className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-sm font-medium">
                    Primary
                  </button>
                  <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium">
                    Secondary
                  </button>
                </div>

                {/* Sample Input Component */}
                <div className="relative">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* Sample Card Component */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-gradient-to-r from-green-400 to-blue-500 rounded-full" />
                    <div className="h-4 bg-gray-200 rounded w-24" />
                  </div>
                  <div className="h-3 bg-gray-100 rounded w-full mb-1" />
                  <div className="h-3 bg-gray-100 rounded w-2/3" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6 order-1 md:order-2">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
                <Code2 className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-gray-900">Reusable Components</h2>
            </div>
            
            <p className="text-lg text-gray-600">
              Individual components you can copy and paste into your projects. 
              Each component comes with props documentation and usage examples.
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Copy-paste ready React components</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>TypeScript support with full type definitions</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Accessible and responsive by default</span>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span>Customizable styling with Tailwind CSS</span>
              </div>
            </div>

            <button
              onClick={() => setActiveSection("components")}
              className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
            >
              Browse Components
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 py-20">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Build Something Amazing?
          </h2>
          <p className="text-xl text-blue-100 mb-8">
            Join thousands of developers who are shipping faster with our templates and components.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setActiveSection("templates")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-white text-blue-600 rounded-xl hover:bg-gray-50 transition-colors font-medium text-lg"
            >
              Start with Templates
            </button>
            <button
              onClick={() => setActiveSection("components")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-transparent text-white border-2 border-white rounded-xl hover:bg-white hover:text-blue-600 transition-colors font-medium text-lg"
            >
              Browse Components
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}