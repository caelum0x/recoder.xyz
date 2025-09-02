"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Smartphone, Tablet, Monitor, Zap, Hand } from "lucide-react";

// 📱 MOBILE-FIRST OPTIMIZATION COMPONENT - CURSOR KILLER FEATURE
// Provides touch-optimized interface that competitors don't have

interface MobileOptimizationsProps {
  children: React.ReactNode;
  className?: string;
}

export default function MobileOptimizations({ children, className = "" }: MobileOptimizationsProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [touchDevice, setTouchDevice] = useState(false);

  useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      setIsMobile(width < 768);
      setIsTablet(width >= 768 && width < 1024);
      setOrientation(height > width ? 'portrait' : 'landscape');
      setTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };

    checkDevice();
    window.addEventListener('resize', checkDevice);
    window.addEventListener('orientationchange', checkDevice);

    return () => {
      window.removeEventListener('resize', checkDevice);
      window.removeEventListener('orientationchange', checkDevice);
    };
  }, []);

  if (!isMobile && !isTablet && !touchDevice) {
    // Desktop experience - no modifications
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={`mobile-optimized ${className}`}>
      {/* Mobile Enhancement Banner */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white px-4 py-2 text-center text-sm font-medium shadow-lg">
        <div className="flex items-center justify-center gap-2">
          {isMobile && <Smartphone className="w-4 h-4" />}
          {isTablet && <Tablet className="w-4 h-4" />}
          {touchDevice && <Hand className="w-4 h-4" />}
          <span>
            📱 Mobile-Optimized AI Platform • Touch-Friendly Interface • {orientation === 'portrait' ? 'Portrait' : 'Landscape'} Mode
          </span>
        </div>
      </div>

      {/* Touch-Enhanced Content */}
      <div className="mobile-enhanced-content">
        {children}
      </div>

      {/* Mobile-Specific Enhancements */}
      <MobileEnhancements isMobile={isMobile} isTablet={isTablet} touchDevice={touchDevice} />
      
      {/* Mobile CSS Enhancements */}
      <style jsx global>{`
        .mobile-optimized {
          /* Touch-friendly sizing */
          --touch-target-size: 48px;
          --mobile-padding: 16px;
          --mobile-margin: 12px;
        }
        
        .mobile-optimized input[type="text"],
        .mobile-optimized input[type="email"],
        .mobile-optimized textarea,
        .mobile-optimized select,
        .mobile-optimized button {
          min-height: var(--touch-target-size);
          padding: 12px 16px;
          font-size: 16px; /* Prevents zoom on iOS */
          border-radius: 12px;
          touch-action: manipulation;
        }
        
        .mobile-optimized button {
          -webkit-tap-highlight-color: transparent;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .mobile-optimized button:active {
          transform: scale(0.98);
        }
        
        /* Mobile-specific spacing */
        @media (max-width: 768px) {
          .mobile-optimized .container {
            padding-left: var(--mobile-padding);
            padding-right: var(--mobile-padding);
          }
          
          .mobile-optimized .card {
            margin: var(--mobile-margin);
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          }
          
          .mobile-optimized h1 {
            font-size: 1.875rem;
            line-height: 1.2;
          }
          
          .mobile-optimized h2 {
            font-size: 1.5rem;
            line-height: 1.3;
          }
          
          .mobile-optimized p {
            font-size: 1rem;
            line-height: 1.6;
          }
        }
        
        /* Tablet-specific enhancements */
        @media (min-width: 768px) and (max-width: 1024px) {
          .mobile-optimized .grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
          }
        }
        
        /* Touch gesture improvements */
        .mobile-optimized {
          -webkit-overflow-scrolling: touch;
          scroll-behavior: smooth;
        }
        
        /* Prevent unwanted zoom/select on mobile */
        .mobile-optimized * {
          -webkit-touch-callout: none;
          -webkit-user-select: none;
          -khtml-user-select: none;
          -moz-user-select: none;
          -ms-user-select: none;
          user-select: none;
        }
        
        .mobile-optimized input,
        .mobile-optimized textarea {
          -webkit-user-select: text;
          -moz-user-select: text;
          -ms-user-select: text;
          user-select: text;
        }
        
        /* Loading states optimized for mobile */
        .mobile-optimized .loading-overlay {
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }
        
        /* Better scrolling experience */
        .mobile-optimized .scrollable {
          overflow: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
        }
        
        .mobile-optimized .scrollable::-webkit-scrollbar {
          width: 4px;
        }
        
        .mobile-optimized .scrollable::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.2);
          border-radius: 4px;
        }
      `}</style>
    </div>
  );
}

// Enhanced mobile-specific UI components
function MobileEnhancements({ isMobile, isTablet, touchDevice }: {
  isMobile: boolean;
  isTablet: boolean;
  touchDevice: boolean;
}) {
  const [showMobileFeatures, setShowMobileFeatures] = useState(false);

  if (!isMobile && !touchDevice) return null;

  return (
    <>
      {/* Floating Mobile Action Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <Button
          onClick={() => setShowMobileFeatures(!showMobileFeatures)}
          className="w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-xl hover:shadow-2xl transition-all duration-200 touch-manipulation"
        >
          <Zap className="w-6 h-6" />
        </Button>
      </div>

      {/* Mobile Features Panel */}
      {showMobileFeatures && (
        <div className="fixed inset-x-0 bottom-0 z-50 bg-white border-t-2 border-gray-100 shadow-2xl rounded-t-3xl p-6 animate-slide-up touch-manipulation">
          <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6"></div>
          
          <h3 className="text-lg font-bold text-gray-900 mb-4 text-center">
            📱 Mobile AI Features
            <Badge className="ml-2 bg-green-100 text-green-800 text-xs">
              TOUCH-OPTIMIZED
            </Badge>
          </h3>
          
          <div className="grid grid-cols-2 gap-4 mb-6">
            <Card className="p-4 text-center">
              <Smartphone className="w-8 h-8 mx-auto mb-2 text-blue-600" />
              <div className="text-sm font-semibold text-gray-700">Mobile UI</div>
              <div className="text-xs text-gray-500">Touch-friendly</div>
            </Card>
            
            <Card className="p-4 text-center">
              <Zap className="w-8 h-8 mx-auto mb-2 text-purple-600" />
              <div className="text-sm font-semibold text-gray-700">Fast AI</div>
              <div className="text-xs text-gray-500">Quick generation</div>
            </Card>
          </div>
          
          <div className="text-center space-y-3">
            <div className="text-sm text-gray-600">
              🎯 <strong>Cursor Killer Mobile</strong>: Full AI development platform optimized for {isMobile ? 'phones' : 'tablets'}
            </div>
            
            <Button
              onClick={() => setShowMobileFeatures(false)}
              className="w-full bg-gradient-to-r from-gray-400 to-gray-500 hover:from-gray-500 hover:to-gray-600 text-white font-semibold py-3 rounded-xl touch-manipulation"
            >
              Close Mobile Panel
            </Button>
          </div>
        </div>
      )}
      
      {/* Mobile Gesture Hints */}
      {isMobile && (
        <div className="fixed top-20 left-4 right-4 z-30 pointer-events-none">
          <div className="bg-black bg-opacity-70 text-white text-xs px-3 py-2 rounded-lg text-center animate-fade-in">
            💡 Tip: Tap and hold buttons for more options • Swipe for navigation
          </div>
        </div>
      )}
      
      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        
        .animate-fade-in {
          animation: fade-in 2s ease-out;
          animation-delay: 1s;
          animation-fill-mode: both;
        }
        
        .touch-manipulation {
          touch-action: manipulation;
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>
    </>
  );
}