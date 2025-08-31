'use client';

import React, { useState, useEffect } from 'react';
import { Search, Plus, Copy, Check, Code2, Eye, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Component {
  id: string;
  name: string;
  description: string;
  category: string;
  framework: string;
  tags: string[];
  code: string;
  preview: string;
  dependencies: string[];
  popularity: number;
  created: string;
}

interface ComponentLibraryProps {
  onInsertComponent?: (component: Component) => void;
  currentFramework?: string;
}

const MOCK_COMPONENTS: Component[] = [
  {
    id: 'button-primary',
    name: 'Primary Button',
    description: 'A styled primary button with hover effects',
    category: 'Buttons',
    framework: 'React',
    tags: ['button', 'primary', 'interactive'],
    code: `import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export default function PrimaryButton({ 
  children, 
  onClick, 
  disabled = false, 
  size = 'md' 
}: ButtonProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={\`
        bg-blue-600 hover:bg-blue-700 
        text-white font-medium rounded-lg
        transition-colors duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        \${sizeClasses[size]}
      \`}
    >
      {children}
    </button>
  );
}`,
    preview: '<PrimaryButton>Click me</PrimaryButton>',
    dependencies: ['react'],
    popularity: 95,
    created: '2024-01-15'
  },
  {
    id: 'card-feature',
    name: 'Feature Card',
    description: 'A card component for displaying features with icons',
    category: 'Cards',
    framework: 'React',
    tags: ['card', 'feature', 'layout'],
    code: `import React from 'react';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  link?: string;
}

export default function FeatureCard({ 
  icon, 
  title, 
  description, 
  link 
}: FeatureCardProps) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300">
      <div className="flex items-center mb-4">
        <div className="p-2 bg-blue-100 rounded-lg mr-4">
          {icon}
        </div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <p className="text-gray-600 mb-4">{description}</p>
      {link && (
        <a 
          href={link}
          className="text-blue-600 hover:text-blue-800 font-medium"
        >
          Learn more →
        </a>
      )}
    </div>
  );
}`,
    preview: '<FeatureCard icon={<Star />} title="Amazing Feature" description="This is an amazing feature description." />',
    dependencies: ['react'],
    popularity: 88,
    created: '2024-01-10'
  },
  {
    id: 'modal-dialog',
    name: 'Modal Dialog',
    description: 'A reusable modal dialog with backdrop',
    category: 'Overlays',
    framework: 'React',
    tags: ['modal', 'dialog', 'overlay'],
    code: `import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md' 
}: ModalProps) {
  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="fixed inset-0 bg-black bg-opacity-50" 
        onClick={onClose}
      />
      <div className={\`
        relative bg-white rounded-lg shadow-xl 
        w-full mx-4 max-h-[90vh] overflow-hidden
        \${sizeClasses[size]}
      \`}>
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}`,
    preview: '<Modal isOpen={true} title="Example Modal">Modal content here</Modal>',
    dependencies: ['react', 'lucide-react'],
    popularity: 92,
    created: '2024-01-08'
  },
  {
    id: 'form-input',
    name: 'Form Input',
    description: 'A styled form input with validation',
    category: 'Forms',
    framework: 'React',
    tags: ['form', 'input', 'validation'],
    code: `import React, { useState } from 'react';

interface FormInputProps {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
}

export default function FormInput({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  required = false
}: FormInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className={\`
          w-full px-3 py-2 border rounded-lg
          focus:outline-none focus:ring-2 focus:ring-blue-500
          \${error ? 'border-red-500' : focused ? 'border-blue-500' : 'border-gray-300'}
          \${error ? 'bg-red-50' : 'bg-white'}
        \`}
      />
      {error && (
        <p className="text-red-500 text-sm mt-1">{error}</p>
      )}
    </div>
  );
}`,
    preview: '<FormInput label="Email" type="email" placeholder="Enter your email" value="" onChange={() => {}} />',
    dependencies: ['react'],
    popularity: 90,
    created: '2024-01-12'
  }
];

export default function ComponentLibrary({ onInsertComponent, currentFramework = 'React' }: ComponentLibraryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedComponent, setSelectedComponent] = useState<Component | null>(null);
  const [copiedComponent, setCopiedComponent] = useState<string | null>(null);

  const categories = ['All', ...Array.from(new Set(MOCK_COMPONENTS.map(c => c.category)))];
  
  const filteredComponents = MOCK_COMPONENTS.filter(component => {
    const matchesSearch = component.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         component.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         component.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'All' || component.category === selectedCategory;
    const matchesFramework = component.framework === currentFramework;
    
    return matchesSearch && matchesCategory && matchesFramework;
  });

  const copyToClipboard = async (code: string, componentId: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedComponent(componentId);
      setTimeout(() => setCopiedComponent(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const insertComponent = (component: Component) => {
    onInsertComponent?.(component);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 border-b dark:border-gray-700">
        <h2 className="text-lg font-semibold mb-4">Component Library</h2>
        
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Categories */}
        <div className="flex gap-2 overflow-x-auto">
          {categories.map(category => (
            <Button
              key={category}
              variant={selectedCategory === category ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(category)}
              className="whitespace-nowrap"
            >
              {category}
            </Button>
          ))}
        </div>
      </div>

      {/* Component List */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4">
          {filteredComponents.map(component => (
            <Card key={component.id} className="hover:shadow-lg transition-shadow cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{component.name}</CardTitle>
                    <CardDescription className="text-sm mt-1">
                      {component.description}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary" className="ml-2">
                    {component.popularity}%
                  </Badge>
                </div>
                
                <div className="flex gap-1 mt-2">
                  {component.tags.slice(0, 3).map(tag => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardHeader>
              
              <CardContent className="pt-0">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedComponent(component)}
                    className="flex-1"
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Preview
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(component.code, component.id)}
                  >
                    {copiedComponent === component.id ? (
                      <Check className="w-3 h-3" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                  
                  <Button
                    size="sm"
                    onClick={() => insertComponent(component)}
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Insert
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredComponents.length === 0 && (
          <div className="text-center py-8">
            <Code2 className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-500">No components found</p>
          </div>
        )}
      </div>

      {/* Component Preview Modal */}
      {selectedComponent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden mx-4">
            <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
              <h3 className="text-lg font-semibold">{selectedComponent.name}</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedComponent(null)}
              >
                ×
              </Button>
            </div>
            
            <div className="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
              <Tabs defaultValue="code" className="w-full">
                <TabsList>
                  <TabsTrigger value="code">Code</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  <TabsTrigger value="info">Info</TabsTrigger>
                </TabsList>
                
                <TabsContent value="code" className="mt-4">
                  <div className="relative">
                    <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-sm">
                      <code>{selectedComponent.code}</code>
                    </pre>
                    <Button
                      size="sm"
                      className="absolute top-2 right-2"
                      onClick={() => copyToClipboard(selectedComponent.code, selectedComponent.id)}
                    >
                      {copiedComponent === selectedComponent.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                </TabsContent>
                
                <TabsContent value="preview" className="mt-4">
                  <div className="bg-gray-50 dark:bg-gray-800 p-8 rounded-lg">
                    <div dangerouslySetInnerHTML={{ __html: selectedComponent.preview }} />
                  </div>
                </TabsContent>
                
                <TabsContent value="info" className="mt-4">
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Description</h4>
                      <p className="text-gray-600 dark:text-gray-400">{selectedComponent.description}</p>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">Dependencies</h4>
                      <div className="flex gap-2">
                        {selectedComponent.dependencies.map(dep => (
                          <Badge key={dep} variant="outline">{dep}</Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium mb-2">Tags</h4>
                      <div className="flex gap-2">
                        {selectedComponent.tags.map(tag => (
                          <Badge key={tag} variant="secondary">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
              
              <div className="flex gap-2 mt-6">
                <Button
                  onClick={() => insertComponent(selectedComponent)}
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Insert Component
                </Button>
                <Button
                  variant="outline"
                  onClick={() => copyToClipboard(selectedComponent.code, selectedComponent.id)}
                >
                  Copy Code
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
