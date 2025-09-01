"use client";

import { useState } from "react";
import {
  Search,
  Copy,
  Check,
  Code,
  Palette,
  Mouse,
  Layout,
  Navigation,
  FileText,
  BarChart3,
  ShoppingBag,
  User,
  Settings,
  Bell,
  Calendar,
  Mail,
  Phone,
  CreditCard,
  Shield,
  Zap,
  Play,
  Eye,
  Heart,
  X,
  AlertCircle,
  ChevronDown,
  Download,
  Upload,
  Filter,
  Star,
  Share2,
  Plus,
  Loader2,
  Menu,
  ChevronUp,
} from "lucide-react";

interface Component {
  id: string;
  name: string;
  description: string;
  category: string;
  framework: string[];
  complexity: "simple" | "medium" | "complex";
  tags: string[];
  preview: React.ReactNode;
  code: {
    react: string;
    vue?: string;
    angular?: string;
    svelte?: string;
  };
  dependencies?: string[];
  props?: Array<{
    name: string;
    type: string;
    default?: string;
    description: string;
  }>;
}

const CATEGORIES = [
  { id: "all", name: "All Components", icon: Layout },
  { id: "buttons", name: "Buttons", icon: Mouse },
  { id: "forms", name: "Forms", icon: FileText },
  { id: "navigation", name: "Navigation", icon: Navigation },
  { id: "layout", name: "Layout", icon: Layout },
  { id: "data", name: "Data Display", icon: BarChart3 },
  { id: "feedback", name: "Feedback", icon: Bell },
  { id: "overlay", name: "Overlay", icon: Eye },
  { id: "charts", name: "Charts", icon: BarChart3 },
  { id: "commerce", name: "E-commerce", icon: ShoppingBag },
];

const PRODUCTION_COMPONENTS: Component[] = [
  {
    id: "primary-button",
    name: "Primary Button",
    description: "Main action button with hover effects and loading state",
    category: "buttons",
    framework: ["react", "vue", "angular", "svelte"],
    complexity: "simple",
    tags: ["button", "primary", "action", "interactive"],
    dependencies: ["lucide-react"],
    preview: (
      <button className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2">
        <Play className="w-4 h-4" />
        Get Started
      </button>
    ),
    code: {
      react: `import React from 'react';
import { Loader2 } from 'lucide-react';

interface PrimaryButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
  className?: string;
}

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  children,
  onClick,
  disabled = false,
  loading = false,
  size = 'md',
  variant = 'primary',
  icon,
  className = '',
}) => {
  const baseClasses = 'font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2';
  
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-6 py-2 text-base',
    lg: 'px-8 py-3 text-lg',
  };
  
  const variantClasses = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500 disabled:bg-blue-300',
    secondary: 'bg-gray-600 hover:bg-gray-700 text-white focus:ring-gray-500 disabled:bg-gray-300',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500 disabled:bg-red-300',
  };

  return (
    <button
      className={\`\${baseClasses} \${sizeClasses[size]} \${variantClasses[variant]} \${className}\`}
      onClick={onClick}
      disabled={disabled || loading}
      type="button"
    >
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : icon ? (
        icon
      ) : null}
      {children}
    </button>
  );
};`,
    },
    props: [
      { name: "children", type: "React.ReactNode", description: "Button content" },
      { name: "onClick", type: "() => void", description: "Click handler" },
      { name: "disabled", type: "boolean", default: "false", description: "Disable button" },
      { name: "loading", type: "boolean", default: "false", description: "Show loading state" },
      { name: "size", type: "'sm' | 'md' | 'lg'", default: "'md'", description: "Button size" },
      { name: "variant", type: "'primary' | 'secondary' | 'danger'", default: "'primary'", description: "Button variant" },
      { name: "icon", type: "React.ReactNode", description: "Optional icon" },
    ],
  },
  {
    id: "modern-input",
    name: "Modern Input Field",
    description: "Advanced input with validation, icons, and floating labels",
    category: "forms",
    framework: ["react", "vue", "angular"],
    complexity: "medium",
    tags: ["input", "form", "validation", "floating-label"],
    dependencies: ["lucide-react"],
    preview: (
      <div className="w-full max-w-sm">
        <div className="relative">
          <input
            type="text"
            placeholder="Enter your email"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pl-10"
          />
          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>
      </div>
    ),
    code: {
      react: `import React, { useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';

interface ModernInputProps {
  label: string;
  type?: 'text' | 'email' | 'password' | 'tel' | 'url';
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  validation?: (value: string) => string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export const ModernInput: React.FC<ModernInputProps> = ({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  icon,
  validation,
  required = false,
  disabled = false,
  className = '',
}) => {
  const [touched, setTouched] = useState(false);
  const [focused, setFocused] = useState(false);
  
  const error = touched && validation ? validation(value) : null;
  const isValid = touched && !error && value.length > 0;
  
  const handleBlur = () => {
    setTouched(true);
    setFocused(false);
  };

  return (
    <div className={\`relative \${className}\`}>
      {/* Floating Label */}
      <label
        className={\`
          absolute left-3 transition-all duration-200 pointer-events-none
          \${focused || value ? 'text-xs top-2 text-blue-600' : 'text-sm top-1/2 transform -translate-y-1/2 text-gray-500'}
          \${icon ? 'left-10' : 'left-3'}
        \`}
      >
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {/* Input Container */}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
        
        <input
          type={type}
          placeholder={focused ? placeholder : ''}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          disabled={disabled}
          className={\`
            w-full px-4 py-3 border rounded-lg transition-all duration-200
            \${icon ? 'pl-10' : 'pl-4'}
            \${focused || value ? 'pt-6 pb-2' : ''}
            \${error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'}
            \${disabled ? 'bg-gray-50 cursor-not-allowed' : 'bg-white'}
            focus:outline-none focus:ring-2
          \`}
        />
        
        {/* Validation Icons */}
        {touched && (isValid || error) && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            {isValid ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
          </div>
        )}
      </div>
      
      {/* Error Message */}
      {touched && error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
};`,
    },
    props: [
      { name: "label", type: "string", description: "Input label" },
      { name: "type", type: "'text' | 'email' | 'password' | 'tel' | 'url'", default: "'text'", description: "Input type" },
      { name: "placeholder", type: "string", description: "Placeholder text" },
      { name: "value", type: "string", description: "Input value" },
      { name: "onChange", type: "(value: string) => void", description: "Change handler" },
      { name: "icon", type: "React.ReactNode", description: "Left icon" },
      { name: "validation", type: "(value: string) => string | null", description: "Validation function" },
      { name: "required", type: "boolean", default: "false", description: "Required field" },
    ],
  },
  {
    id: "modal-dialog",
    name: "Modal Dialog",
    description: "Accessible modal with backdrop, animations, and focus management",
    category: "overlay",
    framework: ["react", "vue"],
    complexity: "medium",
    tags: ["modal", "dialog", "overlay", "accessible"],
    dependencies: ["lucide-react"],
    preview: (
      <div className="relative">
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg">
          Open Modal
        </button>
        <div className="absolute top-12 left-0 w-80 bg-white border rounded-lg shadow-lg z-10">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Modal Title</h3>
          </div>
          <div className="p-4">
            <p className="text-gray-600">Modal content goes here...</p>
          </div>
          <div className="p-4 border-t flex justify-end gap-2">
            <button className="px-4 py-2 text-gray-600 border rounded">Cancel</button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded">Confirm</button>
          </div>
        </div>
      </div>
    ),
    code: {
      react: `import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
  closeOnBackdropClick?: boolean;
  className?: string;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnBackdropClick = true,
  className = '',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  useEffect(() => {
    if (isOpen) {
      // Store the currently focused element
      previousActiveElement.current = document.activeElement as HTMLElement;
      
      // Focus the modal
      modalRef.current?.focus();
      
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
      
      // Escape key handler
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }
      };
      
      document.addEventListener('keydown', handleEscape);
      
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
        
        // Restore focus to the previous element
        if (previousActiveElement.current) {
          previousActiveElement.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnBackdropClick) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? 'modal-title' : undefined}
    >
      <div
        ref={modalRef}
        className={\`
          bg-white rounded-lg shadow-xl w-full \${sizeClasses[size]} 
          transform transition-all duration-200 scale-100 opacity-100
          \${className}
        \`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            {title && (
              <h3 id="modal-title" className="text-lg font-semibold text-gray-900">
                {title}
              </h3>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg p-1"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};`,
    },
    props: [
      { name: "isOpen", type: "boolean", description: "Whether modal is open" },
      { name: "onClose", type: "() => void", description: "Close handler" },
      { name: "title", type: "string", description: "Modal title" },
      { name: "children", type: "React.ReactNode", description: "Modal content" },
      { name: "size", type: "'sm' | 'md' | 'lg' | 'xl'", default: "'md'", description: "Modal size" },
      { name: "showCloseButton", type: "boolean", default: "true", description: "Show close button" },
      { name: "closeOnBackdropClick", type: "boolean", default: "true", description: "Close on backdrop click" },
    ],
  },
];

interface ComponentLibraryProps {
  onComponentSelect?: (component: Component) => void;
  framework?: string;
}

export default function ComponentLibrary({ onComponentSelect, framework }: ComponentLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Filter components based on framework, category, and search
  const filteredComponents = PRODUCTION_COMPONENTS.filter(component => {
    const matchesFramework = !framework || component.framework.includes(framework.toLowerCase());
    const matchesCategory = selectedCategory === "all" || component.category === selectedCategory;
    const matchesSearch = !searchQuery || 
      component.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      component.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      component.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesFramework && matchesCategory && matchesSearch;
  });

  const copyCode = async (component: Component) => {
    const frameworkKey = (framework?.toLowerCase() || 'react') as keyof typeof component.code;
    const code = component.code[frameworkKey] || component.code.react;
    
    if (navigator.clipboard && code) {
      await navigator.clipboard.writeText(code);
      setCopiedId(component.id);
      if (onComponentSelect) {
        onComponentSelect(component);
      }
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const insertComponent = (component: Component) => {
    if (onComponentSelect) {
      onComponentSelect(component);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Component Library</h2>
        <p className="text-sm text-gray-600">
          Production-ready components {framework && `for ${framework}`}
        </p>
      </div>

      {/* Search and Filters */}
      <div className="p-4 border-b space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(category => {
            const Icon = category.icon;
            const isActive = selectedCategory === category.id;
            
            return (
              <button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                  isActive 
                    ? "bg-blue-100 text-blue-700" 
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-3 h-3" />
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Component Grid */}
      <div className="flex-1 overflow-auto p-4">
        {filteredComponents.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-2">
              <Code className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-gray-600">No components found</p>
            <p className="text-sm text-gray-500">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredComponents.map(component => (
              <div
                key={component.id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
              >
                {/* Preview */}
                <div className="p-4 bg-gray-50 border-b">
                  <div className="flex items-center justify-center min-h-[80px]">
                    {component.preview}
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-sm text-gray-900">{component.name}</h3>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      component.complexity === 'simple' ? 'bg-green-100 text-green-700' :
                      component.complexity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {component.complexity}
                    </div>
                  </div>
                  
                  <p className="text-gray-600 text-xs mb-3">{component.description}</p>

                  {/* Framework badges */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {component.framework.map(fw => (
                      <span
                        key={fw}
                        className={`text-xs px-2 py-1 rounded ${
                          fw === framework?.toLowerCase() 
                            ? 'bg-blue-100 text-blue-700' 
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {fw}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedComponent(component);
                        setShowCode(true);
                      }}
                      className="flex-1 flex items-center justify-center gap-1 px-2 py-1 border border-gray-300 rounded text-xs font-medium hover:bg-gray-50"
                    >
                      <Eye className="w-3 h-3" />
                      View
                    </button>
                    <button
                      onClick={() => copyCode(component)}
                      className="flex items-center justify-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700"
                    >
                      {copiedId === component.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedId === component.id ? "Copied!" : "Copy"}
                    </button>
                    <button
                      onClick={() => insertComponent(component)}
                      className="flex items-center justify-center gap-1 px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
                    >
                      <Plus className="w-3 h-3" />
                      Insert
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code Modal */}
      {showCode && selectedComponent && (
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50">
          <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">{selectedComponent.name}</h3>
                  <p className="text-gray-600">{selectedComponent.description}</p>
                </div>
                <button
                  onClick={() => setShowCode(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Content */}
              <div className="overflow-auto max-h-[70vh]">
                <div className="p-6">
                  {/* Props Table */}
                  {selectedComponent.props && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-gray-900 mb-3">Props</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left py-2 font-medium text-gray-900">Name</th>
                              <th className="text-left py-2 font-medium text-gray-900">Type</th>
                              <th className="text-left py-2 font-medium text-gray-900">Default</th>
                              <th className="text-left py-2 font-medium text-gray-900">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedComponent.props.map(prop => (
                              <tr key={prop.name} className="border-b border-gray-100">
                                <td className="py-2 font-mono text-blue-600">{prop.name}</td>
                                <td className="py-2 font-mono text-gray-600">{prop.type}</td>
                                <td className="py-2 font-mono text-gray-500">{prop.default || '-'}</td>
                                <td className="py-2 text-gray-700">{prop.description}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Dependencies */}
                  {selectedComponent.dependencies && selectedComponent.dependencies.length > 0 && (
                    <div className="mb-6">
                      <h4 className="font-semibold text-gray-900 mb-3">Dependencies</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedComponent.dependencies.map(dep => (
                          <code key={dep} className="bg-gray-100 px-2 py-1 rounded text-sm">
                            {dep}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Code */}
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-900">Source Code</h4>
                    <button
                      onClick={() => copyCode(selectedComponent)}
                      className="flex items-center gap-2 px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded text-sm"
                    >
                      {copiedId === selectedComponent.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copiedId === selectedComponent.id ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                  
                  <pre className="bg-gray-50 rounded-lg p-4 overflow-x-auto text-sm">
                    <code>{
                      (() => {
                        const frameworkKey = (framework?.toLowerCase() || 'react') as keyof typeof selectedComponent.code;
                        return selectedComponent.code[frameworkKey] || selectedComponent.code.react;
                      })()
                    }</code>
                  </pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}