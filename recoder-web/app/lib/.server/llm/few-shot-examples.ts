/**
 * Few-shot examples for agentic AI behavior
 * These examples teach the AI to explore before acting and generate high-quality code
 *
 * Enhanced with Lovable-quality patterns and comprehensive examples
 */

export interface FewShotMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Example: Fixing a missing dependency error
 */
export const fixMissingDependencyExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Fix this error: Failed to resolve import "date-fns" from "src/utils/date.ts"`
  },
  {
    role: 'assistant',
    content: `I'll investigate this error by first checking what's installed.

<recoderArtifact id="investigate-error" title="Investigate missing dependency">
<recoderAction type="readFile" filePath="package.json">Check if date-fns is in dependencies</recoderAction>
</recoderArtifact>`
  },
  {
    role: 'user',
    content: `[readFile result]
{
  "name": "my-app",
  "dependencies": {
    "react": "latest",
    "react-dom": "latest"
  }
}`
  },
  {
    role: 'assistant',
    content: `I see date-fns is not in the dependencies. I'll add it and install.

<recoderArtifact id="fix-dependency" title="Add date-fns dependency">
<recoderAction type="file" filePath="package.json">
{
  "name": "my-app",
  "dependencies": {
    "react": "latest",
    "react-dom": "latest",
    "date-fns": "latest"
  }
}
</recoderAction>
<recoderAction type="shell">npm install</recoderAction>
</recoderArtifact>

The error should be fixed now. I added date-fns to package.json and ran npm install.`
  }
];

/**
 * Example: Creating a polished component (Lovable-quality)
 */
export const createComponentExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Create a user profile card component`
  },
  {
    role: 'assistant',
    content: `I'll create a polished, production-ready user profile card with proper TypeScript types, beautiful styling, and all necessary states.

<recoderArtifact id="user-profile-card" title="User Profile Card Component">
<recoderAction type="file" filePath="src/components/UserProfileCard.tsx">
import { useState } from 'react';
import { User, Mail, MapPin, Calendar, ExternalLink, Loader2 } from 'lucide-react';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  location?: string;
  bio?: string;
  joinedAt: Date;
  website?: string;
  role: 'admin' | 'user' | 'guest';
}

interface UserProfileCardProps {
  user: UserProfile;
  onEdit?: () => void;
  onMessage?: () => void;
  isLoading?: boolean;
}

export function UserProfileCard({ user, onEdit, onMessage, isLoading }: UserProfileCardProps) {
  const [imageError, setImageError] = useState(false);

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 animate-pulse">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  const roleColors = {
    admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    user: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    guest: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden transition-all duration-200 hover:shadow-xl">
      {/* Header gradient */}
      <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

      <div className="px-6 pb-6">
        {/* Avatar */}
        <div className="relative -mt-12 mb-4">
          {user.avatar && !imageError ? (
            <img
              src={user.avatar}
              alt={user.name}
              onError={() => setImageError(true)}
              className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 object-cover shadow-lg"
            />
          ) : (
            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shadow-lg">
              <User className="w-10 h-10 text-white" />
            </div>
          )}
        </div>

        {/* User info */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">{user.name}</h3>
            <span className={\`px-3 py-1 rounded-full text-xs font-medium \${roleColors[user.role]}\`}>
              {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
            </span>
          </div>

          {user.bio && (
            <p className="text-gray-600 dark:text-gray-400 text-sm">{user.bio}</p>
          )}

          <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <span>{user.email}</span>
            </div>

            {user.location && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>{user.location}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              <span>Joined {new Date(user.joinedAt).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric'
              })}</span>
            </div>

            {user.website && (
              <a
                href={user.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Website</span>
              </a>
            )}
          </div>
        </div>

        {/* Actions */}
        {(onEdit || onMessage) && (
          <div className="flex gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
            {onMessage && (
              <button
                onClick={onMessage}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors duration-200 font-medium"
              >
                Message
              </button>
            )}
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 font-medium"
              >
                Edit
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default UserProfileCard;
</recoderAction>
</recoderArtifact>

I've created a polished user profile card with:
- Full TypeScript types for props and user data
- Loading skeleton state
- Avatar with fallback
- Gradient header
- Role badges with colors
- Contact information display
- Responsive hover effects
- Dark mode support
- Action buttons for edit/message`
  }
];

/**
 * Example: Fixing a "React is not defined" error
 */
export const fixReactNotDefinedExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Fix this error: React is not defined at src/components/Button.tsx:5`
  },
  {
    role: 'assistant',
    content: `I'll read the file to see what's missing.

<recoderArtifact id="investigate-error" title="Read error file">
<recoderAction type="readFile" filePath="src/components/Button.tsx">Check the imports</recoderAction>
</recoderArtifact>`
  },
  {
    role: 'user',
    content: `[readFile result]
export function Button({ children, onClick }) {
  return (
    <button onClick={onClick} className="btn">
      {children}
    </button>
  );
}`
  },
  {
    role: 'assistant',
    content: `The file is missing proper TypeScript types and React import. I'll fix it with production-quality code.

<recoderArtifact id="fix-import" title="Fix Button component">
<recoderAction type="file" filePath="src/components/Button.tsx">
import React from 'react';

interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variantStyles = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500 dark:bg-gray-700 dark:text-white',
    outline: 'border-2 border-gray-300 hover:border-gray-400 focus:ring-gray-500 dark:border-gray-600',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={\`\${baseStyles} \${variantStyles[variant]} \${sizeStyles[size]} \${disabled ? 'opacity-50 cursor-not-allowed' : ''} \${className}\`}
    >
      {children}
    </button>
  );
}
</recoderAction>
</recoderArtifact>

Fixed! I added:
- React import
- TypeScript interface for props
- Multiple variants (primary, secondary, outline)
- Size options
- Disabled state
- Focus ring for accessibility
- Dark mode support`
  }
];

/**
 * Example: Adding a new feature by exploring first
 */
export const addFeatureExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Add a dark mode toggle to the app`
  },
  {
    role: 'assistant',
    content: `I'll first explore the codebase to understand the current structure.

<recoderArtifact id="explore-codebase" title="Explore project structure">
<recoderAction type="listFiles" path="src" recursive="true">See project structure</recoderAction>
<recoderAction type="readFile" filePath="src/App.tsx">Read main component</recoderAction>
<recoderAction type="searchFiles" query="theme" filePattern="*.tsx">Find existing theme code</recoderAction>
</recoderArtifact>`
  }
];

/**
 * Example: Creating a complete data table with all states
 */
export const createDataTableExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Create a data table component for displaying users`
  },
  {
    role: 'assistant',
    content: `I'll create a complete, production-ready data table with sorting, filtering, pagination, and all necessary states.

<recoderArtifact id="data-table" title="Users Data Table">
<recoderAction type="file" filePath="src/components/UsersTable.tsx">
import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, Search, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: 'active' | 'inactive';
  createdAt: Date;
}

interface UsersTableProps {
  users: User[];
  isLoading?: boolean;
  onUserClick?: (user: User) => void;
}

type SortField = 'name' | 'email' | 'role' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

export function UsersTable({ users, isLoading, onUserClick }: UsersTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Filter and sort users
  const processedUsers = useMemo(() => {
    let result = [...users];

    // Filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        user =>
          user.name.toLowerCase().includes(query) ||
          user.email.toLowerCase().includes(query) ||
          user.role.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      const comparison = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [users, searchQuery, sortField, sortDirection]);

  // Paginate
  const totalPages = Math.ceil(processedUsers.length / pageSize);
  const paginatedUsers = processedUsers.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4" />
    ) : (
      <ChevronDown className="w-4 h-4" />
    );
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
        <div className="flex items-center justify-center gap-3 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading users...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
      {/* Search */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-900/50">
            <tr>
              {(['name', 'email', 'role', 'status', 'createdAt'] as SortField[]).map(field => (
                <th
                  key={field}
                  onClick={() => handleSort(field)}
                  className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    {field === 'createdAt' ? 'Created' : field}
                    <SortIcon field={field} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {paginatedUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No users found
                </td>
              </tr>
            ) : (
              paginatedUsers.map(user => (
                <tr
                  key={user.id}
                  onClick={() => onUserClick?.(user)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                >
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">
                    {user.name}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {user.email}
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {user.role}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={\`inline-flex px-2 py-1 text-xs font-medium rounded-full \${
                        user.status === 'active'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                      }\`}
                    >
                      {user.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-500 dark:text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {(currentPage - 1) * pageSize + 1} to{' '}
            {Math.min(currentPage * pageSize, processedUsers.length)} of{' '}
            {processedUsers.length} results
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
</recoderAction>
</recoderArtifact>

Created a complete data table with:
- Search/filtering
- Column sorting (click headers)
- Pagination with page info
- Loading state
- Empty state
- Row click handlers
- Status badges
- Dark mode support
- Responsive design`
  }
];

/**
 * Example: Creating an accessible, responsive form
 */
export const createFormExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Create a contact form`
  },
  {
    role: 'assistant',
    content: `I'll create a fully accessible, responsive contact form with validation, loading states, and success/error feedback.

<recoderArtifact id="contact-form" title="Accessible Contact Form">
<recoderAction type="file" filePath="src/components/ContactForm.tsx">
import { useState, useId } from 'react';
import { Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface FormData {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error';

export function ContactForm() {
  const formId = useId();
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<FormStatus>('idle');
  const [serverError, setServerError] = useState<string | null>(null);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    } else if (formData.message.length < 10) {
      newErrors.message = 'Message must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setStatus('submitting');

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to send message');
      }

      setStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      setStatus('error');
      setServerError(err instanceof Error ? err.message : 'Something went wrong');
    }
  };

  if (status === 'success') {
    return (
      <div className="bg-green-50 dark:bg-green-900/20 rounded-2xl p-8 text-center" role="alert">
        <CheckCircle className="w-16 h-16 mx-auto text-green-500 mb-4" />
        <h3 className="text-xl font-semibold text-green-800 dark:text-green-300">
          Message Sent!
        </h3>
        <p className="mt-2 text-green-600 dark:text-green-400">
          Thank you for reaching out. We'll get back to you soon.
        </p>
        <button
          onClick={() => setStatus('idle')}
          className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 md:p-8 space-y-6"
      noValidate
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
        Contact Us
      </h2>

      {serverError && (
        <div
          className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-start gap-3"
          role="alert"
        >
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-700 dark:text-red-300">{serverError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Name Field */}
        <div className="space-y-1.5">
          <label
            htmlFor={\`\${formId}-name\`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Name <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id={\`\${formId}-name\`}
            name="name"
            type="text"
            value={formData.name}
            onChange={handleChange}
            required
            aria-required="true"
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? \`\${formId}-name-error\` : undefined}
            className={\`
              w-full px-4 py-2.5 rounded-lg border transition-colors
              bg-white dark:bg-gray-700
              \${errors.name
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500'
              }
              focus:outline-none focus:ring-2 focus:border-transparent
            \`}
            placeholder="John Doe"
          />
          {errors.name && (
            <p
              id={\`\${formId}-name-error\`}
              className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"
              role="alert"
            >
              <AlertCircle className="w-4 h-4" />
              {errors.name}
            </p>
          )}
        </div>

        {/* Email Field */}
        <div className="space-y-1.5">
          <label
            htmlFor={\`\${formId}-email\`}
            className="block text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Email <span className="text-red-500" aria-hidden="true">*</span>
          </label>
          <input
            id={\`\${formId}-email\`}
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            required
            aria-required="true"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? \`\${formId}-email-error\` : undefined}
            className={\`
              w-full px-4 py-2.5 rounded-lg border transition-colors
              bg-white dark:bg-gray-700
              \${errors.email
                ? 'border-red-500 focus:ring-red-500'
                : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500'
              }
              focus:outline-none focus:ring-2 focus:border-transparent
            \`}
            placeholder="john@example.com"
          />
          {errors.email && (
            <p
              id={\`\${formId}-email-error\`}
              className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"
              role="alert"
            >
              <AlertCircle className="w-4 h-4" />
              {errors.email}
            </p>
          )}
        </div>
      </div>

      {/* Subject Field */}
      <div className="space-y-1.5">
        <label
          htmlFor={\`\${formId}-subject\`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Subject <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <input
          id={\`\${formId}-subject\`}
          name="subject"
          type="text"
          value={formData.subject}
          onChange={handleChange}
          required
          aria-required="true"
          aria-invalid={!!errors.subject}
          aria-describedby={errors.subject ? \`\${formId}-subject-error\` : undefined}
          className={\`
            w-full px-4 py-2.5 rounded-lg border transition-colors
            bg-white dark:bg-gray-700
            \${errors.subject
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500'
            }
            focus:outline-none focus:ring-2 focus:border-transparent
          \`}
          placeholder="How can we help?"
        />
        {errors.subject && (
          <p
            id={\`\${formId}-subject-error\`}
            className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"
            role="alert"
          >
            <AlertCircle className="w-4 h-4" />
            {errors.subject}
          </p>
        )}
      </div>

      {/* Message Field */}
      <div className="space-y-1.5">
        <label
          htmlFor={\`\${formId}-message\`}
          className="block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Message <span className="text-red-500" aria-hidden="true">*</span>
        </label>
        <textarea
          id={\`\${formId}-message\`}
          name="message"
          value={formData.message}
          onChange={handleChange}
          required
          aria-required="true"
          aria-invalid={!!errors.message}
          aria-describedby={errors.message ? \`\${formId}-message-error\` : undefined}
          rows={5}
          className={\`
            w-full px-4 py-2.5 rounded-lg border transition-colors resize-none
            bg-white dark:bg-gray-700
            \${errors.message
              ? 'border-red-500 focus:ring-red-500'
              : 'border-gray-300 dark:border-gray-600 focus:ring-indigo-500'
            }
            focus:outline-none focus:ring-2 focus:border-transparent
          \`}
          placeholder="Tell us more about your inquiry..."
        />
        {errors.message && (
          <p
            id={\`\${formId}-message-error\`}
            className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1"
            role="alert"
          >
            <AlertCircle className="w-4 h-4" />
            {errors.message}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={status === 'submitting'}
        className={\`
          w-full px-6 py-3 rounded-lg font-medium
          bg-indigo-600 text-white
          hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200
          flex items-center justify-center gap-2
        \`}
      >
        {status === 'submitting' ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Send className="w-5 h-5" />
            Send Message
          </>
        )}
      </button>
    </form>
  );
}

export default ContactForm;
</recoderAction>
</recoderArtifact>

Created an accessible contact form with:
- Full TypeScript types
- Client-side validation with error messages
- Loading state with spinner
- Success state with confirmation
- Server error handling
- ARIA attributes for screen readers
- Proper label associations
- Responsive grid layout
- Dark mode support
- Focus management`
  }
];

/**
 * Example: Creating an accessible modal/dialog
 */
export const createModalExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Create a modal component`
  },
  {
    role: 'assistant',
    content: `I'll create a fully accessible modal with focus trapping, keyboard navigation, and proper ARIA attributes.

<recoderArtifact id="modal-component" title="Accessible Modal Component">
<recoderAction type="file" filePath="src/components/Modal.tsx">
import { useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showCloseButton?: boolean;
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  showCloseButton = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus trapping
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key !== 'Tab' || !modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    },
    [onClose]
  );

  // Manage focus and body scroll
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', handleKeyDown);

      // Focus first focusable element
      requestAnimationFrame(() => {
        const firstFocusable = modalRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        firstFocusable?.focus();
      });
    } else {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
      previousActiveElement.current?.focus();
    }

    return () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      aria-labelledby="modal-title"
      aria-describedby={description ? 'modal-description' : undefined}
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal positioning */}
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Modal panel */}
        <div
          ref={modalRef}
          className={\`
            relative w-full \${sizeClasses[size]}
            bg-white dark:bg-gray-800
            rounded-2xl shadow-2xl
            transform transition-all
            animate-in zoom-in-95 fade-in duration-200
          \`}
        >
          {/* Header */}
          <div className="flex items-start justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2
                id="modal-title"
                className="text-xl font-semibold text-gray-900 dark:text-white"
              >
                {title}
              </h2>
              {description && (
                <p
                  id="modal-description"
                  className="mt-1 text-sm text-gray-500 dark:text-gray-400"
                >
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="p-2 -m-2 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                aria-label="Close dialog"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Compound components for common patterns
Modal.Footer = function ModalFooter({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={\`flex items-center justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700 -mx-6 -mb-6 px-6 py-4 bg-gray-50 dark:bg-gray-900/50 rounded-b-2xl \${className}\`}
    >
      {children}
    </div>
  );
};

export default Modal;
</recoderAction>
</recoderArtifact>

Created an accessible modal with:
- Focus trapping (Tab cycles through modal elements)
- Escape key closes modal
- Click outside closes modal
- ARIA attributes for screen readers
- Focus restoration on close
- Body scroll lock when open
- Smooth animations
- Multiple size variants
- Dark mode support
- Compound Footer component`
  }
];

/**
 * Example: Creating a responsive navigation
 */
export const createNavigationExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Create a responsive navigation header`
  },
  {
    role: 'assistant',
    content: `I'll create a responsive navigation with mobile menu, proper accessibility, and smooth transitions.

<recoderArtifact id="responsive-nav" title="Responsive Navigation Header">
<recoderAction type="file" filePath="src/components/Header.tsx">
import { useState, useEffect } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';

interface NavLink {
  label: string;
  href: string;
  children?: NavLink[];
}

const navLinks: NavLink[] = [
  { label: 'Home', href: '/' },
  { label: 'Products', href: '/products', children: [
    { label: 'All Products', href: '/products' },
    { label: 'New Arrivals', href: '/products/new' },
    { label: 'Best Sellers', href: '/products/best-sellers' },
  ]},
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  // Handle scroll for header background
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Lock body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  return (
    <header
      className={\`
        fixed top-0 left-0 right-0 z-40
        transition-all duration-300
        \${isScrolled
          ? 'bg-white/95 dark:bg-gray-900/95 backdrop-blur-md shadow-lg'
          : 'bg-white dark:bg-gray-900'
        }
      \`}
    >
      {/* Skip link for accessibility */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-indigo-600 text-white px-4 py-2 rounded-lg z-50"
      >
        Skip to main content
      </a>

      <nav
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <a
            href="/"
            className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white"
          >
            <span className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg" />
            Brand
          </a>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <div key={link.label} className="relative group">
                {link.children ? (
                  <>
                    <button
                      onClick={() => setOpenDropdown(openDropdown === link.label ? null : link.label)}
                      className="flex items-center gap-1 px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                      aria-expanded={openDropdown === link.label}
                      aria-haspopup="true"
                    >
                      {link.label}
                      <ChevronDown className={\`w-4 h-4 transition-transform \${openDropdown === link.label ? 'rotate-180' : ''}\`} />
                    </button>
                    {openDropdown === link.label && (
                      <div
                        className="absolute top-full left-0 mt-1 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 py-2 animate-in fade-in slide-in-from-top-2 duration-200"
                        role="menu"
                      >
                        {link.children.map((child) => (
                          <a
                            key={child.href}
                            href={child.href}
                            className="block px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700"
                            role="menuitem"
                          >
                            {child.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <a
                    href={link.href}
                    className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    {link.label}
                  </a>
                )}
              </div>
            ))}
          </div>

          {/* CTA Button */}
          <div className="hidden md:block">
            <a
              href="/get-started"
              className="px-5 py-2.5 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Get Started
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="md:hidden p-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
            aria-expanded={isMenuOpen}
            aria-controls="mobile-menu"
            aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {isMenuOpen ? (
              <X className="w-6 h-6" aria-hidden="true" />
            ) : (
              <Menu className="w-6 h-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div
        id="mobile-menu"
        className={\`
          md:hidden fixed inset-0 top-16 z-30
          bg-white dark:bg-gray-900
          transition-transform duration-300 ease-in-out
          \${isMenuOpen ? 'translate-x-0' : 'translate-x-full'}
        \`}
        aria-hidden={!isMenuOpen}
      >
        <nav className="h-full overflow-y-auto px-4 py-6">
          <ul className="space-y-2">
            {navLinks.map((link) => (
              <li key={link.label}>
                {link.children ? (
                  <div>
                    <button
                      onClick={() => setOpenDropdown(openDropdown === link.label ? null : link.label)}
                      className="flex items-center justify-between w-full px-4 py-3 text-lg text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                      aria-expanded={openDropdown === link.label}
                    >
                      {link.label}
                      <ChevronDown className={\`w-5 h-5 transition-transform \${openDropdown === link.label ? 'rotate-180' : ''}\`} />
                    </button>
                    {openDropdown === link.label && (
                      <ul className="mt-2 ml-4 space-y-1 border-l-2 border-gray-200 dark:border-gray-700">
                        {link.children.map((child) => (
                          <li key={child.href}>
                            <a
                              href={child.href}
                              className="block px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                              onClick={() => setIsMenuOpen(false)}
                            >
                              {child.label}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <a
                    href={link.href}
                    className="block px-4 py-3 text-lg text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.label}
                  </a>
                )}
              </li>
            ))}
          </ul>

          {/* Mobile CTA */}
          <div className="mt-8 px-4">
            <a
              href="/get-started"
              className="block w-full py-3 text-center bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              onClick={() => setIsMenuOpen(false)}
            >
              Get Started
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}

export default Header;
</recoderAction>
</recoderArtifact>

Created a responsive navigation with:
- Desktop horizontal nav with dropdowns
- Mobile hamburger menu with slide-in panel
- Scroll-aware header background
- Skip link for accessibility
- ARIA attributes for screen readers
- Keyboard accessible dropdowns
- Body scroll lock on mobile menu
- Smooth animations and transitions
- Dark mode support`
  }
];

/**
 * Example: Creating a COMPLETE app from scratch (one-shot generation)
 * This shows the exact pattern: package.json → configs → entry → components → shell
 */
export const createCompleteAppExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Build me a tip calculator app`
  },
  {
    role: 'assistant',
    content: `I'll build a complete, beautiful tip calculator app with React, TypeScript, and Tailwind CSS.

<recoderArtifact id="tip-calculator" title="Tip Calculator App">
<recoderAction type="file" filePath="package.json">
{
  "name": "tip-calculator",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "latest",
    "react-dom": "latest",
    "lucide-react": "latest"
  },
  "devDependencies": {
    "@types/react": "latest",
    "@types/react-dom": "latest",
    "@vitejs/plugin-react": "latest",
    "autoprefixer": "latest",
    "postcss": "latest",
    "tailwindcss": "latest",
    "typescript": "latest",
    "vite": "latest"
  }
}
</recoderAction>
<recoderAction type="file" filePath="vite.config.ts">
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
</recoderAction>
<recoderAction type="file" filePath="tsconfig.json">
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
</recoderAction>
<recoderAction type="file" filePath="tailwind.config.js">
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
</recoderAction>
<recoderAction type="file" filePath="postcss.config.js">
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
</recoderAction>
<recoderAction type="file" filePath="index.html">
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tip Calculator</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
</recoderAction>
<recoderAction type="file" filePath="src/main.tsx">
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
</recoderAction>
<recoderAction type="file" filePath="src/index.css">
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
</recoderAction>
<recoderAction type="file" filePath="src/App.tsx">
import { useState, useCallback } from 'react';
import { Calculator, DollarSign, Users, Percent, RotateCcw, Receipt } from 'lucide-react';

const TIP_PRESETS = [15, 18, 20, 25];

interface TipResult {
  tipAmount: number;
  total: number;
  perPerson: number;
}

function useTipCalculator() {
  const [billAmount, setBillAmount] = useState('');
  const [tipPercent, setTipPercent] = useState(18);
  const [splitCount, setSplitCount] = useState(1);
  const [customTip, setCustomTip] = useState('');
  const [isCustom, setIsCustom] = useState(false);

  const bill = parseFloat(billAmount) || 0;
  const activeTip = isCustom ? (parseFloat(customTip) || 0) : tipPercent;
  const tipAmount = bill * (activeTip / 100);
  const total = bill + tipAmount;
  const perPerson = splitCount > 0 ? total / splitCount : total;

  const selectPreset = useCallback((pct: number) => {
    setTipPercent(pct);
    setCustomTip('');
    setIsCustom(false);
  }, []);

  const setCustom = useCallback((value: string) => {
    setCustomTip(value);
    setIsCustom(true);
  }, []);

  const reset = useCallback(() => {
    setBillAmount('');
    setTipPercent(18);
    setSplitCount(1);
    setCustomTip('');
    setIsCustom(false);
  }, []);

  const result: TipResult = { tipAmount, total, perPerson };

  return {
    billAmount, setBillAmount,
    tipPercent, activeTip, isCustom, customTip,
    splitCount, setSplitCount,
    selectPreset, setCustom, reset,
    bill, result,
  };
}

export default function App() {
  const calc = useTipCalculator();

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden transform transition-all hover:shadow-emerald-200/50">
          {/* Header */}
          <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 p-6 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)]" />
            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl backdrop-blur-sm">
                  <Calculator className="w-6 h-6" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Tip Calculator</h1>
                  <p className="text-emerald-100 text-sm">Split bills with ease</p>
                </div>
              </div>
              <button
                onClick={calc.reset}
                className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                aria-label="Reset calculator"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Form */}
          <div className="p-6 space-y-6">
            {/* Bill Amount */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <DollarSign className="w-4 h-4 text-emerald-500" /> Bill Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-lg font-medium">$</span>
                <input
                  type="number"
                  value={calc.billAmount}
                  onChange={(e) => calc.setBillAmount(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full pl-10 pr-4 py-3.5 border-2 border-gray-100 rounded-2xl text-lg font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-300 outline-none transition-all bg-gray-50/50 hover:border-gray-200"
                />
              </div>
            </div>

            {/* Tip Percentage */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <Percent className="w-4 h-4 text-emerald-500" /> Tip Percentage
              </label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {TIP_PRESETS.map((pct) => (
                  <button
                    key={pct}
                    onClick={() => calc.selectPreset(pct)}
                    className={\`py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 \${
                      calc.tipPercent === pct && !calc.isCustom
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30 scale-[1.02]'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100'
                    }\`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={calc.customTip}
                onChange={(e) => calc.setCustom(e.target.value)}
                placeholder="Custom tip %"
                min="0"
                className={\`w-full px-4 py-2.5 border-2 rounded-xl text-sm font-medium outline-none transition-all \${
                  calc.isCustom
                    ? 'border-emerald-300 ring-2 ring-emerald-500/20 bg-emerald-50/30'
                    : 'border-gray-100 bg-gray-50/50 hover:border-gray-200'
                } focus:ring-2 focus:ring-emerald-500 focus:border-emerald-300\`}
              />
            </div>

            {/* Split Between */}
            <div>
              <label className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2">
                <Users className="w-4 h-4 text-emerald-500" /> Split Between
              </label>
              <div className="flex items-center justify-center gap-5 py-2">
                <button
                  onClick={() => calc.setSplitCount(Math.max(1, calc.splitCount - 1))}
                  disabled={calc.splitCount <= 1}
                  className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-lg font-bold transition-all active:scale-95"
                >
                  -
                </button>
                <div className="text-center">
                  <span className="text-3xl font-bold text-gray-800">{calc.splitCount}</span>
                  <p className="text-xs text-gray-400 mt-0.5">{calc.splitCount === 1 ? 'person' : 'people'}</p>
                </div>
                <button
                  onClick={() => calc.setSplitCount(calc.splitCount + 1)}
                  className="w-11 h-11 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-lg font-bold transition-all active:scale-95"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="bg-gradient-to-b from-gray-50 to-gray-100/80 p-6 space-y-3 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Receipt className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-500 uppercase tracking-wide">Summary</span>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span className="text-sm">Tip ({calc.activeTip}%)</span>
              <span className="font-semibold">\${calc.result.tipAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-gray-600">
              <span className="text-sm">Total</span>
              <span className="font-semibold">\${calc.result.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center pt-4 mt-2 border-t-2 border-dashed border-gray-200">
              <span className="text-gray-800 font-semibold">
                {calc.splitCount > 1 ? 'Per Person' : 'You Pay'}
              </span>
              <span className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                \${calc.result.perPerson.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-4">Tap a preset or enter a custom tip</p>
      </div>
    </div>
  );
}
</recoderAction>
<recoderAction type="shell">npm install && npm run dev</recoderAction>
</recoderArtifact>

Your tip calculator is ready! It features:
- Preset tip buttons (15%, 18%, 20%, 25%) plus custom tip input
- Bill splitting with person count selector
- Beautiful gradient header with glassmorphism effects
- Animated button states and smooth transitions
- Reset button to clear all fields
- Responsive card layout with shadow effects
- Clean summary section with gradient text for the final amount`
  }
];

/**
 * Example: Creating a mobile app with Expo and React Native
 */
export const createMobileAppExample: FewShotMessage[] = [
  {
    role: 'user',
    content: `Build a simple todo app for mobile`
  },
  {
    role: 'assistant',
    content: `I'll create a mobile todo app using React Native with Expo and expo-router for navigation.

<recoderArtifact id="mobile-todo-app" title="Mobile Todo App">
<recoderAction type="file" filePath="app.json">
{
  "expo": {
    "name": "TodoApp",
    "slug": "todo-app",
    "version": "1.0.0",
    "scheme": "todo-app",
    "web": { "bundler": "metro" },
    "plugins": ["expo-router"]
  }
}
</recoderAction>
<recoderAction type="file" filePath="package.json">
{
  "name": "todo-app",
  "version": "1.0.0",
  "main": "expo-router/entry",
  "scripts": {
    "dev": "npx expo start --web",
    "web": "npx expo start --web",
    "start": "npx expo start"
  },
  "dependencies": {
    "expo": "latest",
    "expo-router": "latest",
    "expo-status-bar": "latest",
    "react": "latest",
    "react-native": "latest",
    "react-native-safe-area-context": "latest",
    "react-native-screens": "latest",
    "@expo/vector-icons": "latest"
  },
  "devDependencies": {
    "@types/react": "latest",
    "typescript": "latest"
  }
}
</recoderAction>
<recoderAction type="file" filePath="app/_layout.tsx">
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </SafeAreaProvider>
  );
}
</recoderAction>
<recoderAction type="file" filePath="app/(tabs)/_layout.tsx">
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: '#6366f1',
      headerShown: false,
    }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Todos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkbox-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
</recoderAction>
<recoderAction type="file" filePath="app/(tabs)/index.tsx">
import { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

export default function TodoScreen() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState('');

  const addTodo = () => {
    if (!input.trim()) return;
    setTodos(prev => [
      { id: Date.now().toString(), text: input.trim(), completed: false },
      ...prev,
    ]);
    setInput('');
  };

  const toggleTodo = (id: string) => {
    setTodos(prev =>
      prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const deleteTodo = (id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>My Todos</Text>
      <Text style={styles.subtitle}>
        {todos.filter(t => !t.completed).length} remaining
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Add a new todo..."
          placeholderTextColor="#9ca3af"
          onSubmitEditing={addTodo}
          returnKeyType="done"
        />
        <TouchableOpacity style={styles.addButton} onPress={addTodo}>
          <Ionicons name="add" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={todos}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.todoItem}>
            <TouchableOpacity
              style={styles.todoContent}
              onPress={() => toggleTodo(item.id)}
            >
              <Ionicons
                name={item.completed ? 'checkbox' : 'square-outline'}
                size={24}
                color={item.completed ? '#6366f1' : '#d1d5db'}
              />
              <Text
                style={[
                  styles.todoText,
                  item.completed && styles.todoCompleted,
                ]}
              >
                {item.text}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteTodo(item.id)}>
              <Ionicons name="trash-outline" size={20} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="clipboard-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>No todos yet. Add one above!</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb', padding: 20 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4, marginBottom: 20 },
  inputRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: 8 },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  todoContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  todoText: { fontSize: 16, color: '#111827', flex: 1 },
  todoCompleted: { textDecorationLine: 'line-through', color: '#9ca3af' },
  empty: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 16, color: '#9ca3af' },
});
</recoderAction>
<recoderAction type="shell">npm install && npm run web</recoderAction>
</recoderArtifact>

I've created a mobile todo app with:
- Expo + expo-router for file-based navigation
- React Native components (View, Text, FlatList, TouchableOpacity)
- StyleSheet.create() for all styling (no CSS)
- SafeAreaView for notch handling
- Add, toggle, and delete todos
- Empty state with icon
- Remaining count display`
  }
];

/**
 * Get few-shot examples based on the user's message
 */
export function getFewShotExamples(userMessage: string): FewShotMessage[] {
  const lowerMessage = userMessage.toLowerCase();

  // Complete app generation (build/create/make/generate an app/website/dashboard/tool)
  const isNewAppRequest = (
    (lowerMessage.includes('build') || lowerMessage.includes('create') || lowerMessage.includes('make') || lowerMessage.includes('generate')) &&
    (lowerMessage.includes(' app') || lowerMessage.includes(' website') || lowerMessage.includes(' dashboard') ||
     lowerMessage.includes(' tool') || lowerMessage.includes(' calculator') || lowerMessage.includes(' tracker') ||
     lowerMessage.includes(' manager') || lowerMessage.includes(' game') || lowerMessage.includes(' platform') ||
     lowerMessage.includes(' page') || lowerMessage.includes(' site'))
  );
  // Don't match if it's specifically a mobile request (handled below)
  const isMobileRequest = lowerMessage.includes('mobile') || lowerMessage.includes('ios') ||
    lowerMessage.includes('android') || lowerMessage.includes('react native') || lowerMessage.includes('expo');

  if (isNewAppRequest && !isMobileRequest) {
    return createCompleteAppExample;
  }

  // Mobile app development
  if (
    lowerMessage.includes('mobile app') ||
    lowerMessage.includes('phone app') ||
    lowerMessage.includes('ios app') ||
    lowerMessage.includes('android app') ||
    lowerMessage.includes('react native') ||
    lowerMessage.includes('expo') ||
    (lowerMessage.includes('mobile') && (lowerMessage.includes('build') || lowerMessage.includes('create') || lowerMessage.includes('make')))
  ) {
    return createMobileAppExample;
  }

  // Error fixing scenarios
  if (lowerMessage.includes('fix') || lowerMessage.includes('error')) {
    if (
      lowerMessage.includes('cannot find module') ||
      lowerMessage.includes('failed to resolve import') ||
      lowerMessage.includes('module not found')
    ) {
      return fixMissingDependencyExample;
    }
    if (
      lowerMessage.includes('is not defined') ||
      lowerMessage.includes('react is not defined')
    ) {
      return fixReactNotDefinedExample;
    }
    // Generic error - use dependency example as it shows the explore pattern
    return fixMissingDependencyExample;
  }

  // Form creation - show accessible form example
  if (
    lowerMessage.includes('form') ||
    lowerMessage.includes('contact') ||
    lowerMessage.includes('input') ||
    lowerMessage.includes('signup') ||
    lowerMessage.includes('login')
  ) {
    return createFormExample;
  }

  // Modal/dialog creation - show accessible modal example
  if (
    lowerMessage.includes('modal') ||
    lowerMessage.includes('dialog') ||
    lowerMessage.includes('popup') ||
    lowerMessage.includes('overlay')
  ) {
    return createModalExample;
  }

  // Navigation/header - show responsive nav example
  if (
    lowerMessage.includes('nav') ||
    lowerMessage.includes('header') ||
    lowerMessage.includes('menu') ||
    lowerMessage.includes('navbar')
  ) {
    return createNavigationExample;
  }

  // Component creation - show high-quality component example
  if (
    lowerMessage.includes('component') ||
    lowerMessage.includes('card') ||
    lowerMessage.includes('profile') ||
    lowerMessage.includes('user')
  ) {
    return createComponentExample;
  }

  // Table/list creation - show data table example
  if (
    lowerMessage.includes('table') ||
    lowerMessage.includes('list') ||
    lowerMessage.includes('data') ||
    lowerMessage.includes('grid')
  ) {
    return createDataTableExample;
  }

  // Feature addition - show exploration pattern
  if (
    lowerMessage.includes('add') ||
    lowerMessage.includes('implement') ||
    lowerMessage.includes('theme') ||
    lowerMessage.includes('dark mode')
  ) {
    return addFeatureExample;
  }

  // Default: no few-shot (let system prompt guide)
  return [];
}

/**
 * Get quality guidance based on the type of request
 */
function getQualityGuidance(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  // New app generation quality guidance
  const isNewApp = (
    (lowerMessage.includes('build') || lowerMessage.includes('create') || lowerMessage.includes('make') || lowerMessage.includes('generate')) &&
    (lowerMessage.includes(' app') || lowerMessage.includes(' website') || lowerMessage.includes(' dashboard') ||
     lowerMessage.includes(' tool') || lowerMessage.includes(' calculator') || lowerMessage.includes(' tracker') ||
     lowerMessage.includes(' manager') || lowerMessage.includes(' game') || lowerMessage.includes(' platform') ||
     lowerMessage.includes(' page') || lowerMessage.includes(' site'))
  );

  if (isNewApp && !lowerMessage.includes('mobile') && !lowerMessage.includes('react native')) {
    return `NEW APP GENERATION QUALITY REQUIREMENTS:
- Create package.json FIRST with ALL dependencies listed
- Default stack: Vite + React + TypeScript + Tailwind CSS
- All imports must resolve to a file you create or a package in package.json
- Use HashRouter for routing (not BrowserRouter)
- Professional UI with Tailwind: gradients, shadows, rounded corners, transitions
- Include proper folder structure (src/components/, src/hooks/, etc. for complex apps)
- End with: npm install && npm run dev
- COMPLETE code only — every component fully implemented, no stubs`;
  }

  if (
    lowerMessage.includes('mobile app') ||
    lowerMessage.includes('phone app') ||
    lowerMessage.includes('react native') ||
    lowerMessage.includes('expo')
  ) {
    return `MOBILE APP QUALITY REQUIREMENTS:
- Use React Native components only (View, Text, ScrollView, etc.) - NO HTML elements
- Use StyleSheet.create() for all styling - NO CSS/Tailwind classes
- Use SafeAreaView for proper notch/safe area handling
- Use expo-router for navigation
- Include loading and empty states
- Use FlatList for scrollable lists (not ScrollView with map)
- Handle both iOS and Android platform differences`;
  }

  if (lowerMessage.includes('form') || lowerMessage.includes('input')) {
    return `FORM QUALITY REQUIREMENTS:
- Include proper labels with htmlFor
- Add validation with error messages
- Include loading state on submit
- Use controlled inputs with onChange
- Add aria-invalid and aria-describedby for accessibility`;
  }

  if (lowerMessage.includes('table') || lowerMessage.includes('list')) {
    return `TABLE QUALITY REQUIREMENTS:
- Include loading skeleton state
- Add empty state message
- Implement sorting if applicable
- Add pagination for large datasets
- Include row hover effects`;
  }

  if (lowerMessage.includes('modal') || lowerMessage.includes('dialog')) {
    return `MODAL QUALITY REQUIREMENTS:
- Close on Escape key press
- Close on backdrop click
- Trap focus within modal
- Add proper ARIA attributes
- Include smooth enter/exit animations`;
  }

  if (
    lowerMessage.includes('button') ||
    lowerMessage.includes('click') ||
    lowerMessage.includes('action')
  ) {
    return `BUTTON QUALITY REQUIREMENTS:
- Include hover and active states
- Add focus ring for accessibility
- Support disabled state
- Include loading spinner option
- Use semantic button element`;
  }

  return `GENERAL QUALITY REQUIREMENTS:
- All TypeScript types defined
- Loading states for async operations
- Error handling with user feedback
- Accessibility (ARIA labels, keyboard nav)
- Responsive design (mobile-first)
- Dark mode support`;
}

/**
 * Convert few-shot examples to message format for API
 */
export function injectFewShotExamples(
  messages: Array<{ role: string; content: string }>,
  userMessage: string
): Array<{ role: string; content: string }> {
  const examples = getFewShotExamples(userMessage);
  const qualityGuidance = getQualityGuidance(userMessage);

  // Always inject quality guidance even if no examples
  const qualityMessage = {
    role: 'system',
    content: qualityGuidance,
  };

  if (examples.length === 0) {
    // Just add quality guidance
    const systemMessages = messages.filter(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    return [...systemMessages, qualityMessage, ...otherMessages];
  }

  // Insert examples at the beginning (after system message if present)
  const systemMessages = messages.filter(m => m.role === 'system');
  const otherMessages = messages.filter(m => m.role !== 'system');

  return [
    ...systemMessages,
    qualityMessage,
    // Add a context message explaining the examples
    {
      role: 'system',
      content: `Here's an example of LOVABLE-QUALITY code generation. Follow this pattern for production-ready results:`,
    },
    ...examples,
    {
      role: 'system',
      content: `Now handle the user's actual request with the SAME QUALITY LEVEL. Generate COMPLETE, BEAUTIFUL, PRODUCTION-READY code with:
- All TypeScript types
- Loading states
- Error handling
- Beautiful Tailwind styling
- Dark mode support
- Accessibility features`,
    },
    ...otherMessages,
  ];
}
