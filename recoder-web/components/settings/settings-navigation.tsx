"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import {
  User, Shield, Bell, Users, Key, Globe,
  Settings, ChevronRight, ChevronLeft,
  Menu, X, Home, CreditCard, Zap,
  Activity, Database, Webhook, Mail,
  Smartphone, Lock, Eye, BarChart3,
  Code, Briefcase, HelpCircle, ExternalLink
} from "lucide-react";

interface NavigationItem {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  isPro?: boolean;
  isNew?: boolean;
}

interface NavigationSection {
  id: string;
  name: string;
  items: NavigationItem[];
}

interface SettingsNavigationProps {
  collapsed?: boolean;
  onCollapse?: (collapsed: boolean) => void;
  showMobileMenu?: boolean;
  onMobileMenuToggle?: (show: boolean) => void;
}

export function SettingsNavigation({ 
  collapsed = false, 
  onCollapse,
  showMobileMenu = false,
  onMobileMenuToggle 
}: SettingsNavigationProps) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>(["account", "security"]);

  const navigationSections: NavigationSection[] = [
    {
      id: "account",
      name: "Account",
      items: [
        {
          id: "profile",
          name: "Profile",
          description: "Manage your personal information",
          href: "/settings/account",
          icon: User,
        },
        {
          id: "notifications",
          name: "Notifications",
          description: "Configure how you receive notifications",
          href: "/settings/notifications",
          icon: Bell,
          badge: 3, // Number of unread notifications
        },
        {
          id: "preferences",
          name: "Preferences", 
          description: "Customize your experience",
          href: "/settings/preferences",
          icon: Settings,
        },
      ]
    },
    {
      id: "security",
      name: "Security & Privacy",
      items: [
        {
          id: "security",
          name: "Security",
          description: "Password, 2FA, and security settings",
          href: "/settings/security",
          icon: Shield,
        },
        {
          id: "privacy",
          name: "Privacy",
          description: "Control your data and privacy",
          href: "/settings/privacy", 
          icon: Eye,
        },
        {
          id: "sessions",
          name: "Sessions",
          description: "Manage your active sessions",
          href: "/settings/sessions",
          icon: Activity,
        },
      ]
    },
    {
      id: "development",
      name: "Development",
      items: [
        {
          id: "api-keys",
          name: "API Keys",
          description: "Manage your API access keys",
          href: "/settings/api-keys",
          icon: Key,
        },
        {
          id: "integrations",
          name: "Integrations",
          description: "Connect third-party services",
          href: "/settings/integrations",
          icon: Globe,
        },
        {
          id: "webhooks",
          name: "Webhooks",
          description: "Configure webhook endpoints",
          href: "/settings/webhooks",
          icon: Webhook,
        },
      ]
    },
    {
      id: "team",
      name: "Team & Billing",
      items: [
        {
          id: "team",
          name: "Team",
          description: "Manage team members and permissions",
          href: "/settings/team", 
          icon: Users,
          badge: user?.email === "admin@recoder.xyz" ? "ADMIN" : undefined,
        },
        {
          id: "billing",
          name: "Billing",
          description: "Subscription and payment methods",
          href: "/settings/billing",
          icon: CreditCard,
        },
        {
          id: "usage",
          name: "Usage", 
          description: "Monitor your usage and limits",
          href: "/settings/usage",
          icon: BarChart3,
        },
      ]
    },
    {
      id: "advanced",
      name: "Advanced",
      items: [
        {
          id: "developer",
          name: "Developer Settings",
          description: "Advanced developer options",
          href: "/settings/developer",
          icon: Code,
          isPro: true,
        },
        {
          id: "enterprise",
          name: "Enterprise",
          description: "Enterprise features and settings",
          href: "/settings/enterprise", 
          icon: Briefcase,
          isPro: true,
        },
        {
          id: "labs",
          name: "Labs",
          description: "Experimental features",
          href: "/settings/labs",
          icon: Zap,
          isNew: true,
        },
      ]
    },
    {
      id: "support",
      name: "Support",
      items: [
        {
          id: "help",
          name: "Help & Support",
          description: "Documentation and help resources",
          href: "/settings/help",
          icon: HelpCircle,
        },
        {
          id: "feedback",
          name: "Send Feedback",
          description: "Help us improve the platform",
          href: "/settings/feedback",
          icon: Mail,
        },
      ]
    }
  ];

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => 
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const isActive = (href: string) => {
    if (href === "/settings" && pathname === "/settings") return true;
    if (href !== "/settings" && pathname?.startsWith(href)) return true;
    return false;
  };

  const NavigationContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <Link 
            href="/dashboard"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <Home className="w-4 h-4" />
            {!collapsed && <span className="text-sm">Back to Dashboard</span>}
          </Link>
          
          {!collapsed && onCollapse && (
            <button
              onClick={() => onCollapse(true)}
              className="p-1 text-gray-400 hover:text-gray-600 lg:block hidden"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {!collapsed && (
          <div className="mt-3">
            <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-600">Manage your account and preferences</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto py-4">
        <nav className="space-y-1">
          {navigationSections.map((section) => (
            <div key={section.id}>
              {/* Section Header */}
              <button
                onClick={() => !collapsed && toggleSection(section.id)}
                className={`w-full px-4 py-2 text-left flex items-center justify-between text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700 ${
                  collapsed ? "justify-center" : ""
                }`}
              >
                {!collapsed && <span>{section.name}</span>}
                {!collapsed && (
                  <ChevronRight 
                    className={`w-3 h-3 transition-transform ${
                      expandedSections.includes(section.id) ? "rotate-90" : ""
                    }`} 
                  />
                )}
              </button>

              {/* Section Items */}
              {(collapsed || expandedSections.includes(section.id)) && (
                <div className={`space-y-1 ${collapsed ? "" : "ml-2"}`}>
                  {section.items.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                        isActive(item.href)
                          ? "bg-indigo-50 text-indigo-700 border-r-2 border-indigo-700"
                          : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                      } ${collapsed ? "justify-center" : ""}`}
                      title={collapsed ? item.name : undefined}
                    >
                      <item.icon className={`flex-shrink-0 ${
                        isActive(item.href) ? "text-indigo-500" : "text-gray-400 group-hover:text-gray-500"
                      } ${collapsed ? "w-5 h-5" : "w-4 h-4 mr-3"}`} />
                      
                      {!collapsed && (
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="truncate">{item.name}</span>
                            <div className="flex items-center gap-1">
                              {item.isNew && (
                                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                                  NEW
                                </span>
                              )}
                              {item.isPro && (
                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium">
                                  PRO
                                </span>
                              )}
                              {typeof item.badge === "number" && item.badge > 0 && (
                                <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">
                                  {item.badge}
                                </span>
                              )}
                              {typeof item.badge === "string" && (
                                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium">
                                  {item.badge}
                                </span>
                              )}
                            </div>
                          </div>
                          {item.description && (
                            <p className="text-xs text-gray-500 mt-0.5 truncate">
                              {item.description}
                            </p>
                          )}
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        {collapsed ? (
          <button
            onClick={() => onCollapse?.(false)}
            className="w-full p-2 text-gray-400 hover:text-gray-600 flex justify-center"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Storage</span>
              <span>2.1 GB / 5 GB</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: '42%' }}></div>
            </div>
            
            <div className="pt-2">
              <Link
                href="/settings/billing"
                className="flex items-center justify-between w-full p-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg"
              >
                <span>Upgrade Plan</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={`hidden lg:block bg-white border-r border-gray-200 transition-all duration-300 ${
        collapsed ? "w-16" : "w-80"
      }`}>
        <NavigationContent />
      </div>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div className="lg:hidden fixed inset-0 z-50 bg-gray-600 bg-opacity-75">
          <div className="fixed inset-y-0 left-0 flex max-w-xs w-full">
            <div className="flex flex-col flex-1 bg-white">
              {/* Mobile Header */}
              <div className="p-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
                  <button
                    onClick={() => onMobileMenuToggle?.(false)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-1">Manage your account and preferences</p>
              </div>
              
              <NavigationContent />
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu Button */}
      <button
        onClick={() => onMobileMenuToggle?.(!showMobileMenu)}
        className="lg:hidden fixed top-4 left-4 z-40 p-2 bg-white border border-gray-300 rounded-lg shadow-sm"
      >
        <Menu className="w-5 h-5" />
      </button>
    </>
  );
}