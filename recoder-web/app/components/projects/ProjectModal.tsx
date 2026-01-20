import React, { useState, useEffect } from 'react';
import type { Project } from '~/lib/.server/db/projects-db';

interface ProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; description: string; icon: string; color: string }) => void;
  initialData?: Project;
  mode: 'create' | 'edit';
}

const PRESET_ICONS = [
  'i-ph:folder', 'i-ph:rocket', 'i-ph:lightbulb', 'i-ph:lightning', 'i-ph:fire', 'i-ph:desktop', 'i-ph:target', 'i-ph:star', 
  'i-ph:chart-bar', 'i-ph:wrench', 'i-ph:palette', 'i-ph:device-mobile', 'i-ph:globe', 'i-ph:gear', 'i-ph:flask', 'i-ph:trend-up'
];

const PRESET_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
];

export function ProjectModal({ isOpen, onClose, onSubmit, initialData, mode }: ProjectModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: 'i-ph:folder',
    color: '#3b82f6'
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Initialize form data when modal opens or initialData changes
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          name: initialData.name,
          description: initialData.description || '',
          icon: initialData.icon || 'i-ph:folder',
          color: initialData.color || '#3b82f6'
        });
      } else {
        setFormData({
          name: '',
          description: '',
          icon: 'i-ph:folder',
          color: '#3b82f6'
        });
      }
      setErrors({});
    }
  }, [isOpen, initialData]);

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Project name must be at least 2 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    onSubmit({
      name: formData.name.trim(),
      description: formData.description.trim(),
      icon: formData.icon,
      color: formData.color
    });
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-bolt-elements-textPrimary mb-6">
          {mode === 'create' ? 'Create New Project' : 'Edit Project'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project Name */}
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
              Project Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder="Enter project name..."
              className={`w-full px-3 py-2 bg-bolt-elements-background-depth-3 border rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus focus:border-transparent ${
                errors.name ? 'border-red-500' : 'border-bolt-elements-borderColor'
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-400">{errors.name}</p>
            )}
          </div>

          {/* Project Description */}
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-2">
              Description (optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Describe your project..."
              rows={3}
              className="w-full px-3 py-2 bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg text-bolt-elements-textPrimary placeholder-bolt-elements-textSecondary focus:outline-none focus:ring-2 focus:ring-bolt-elements-focus focus:border-transparent resize-none"
            />
          </div>

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-3">
              Project Icon
            </label>
            <div className="grid grid-cols-8 gap-2">
              {PRESET_ICONS.map((icon) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => handleInputChange('icon', icon)}
                  className={`w-10 h-10 rounded-lg border-2 transition-all flex items-center justify-center ${
                    formData.icon === icon
                      ? 'border-bolt-elements-focus bg-bolt-elements-focus/10'
                      : 'border-bolt-elements-borderColor hover:border-bolt-elements-borderColorHover'
                  }`}
                >
                  <div className={`${icon} text-xl`} />
                </button>
              ))}
            </div>
          </div>

          {/* Color Selection */}
          <div>
            <label className="block text-sm font-medium text-bolt-elements-textPrimary mb-3">
              Project Color
            </label>
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleInputChange('color', color)}
                  className={`w-12 h-10 rounded-lg border-2 transition-all ${
                    formData.color === color
                      ? 'border-white scale-110'
                      : 'border-bolt-elements-borderColor hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 bg-bolt-elements-background-depth-1 rounded-lg border border-bolt-elements-borderColor">
            <div className="text-sm text-bolt-elements-textSecondary mb-2">Preview:</div>
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: formData.color }}
              >
                <div className={`${formData.icon} text-xl`} />
              </div>
              <div>
                <div className="font-medium text-bolt-elements-textPrimary">
                  {formData.name || 'Project Name'}
                </div>
                {formData.description && (
                  <div className="text-sm text-bolt-elements-textSecondary">
                    {formData.description}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 justify-end pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-bolt-elements-button-primary-background hover:bg-bolt-elements-button-primary-backgroundHover text-bolt-elements-button-primary-text rounded-lg transition-all"
            >
              {mode === 'create' ? 'Create Project' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
