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
} from "lucide-react";

interface Component {
  id: string;
  name: string;
  description: string;
  category: string;
  complexity: "simple" | "medium" | "complex";
  tags: string[];
  preview: React.ReactNode;
  code: string;
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
  { id: "ecommerce", name: "E-commerce", icon: ShoppingBag },
  { id: "auth", name: "Authentication", icon: Shield },
];

const SAMPLE_COMPONENTS: Component[] = [
  {
    id: "gradient-button",
    name: "Gradient Button",
    description: "Modern gradient button with hover effects and loading states",
    category: "buttons",
    complexity: "simple",
    tags: ["button", "gradient", "interactive", "modern"],
    preview: (
      <div className="flex gap-3">
        <button className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-200 font-medium">
          Primary
        </button>
        <button className="px-6 py-2 bg-gradient-to-r from-green-500 to-teal-600 text-white rounded-lg hover:from-green-600 hover:to-teal-700 transition-all duration-200 font-medium">
          Success
        </button>
      </div>
    ),
    code: `import React from 'react';

interface GradientButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const variants = {
  primary: 'from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700',
  success: 'from-green-500 to-teal-600 hover:from-green-600 hover:to-teal-700',
  warning: 'from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700',
  danger: 'from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-6 py-2',
  lg: 'px-8 py-3 text-lg',
};

export default function GradientButton({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  onClick,
}: GradientButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={\`
        bg-gradient-to-r \${variants[variant]}
        text-white rounded-lg font-medium
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        \${sizes[size]}
        \${loading ? 'cursor-wait' : 'hover:shadow-lg hover:scale-105'}
      \`}
    >
      {loading ? (
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          Loading...
        </div>
      ) : (
        children
      )}
    </button>
  );
}`,
    props: [
      { name: "children", type: "React.ReactNode", description: "Button content" },
      { name: "variant", type: "'primary' | 'success' | 'warning' | 'danger'", default: "'primary'", description: "Button color variant" },
      { name: "size", type: "'sm' | 'md' | 'lg'", default: "'md'", description: "Button size" },
      { name: "loading", type: "boolean", default: "false", description: "Show loading state" },
      { name: "disabled", type: "boolean", default: "false", description: "Disable button" },
      { name: "onClick", type: "() => void", description: "Click handler" },
    ],
  },
  {
    id: "animated-card",
    name: "Animated Card",
    description: "Interactive card component with hover animations and customizable content",
    category: "layout",
    complexity: "medium",
    tags: ["card", "animation", "hover", "layout"],
    preview: (
      <div className="w-64 bg-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 border border-gray-100">
        <div className="p-6">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg mb-4 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Fast Performance</h3>
          <p className="text-gray-600 text-sm">Optimized for speed and efficiency with modern React patterns.</p>
        </div>
      </div>
    ),
    code: `import React from 'react';

interface AnimatedCardProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  children?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export default function AnimatedCard({
  icon,
  title,
  description,
  children,
  className = '',
  onClick,
}: AnimatedCardProps) {
  return (
    <div
      onClick={onClick}
      className={\`
        bg-white rounded-xl shadow-lg border border-gray-100
        hover:shadow-xl hover:scale-105
        transition-all duration-300 ease-out
        \${onClick ? 'cursor-pointer' : ''}
        \${className}
      \`}
    >
      <div className="p-6">
        {icon && (
          <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg mb-4 flex items-center justify-center">
            {icon}
          </div>
        )}
        
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {title}
        </h3>
        
        <p className="text-gray-600 text-sm mb-4">
          {description}
        </p>
        
        {children}
      </div>
    </div>
  );
}`,
    props: [
      { name: "icon", type: "React.ReactNode", description: "Icon to display in card header" },
      { name: "title", type: "string", description: "Card title" },
      { name: "description", type: "string", description: "Card description" },
      { name: "children", type: "React.ReactNode", description: "Additional card content" },
      { name: "className", type: "string", default: "''", description: "Additional CSS classes" },
      { name: "onClick", type: "() => void", description: "Click handler for card" },
    ],
  },
  {
    id: "smart-input",
    name: "Smart Input",
    description: "Enhanced input field with validation, icons, and multiple states",
    category: "forms",
    complexity: "medium",
    tags: ["input", "form", "validation", "icons"],
    preview: (
      <div className="space-y-4 w-80">
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="email"
            placeholder="Enter your email"
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="tel"
            placeholder="Phone number"
            className="w-full pl-10 pr-4 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          <Check className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-green-500" />
        </div>
      </div>
    ),
    code: `import React, { useState } from 'react';
import { Check, AlertCircle } from 'lucide-react';

interface SmartInputProps {
  type?: 'text' | 'email' | 'password' | 'tel' | 'url';
  placeholder?: string;
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  icon?: React.ReactNode;
  validation?: (value: string) => string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function SmartInput({
  type = 'text',
  placeholder,
  label,
  value = '',
  onChange,
  onBlur,
  icon,
  validation,
  required = false,
  disabled = false,
  className = '',
}: SmartInputProps) {
  const [internalValue, setInternalValue] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [touched, setTouched] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    onChange?.(newValue);

    if (validation && touched) {
      const validationError = validation(newValue);
      setError(validationError);
      setIsValid(!validationError && newValue.length > 0);
    }
  };

  const handleBlur = () => {
    setTouched(true);
    onBlur?.();

    if (validation) {
      const validationError = validation(internalValue);
      setError(validationError);
      setIsValid(!validationError && internalValue.length > 0);
    }
  };

  const getBorderColor = () => {
    if (!touched) return 'border-gray-300';
    if (error) return 'border-red-300';
    if (isValid) return 'border-green-300';
    return 'border-gray-300';
  };

  const getRingColor = () => {
    if (error) return 'focus:ring-red-500 focus:border-red-500';
    if (isValid) return 'focus:ring-green-500 focus:border-green-500';
    return 'focus:ring-blue-500 focus:border-blue-500';
  };

  return (
    <div className={\`\${className}\`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
            {icon}
          </div>
        )}
        
        <input
          type={type}
          value={internalValue}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={\`
            w-full py-2 px-3 border rounded-lg
            \${icon ? 'pl-10' : ''}
            \${isValid || error ? 'pr-10' : ''}
            \${getBorderColor()}
            \${getRingColor()}
            disabled:bg-gray-50 disabled:cursor-not-allowed
            transition-colors duration-200
          \`}
        />
        
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
      
      {touched && error && (
        <p className="mt-1 text-sm text-red-600">{error}</p>
      )}
    </div>
  );
}`,
    props: [
      { name: "type", type: "'text' | 'email' | 'password' | 'tel' | 'url'", default: "'text'", description: "Input type" },
      { name: "placeholder", type: "string", description: "Input placeholder text" },
      { name: "label", type: "string", description: "Input label" },
      { name: "value", type: "string", default: "''", description: "Input value" },
      { name: "onChange", type: "(value: string) => void", description: "Change handler" },
      { name: "icon", type: "React.ReactNode", description: "Icon to display on the left" },
      { name: "validation", type: "(value: string) => string | null", description: "Validation function" },
      { name: "required", type: "boolean", default: "false", description: "Mark field as required" },
    ],
  },
];

interface ComponentLibraryProps {
  onComponentSelect?: (component: Component) => void;
}

export default function ComponentLibrary({ onComponentSelect }: ComponentLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredComponents = SAMPLE_COMPONENTS.filter(component => {
    const matchesCategory = selectedCategory === "all" || component.category === selectedCategory;
    const matchesSearch = component.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         component.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         component.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    return matchesCategory && matchesSearch;
  });

  const copyCode = async (component: Component) => {
    if (navigator.clipboard && component.code) {
      await navigator.clipboard.writeText(component.code);
      setCopiedId(component.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Component Library</h1>
        <p className="text-xl text-gray-600">
          Copy-paste React components with modern design and best practices
        </p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive 
                    ? "bg-blue-100 text-blue-700" 
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {category.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Component Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredComponents.map(component => (
          <div
            key={component.id}
            className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Preview */}
            <div className="p-6 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-center min-h-[120px]">
                {component.preview}
              </div>
            </div>

            {/* Info */}
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-lg text-gray-900">{component.name}</h3>
                <div className={`px-2 py-1 rounded text-xs font-medium ${
                  component.complexity === 'simple' ? 'bg-green-100 text-green-700' :
                  component.complexity === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {component.complexity}
                </div>
              </div>
              
              <p className="text-gray-600 text-sm mb-3">{component.description}</p>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 mb-4">
                {component.tags.slice(0, 3).map(tag => (
                  <span
                    key={tag}
                    className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
                {component.tags.length > 3 && (
                  <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                    +{component.tags.length - 3}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setSelectedComponent(component);
                    setShowCode(true);
                  }}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                >
                  <Eye className="w-4 h-4" />
                  View Code
                </button>
                <button
                  onClick={() => copyCode(component)}
                  className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  {copiedId === component.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copiedId === component.id ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Code Modal */}
      {showCode && selectedComponent && (
        <div className="fixed inset-0 z-50 overflow-auto">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setShowCode(false)} />
          
          <div className="relative min-h-screen flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
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
                    <code>{selectedComponent.code}</code>
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