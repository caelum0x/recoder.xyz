// Admin Mobile Development Page - Mobile app development platform management
import { Metadata } from 'next';
import MobileDevelopmentDashboard from '@/components/admin/mobile-development-dashboard';

export const metadata: Metadata = {
  title: 'Mobile Development Platform - Admin | Recoder.xyz',
  description: 'Comprehensive mobile app development platform with React Native, Flutter, Expo, and Ionic. Create, build, and deploy native mobile applications with advanced features and integrations.',
  keywords: 'mobile development, React Native, Flutter, Expo, Ionic, iOS, Android, native apps, mobile platform, app builder',
};

export default function AdminMobilePage() {
  return (
    <div className="container mx-auto py-6">
      <MobileDevelopmentDashboard />
    </div>
  );
}