"use client";

import { useState } from "react";
import {
  Search,
  Filter,
  Star,
  Eye,
  Download,
  Copy,
  Code,
  Globe,
  Database,
  Smartphone,
  Zap,
  ShoppingCart,
  Users,
  FileText,
  Image,
  Activity,
  Calendar,
  MessageSquare,
  Play,
  Rocket,
} from "lucide-react";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  framework: string;
  complexity: "beginner" | "intermediate" | "advanced";
  featured: boolean;
  stars: number;
  downloads: number;
  preview: string;
  code: string;
  author: string;
  createdAt: string;
  dependencies: string[];
  features: string[];
  useCase: string;
}

const CATEGORIES = [
  { id: "all", name: "All Templates", icon: Globe },
  { id: "dashboard", name: "Dashboards", icon: Activity },
  { id: "ecommerce", name: "E-commerce", icon: ShoppingCart },
  { id: "auth", name: "Authentication", icon: Users },
  { id: "landing", name: "Landing Pages", icon: Rocket },
  { id: "blog", name: "Blog & CMS", icon: FileText },
  { id: "mobile", name: "Mobile Apps", icon: Smartphone },
  { id: "api", name: "APIs & Backend", icon: Database },
  { id: "components", name: "Components", icon: Code },
  { id: "tools", name: "Tools & Utilities", icon: Zap },
];

const SAMPLE_TEMPLATES: Template[] = [
  {
    id: "modern-dashboard",
    name: "Modern Analytics Dashboard",
    description: "A comprehensive dashboard with charts, metrics, and real-time data visualization",
    category: "dashboard",
    tags: ["react", "charts", "analytics", "typescript"],
    framework: "React + TypeScript",
    complexity: "intermediate",
    featured: true,
    stars: 284,
    downloads: 1250,
    preview: "/templates/dashboard-preview.png",
    code: `import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Jan', users: 4000, revenue: 2400 },
  { name: 'Feb', users: 3000, revenue: 1398 },
  { name: 'Mar', users: 2000, revenue: 9800 },
];

export default function Dashboard() {
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-8">Analytics Dashboard</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Total Users</h3>
          <p className="text-3xl font-bold text-blue-600">24,057</p>
          <p className="text-sm text-green-600">+12% from last month</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Revenue</h3>
          <p className="text-3xl font-bold text-green-600">$45,231</p>
          <p className="text-sm text-green-600">+8% from last month</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Conversion</h3>
          <p className="text-3xl font-bold text-purple-600">3.2%</p>
          <p className="text-sm text-red-600">-2% from last month</p>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-xl font-semibold mb-4">Monthly Overview</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="users" fill="#3B82F6" />
            <Bar dataKey="revenue" fill="#10B981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}`,
    author: "Recoder Team",
    createdAt: "2024-01-15",
    dependencies: ["react", "recharts", "typescript", "tailwindcss"],
    features: ["Real-time data", "Interactive charts", "Responsive design", "TypeScript"],
    useCase: "Analytics dashboards, admin panels, business intelligence",
  },
  {
    id: "ecommerce-store",
    name: "Modern E-commerce Store",
    description: "Full-featured e-commerce store with product catalog, cart, and checkout",
    category: "ecommerce",
    tags: ["react", "stripe", "nextjs", "ecommerce"],
    framework: "Next.js + TypeScript",
    complexity: "advanced",
    featured: true,
    stars: 457,
    downloads: 2100,
    preview: "/templates/ecommerce-preview.png",
    code: `import React, { useState } from 'react';
import { ShoppingCart, Heart, Star } from 'lucide-react';

const products = [
  {
    id: 1,
    name: "Premium Headphones",
    price: 299,
    image: "/api/placeholder/300/300",
    rating: 4.8,
    reviews: 124,
  },
  {
    id: 2,
    name: "Wireless Speaker",
    price: 199,
    image: "/api/placeholder/300/300",
    rating: 4.6,
    reviews: 89,
  },
];

export default function EcommerceStore() {
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);

  const addToCart = (product) => {
    setCart([...cart, product]);
  };

  const toggleWishlist = (productId) => {
    setWishlist(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">TechStore</h1>
        <div className="flex items-center gap-4">
          <button className="relative p-2">
            <ShoppingCart className="w-6 h-6" />
            {cart.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {cart.length}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map(product => (
          <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="relative">
              <img 
                src={product.image} 
                alt={product.name}
                className="w-full h-48 object-cover"
              />
              <button
                onClick={() => toggleWishlist(product.id)}
                className="absolute top-2 right-2 p-2 bg-white rounded-full shadow"
              >
                <Heart 
                  className={\`w-5 h-5 \${wishlist.includes(product.id) ? 'fill-red-500 text-red-500' : 'text-gray-400'}\`}
                />
              </button>
            </div>
            
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-2">{product.name}</h3>
              
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={\`w-4 h-4 \${i < Math.floor(product.rating) ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}\`}
                    />
                  ))}
                </div>
                <span className="text-sm text-gray-600">
                  {product.rating} ({product.reviews} reviews)
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold text-green-600">
                  \${product.price}
                </span>
                <button
                  onClick={() => addToCart(product)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                >
                  <ShoppingCart className="w-4 h-4" />
                  Add to Cart
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {cart.length > 0 && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white p-4 rounded-lg shadow-lg">
          <p className="font-semibold">Cart Updated!</p>
          <p className="text-sm">{cart.length} items in cart</p>
        </div>
      )}
    </div>
  );
}`,
    author: "Commerce Pro",
    createdAt: "2024-01-10",
    dependencies: ["react", "nextjs", "stripe", "tailwindcss", "lucide-react"],
    features: ["Product catalog", "Shopping cart", "Wishlist", "Responsive design", "Payment integration"],
    useCase: "Online stores, marketplace, product catalogs",
  },
  {
    id: "auth-system",
    name: "Complete Authentication System",
    description: "Full authentication system with login, register, password reset, and protected routes",
    category: "auth",
    tags: ["react", "nextauth", "typescript", "prisma"],
    framework: "Next.js + NextAuth",
    complexity: "intermediate",
    featured: false,
    stars: 189,
    downloads: 890,
    preview: "/templates/auth-preview.png",
    code: `import React, { useState } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { Eye, EyeOff, Github, Mail } from 'lucide-react';

export default function AuthSystem() {
  const { data: session, status } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await signIn('credentials', {
      email: formData.email,
      password: formData.password,
      callbackUrl: '/dashboard',
    });
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
          <div className="text-center mb-6">
            <img
              src={session.user?.image || '/default-avatar.png'}
              alt="Profile"
              className="w-20 h-20 rounded-full mx-auto mb-4"
            />
            <h2 className="text-2xl font-bold text-gray-900">
              Welcome, {session.user?.name}!
            </h2>
            <p className="text-gray-600">{session.user?.email}</p>
          </div>
          
          <div className="space-y-4">
            <button className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700">
              Go to Dashboard
            </button>
            <button
              onClick={() => signOut()}
              className="w-full bg-gray-200 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-300"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Sign In</h1>
          <p className="text-gray-600 mt-2">Welcome back! Please sign in to your account.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 font-medium"
          >
            Sign In
          </button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => signIn('github')}
              className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              <Github className="w-5 h-5" />
            </button>
            <button
              onClick={() => signIn('google')}
              className="w-full inline-flex justify-center py-2 px-4 border border-gray-300 rounded-lg shadow-sm bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              <Mail className="w-5 h-5" />
            </button>
          </div>
        </div>

        <p className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{' '}
          <a href="/register" className="font-medium text-blue-600 hover:text-blue-500">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}`,
    author: "Auth Expert",
    createdAt: "2024-01-08",
    dependencies: ["react", "next-auth", "typescript", "tailwindcss", "prisma"],
    features: ["OAuth providers", "Protected routes", "Session management", "Password reset", "User profiles"],
    useCase: "User authentication, secure applications, member portals",
  },
];

interface TemplateGalleryProps {
  onTemplateSelect: (template: Template) => void;
  onTemplateUse: (template: Template) => void;
}

export default function TemplateGallery({ onTemplateSelect, onTemplateUse }: TemplateGalleryProps) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"popular" | "recent" | "name">("popular");
  const [complexityFilter, setComplexityFilter] = useState<string>("all");

  const filteredTemplates = SAMPLE_TEMPLATES.filter(template => {
    const matchesCategory = selectedCategory === "all" || template.category === selectedCategory;
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesComplexity = complexityFilter === "all" || template.complexity === complexityFilter;
    
    return matchesCategory && matchesSearch && matchesComplexity;
  }).sort((a, b) => {
    switch (sortBy) {
      case "popular":
        return b.stars - a.stars;
      case "recent":
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case "name":
        return a.name.localeCompare(b.name);
      default:
        return 0;
    }
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Template Gallery</h1>
        <p className="text-xl text-gray-600">
          Jumpstart your development with production-ready templates
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="popular">Most Popular</option>
            <option value="recent">Most Recent</option>
            <option value="name">Name A-Z</option>
          </select>

          {/* Complexity Filter */}
          <select
            value={complexityFilter}
            onChange={(e) => setComplexityFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Levels</option>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      <div className="flex gap-8">
        {/* Categories Sidebar */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sticky top-4">
            <h3 className="font-semibold text-gray-900 mb-4">Categories</h3>
            <div className="space-y-2">
              {CATEGORIES.map(category => {
                const Icon = category.icon;
                const isActive = selectedCategory === category.id;
                
                return (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                      isActive 
                        ? "bg-blue-100 text-blue-700" 
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{category.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Templates Grid */}
        <div className="flex-1">
          {filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <Code className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
              <p className="text-gray-600">Try adjusting your search or filters</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTemplates.map(template => (
                <div
                  key={template.id}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Template Preview */}
                  <div className="aspect-video bg-gradient-to-br from-blue-50 to-purple-50 flex items-center justify-center relative">
                    <div className="text-center">
                      <Code className="w-12 h-12 text-blue-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-600">{template.framework}</p>
                    </div>
                    {template.featured && (
                      <div className="absolute top-2 left-2 bg-yellow-400 text-yellow-900 px-2 py-1 rounded-full text-xs font-medium">
                        Featured
                      </div>
                    )}
                    <div className={`absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium ${
                      template.complexity === 'beginner' ? 'bg-green-100 text-green-700' :
                      template.complexity === 'intermediate' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {template.complexity}
                    </div>
                  </div>

                  {/* Template Info */}
                  <div className="p-4">
                    <h3 className="font-semibold text-lg text-gray-900 mb-2">{template.name}</h3>
                    <p className="text-gray-600 text-sm mb-3 line-clamp-2">{template.description}</p>

                    {/* Tags */}
                    <div className="flex flex-wrap gap-1 mb-3">
                      {template.tags.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs"
                        >
                          {tag}
                        </span>
                      ))}
                      {template.tags.length > 3 && (
                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                          +{template.tags.length - 3}
                        </span>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3" />
                          <span>{template.stars}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          <span>{template.downloads}</span>
                        </div>
                      </div>
                      <span className="text-xs">by {template.author}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => onTemplateSelect(template)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                      >
                        <Eye className="w-4 h-4" />
                        Preview
                      </button>
                      <button
                        onClick={() => onTemplateUse(template)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                      >
                        <Play className="w-4 h-4" />
                        Use Template
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}