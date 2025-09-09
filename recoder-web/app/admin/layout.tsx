import React from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { 
  LayoutDashboard, DollarSign, Users, CreditCard, Activity, 
  Zap, Settings, Shield, Database, BarChart3, Bell, FileText
} from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar Navigation */}
        <div className="w-64 bg-white shadow-sm border-r min-h-screen">
          <div className="p-6">
            <div className="flex items-center space-x-2">
              <Shield className="h-8 w-8 text-blue-600" />
              <h2 className="text-xl font-bold">Admin Portal</h2>
            </div>
          </div>
          
          <nav className="px-4 space-y-2">
            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Dashboard
              </p>
              <Link href="/admin/dashboard">
                <Button variant="ghost" className="w-full justify-start">
                  <LayoutDashboard className="h-4 w-4 mr-3" />
                  Overview
                </Button>
              </Link>
            </div>

            <Separator className="my-4" />

            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Analytics
              </p>
              <Link href="/admin/revenue">
                <Button variant="ghost" className="w-full justify-start">
                  <DollarSign className="h-4 w-4 mr-3" />
                  Revenue Analytics
                </Button>
              </Link>
              <Link href="/admin/customers">
                <Button variant="ghost" className="w-full justify-start">
                  <Users className="h-4 w-4 mr-3" />
                  Customer LTV
                </Button>
              </Link>
              <Link href="/admin/subscriptions">
                <Button variant="ghost" className="w-full justify-start">
                  <CreditCard className="h-4 w-4 mr-3" />
                  Subscriptions
                </Button>
              </Link>
              <Link href="/admin/engagement">
                <Button variant="ghost" className="w-full justify-start">
                  <Activity className="h-4 w-4 mr-3" />
                  User Engagement
                </Button>
              </Link>
              <Link href="/admin/features">
                <Button variant="ghost" className="w-full justify-start">
                  <Zap className="h-4 w-4 mr-3" />
                  Feature Adoption
                </Button>
              </Link>
            </div>

            <Separator className="my-4" />

            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                System
              </p>
              <Link href="/admin/health">
                <Button variant="ghost" className="w-full justify-start">
                  <Database className="h-4 w-4 mr-3" />
                  System Health
                </Button>
              </Link>
              <Link href="/admin/alerts">
                <Button variant="ghost" className="w-full justify-start">
                  <Bell className="h-4 w-4 mr-3" />
                  Alerts
                </Button>
              </Link>
              <Link href="/admin/reports">
                <Button variant="ghost" className="w-full justify-start">
                  <FileText className="h-4 w-4 mr-3" />
                  Reports
                </Button>
              </Link>
            </div>

            <Separator className="my-4" />

            <div className="space-y-1">
              <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Settings
              </p>
              <Link href="/admin/settings">
                <Button variant="ghost" className="w-full justify-start">
                  <Settings className="h-4 w-4 mr-3" />
                  Admin Settings
                </Button>
              </Link>
            </div>
          </nav>

          {/* Quick Stats Card */}
          <div className="p-4 mt-8">
            <Card className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
              <div className="flex items-center space-x-3">
                <BarChart3 className="h-8 w-8 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-blue-900">System Status</p>
                  <p className="text-xs text-blue-700">All systems operational</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <main className="min-h-screen">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}