'use client';

import { Smartphone, Download, Star, Play, Apple, Monitor, Tablet, Zap, Shield, RotateCcw } from 'lucide-react';

// Simple button component for this page
const Button = ({ children, className = '', size = 'md', ...props }: any) => {
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  
  return (
    <button 
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default function MobileAppPage() {
  const features = [
    {
      icon: Zap,
      title: "Lightning Fast Performance",
      description: "Native performance with instant code compilation and real-time collaboration features."
    },
    {
      icon: RotateCcw,
      title: "Seamless Sync",
      description: "All your projects, files, and settings sync automatically across all your devices."
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Bank-level encryption and security protocols to keep your code safe on mobile."
    },
    {
      icon: Monitor,
      title: "Multi-Device Workflow",
      description: "Start coding on desktop, continue on tablet, and review on your phone seamlessly."
    }
  ];

  const screenshots = [
    {
      title: "Code Editor",
      description: "Full-featured IDE with syntax highlighting and intelligent autocomplete",
      image: "/mobile/screenshot-editor.png"
    },
    {
      title: "Project Dashboard",
      description: "Manage all your projects and collaborate with team members",
      image: "/mobile/screenshot-dashboard.png"
    },
    {
      title: "File Explorer",
      description: "Navigate your project structure with ease on any screen size",
      image: "/mobile/screenshot-files.png"
    },
    {
      title: "Team Chat",
      description: "Stay connected with your team and get real-time notifications",
      image: "/mobile/screenshot-chat.png"
    }
  ];

  const testimonials = [
    {
      name: "Alex Chen",
      role: "Full Stack Developer",
      company: "TechCorp",
      avatar: "/avatars/alex.jpg",
      quote: "The mobile app is a game-changer. I can review code and make quick fixes during my commute.",
      rating: 5
    },
    {
      name: "Sarah Kim",
      role: "Product Manager",
      company: "StartupXYZ",
      avatar: "/avatars/sarah.jpg",
      quote: "Perfect for reviewing pull requests on the go. The interface is surprisingly intuitive for mobile.",
      rating: 5
    },
    {
      name: "Michael Rodriguez",
      role: "DevOps Engineer",
      company: "CloudScale",
      avatar: "/avatars/michael.jpg",
      quote: "Being able to monitor deployments and fix issues from my phone has saved our team countless hours.",
      rating: 5
    }
  ];

  const systemRequirements = {
    ios: {
      version: "iOS 14.0 or later",
      devices: ["iPhone 8 and newer", "iPad (6th generation) and newer", "iPad Pro", "iPad Air (3rd generation) and newer"],
      storage: "500 MB available space"
    },
    android: {
      version: "Android 8.0 (API level 26) or higher",
      devices: ["Any Android device with 3GB RAM or more"],
      storage: "500 MB available space"
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
                Code Anywhere, Anytime
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                Take your development workflow mobile with Recoder.xyz apps for iOS and Android. Full IDE features, team collaboration, and enterprise security in your pocket.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Button size="lg" className="bg-black hover:bg-gray-800 text-white flex items-center">
                  <Apple className="mr-2 h-5 w-5" />
                  Download for iOS
                </Button>
                <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white flex items-center">
                  <Play className="mr-2 h-5 w-5" />
                  Get it on Google Play
                </Button>
              </div>
              <div className="flex items-center space-x-6 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-center">
                  <Star className="h-4 w-4 text-yellow-500 mr-1" />
                  <span className="font-semibold mr-1">4.8</span>
                  <span>App Store</span>
                </div>
                <div className="flex items-center">
                  <Star className="h-4 w-4 text-yellow-500 mr-1" />
                  <span className="font-semibold mr-1">4.7</span>
                  <span>Google Play</span>
                </div>
                <div>
                  <span className="font-semibold">1M+</span> downloads
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="relative z-10">
                <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-3xl p-8 text-white shadow-2xl transform rotate-3">
                  <Smartphone className="h-16 w-16 mb-4" />
                  <h3 className="text-xl font-bold mb-2">Mobile-First Development</h3>
                  <p className="text-blue-100">Designed specifically for touch interfaces and mobile workflows</p>
                </div>
              </div>
              <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl transform -rotate-6">
                <div className="w-8 h-8 bg-green-500 rounded-full mb-3"></div>
                <div className="space-y-2">
                  <div className="w-20 h-2 bg-gray-200 dark:bg-gray-600 rounded"></div>
                  <div className="w-16 h-2 bg-gray-200 dark:bg-gray-600 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Why Choose Recoder Mobile?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="text-center">
                <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <feature.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            App Screenshots
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {screenshots.map((screenshot, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <div className="aspect-[9/16] bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                  <Smartphone className="h-24 w-24 text-gray-400" />
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-2">{screenshot.title}</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">{screenshot.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            What Developers Say
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-4">
                    <span className="text-white font-bold">
                      {testimonial.name.split(' ').map(n => n[0]).join('')}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900 dark:text-white">{testimonial.name}</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-sm">{testimonial.role} at {testimonial.company}</p>
                  </div>
                </div>
                <div className="flex mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-500 fill-current" />
                  ))}
                </div>
                <blockquote className="text-gray-600 dark:text-gray-300 italic">
                  "{testimonial.quote}"
                </blockquote>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* System Requirements */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            System Requirements
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* iOS Requirements */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
              <div className="flex items-center mb-6">
                <Apple className="h-8 w-8 text-gray-600 dark:text-gray-300 mr-3" />
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">iOS Requirements</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Minimum Version</h4>
                  <p className="text-gray-600 dark:text-gray-300">{systemRequirements.ios.version}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Compatible Devices</h4>
                  <ul className="text-gray-600 dark:text-gray-300 space-y-1">
                    {systemRequirements.ios.devices.map((device, index) => (
                      <li key={index}>• {device}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Storage</h4>
                  <p className="text-gray-600 dark:text-gray-300">{systemRequirements.ios.storage}</p>
                </div>
              </div>
              <Button className="w-full mt-6 bg-black hover:bg-gray-800 text-white">
                <Apple className="mr-2 h-5 w-5" />
                Download for iOS
              </Button>
            </div>

            {/* Android Requirements */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
              <div className="flex items-center mb-6">
                <Play className="h-8 w-8 text-green-600 mr-3" />
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Android Requirements</h3>
              </div>
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Minimum Version</h4>
                  <p className="text-gray-600 dark:text-gray-300">{systemRequirements.android.version}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Compatible Devices</h4>
                  <ul className="text-gray-600 dark:text-gray-300 space-y-1">
                    {systemRequirements.android.devices.map((device, index) => (
                      <li key={index}>• {device}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-2">Storage</h4>
                  <p className="text-gray-600 dark:text-gray-300">{systemRequirements.android.storage}</p>
                </div>
              </div>
              <Button className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white">
                <Play className="mr-2 h-5 w-5" />
                Get it on Google Play
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Device Compatibility */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
            Works on All Your Devices
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-12 max-w-3xl mx-auto">
            Seamlessly transition between your phone, tablet, and desktop. Your projects and progress sync automatically across all devices.
          </p>
          <div className="flex justify-center items-center space-x-8 mb-12">
            <div className="text-center">
              <Smartphone className="h-16 w-16 text-blue-600 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">Phone</p>
            </div>
            <div className="text-center">
              <Tablet className="h-16 w-16 text-purple-600 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">Tablet</p>
            </div>
            <div className="text-center">
              <Monitor className="h-16 w-16 text-green-600 mx-auto mb-2" />
              <p className="text-gray-600 dark:text-gray-400 font-medium">Desktop</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Start Coding on the Go</h2>
          <p className="text-xl text-blue-100 mb-8">
            Join millions of developers who code anywhere, anytime with Recoder.xyz mobile apps.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-black hover:bg-gray-800 text-white">
              <Apple className="mr-2 h-5 w-5" />
              Download for iOS
            </Button>
            <Button size="lg" className="bg-green-600 hover:bg-green-700 text-white">
              <Play className="mr-2 h-5 w-5" />
              Get it on Google Play
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
