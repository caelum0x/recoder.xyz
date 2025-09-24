"use client";

import { useState, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Target, Lightbulb, ArrowDown } from "lucide-react";

interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string; // CSS selector for the element to highlight
  position: "top" | "bottom" | "left" | "right" | "center";
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface FeatureTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
  steps?: TourStep[];
}

const defaultSteps: TourStep[] = [
  {
    id: "dashboard-overview",
    title: "Welcome to Your Dashboard! 📊",
    description: "This is your command center where you can see all your projects, usage stats, and quick actions.",
    target: ".dashboard-main",
    position: "center"
  },
  {
    id: "navigation",
    title: "Quick Navigation",
    description: "Use the top navigation to access different sections like Chat, Projects, and Settings.",
    target: "nav, .navbar, .navigation",
    position: "bottom"
  },
  {
    id: "stats-overview",
    title: "Usage Statistics",
    description: "Keep track of your API usage, projects, and subscription limits in real-time.",
    target: ".stats-card, .usage-stats, [data-tour='stats']",
    position: "top"
  },
  {
    id: "quick-actions",
    title: "Quick Actions",
    description: "Start a new chat, create a project, or access your most-used features with one click.",
    target: ".quick-actions, .action-buttons, [data-tour='actions']",
    position: "left"
  },
  {
    id: "recent-activity",
    title: "Recent Activity",
    description: "See your latest chats, projects, and activity to quickly pick up where you left off.",
    target: ".recent-activity, .recent-chats, [data-tour='recent']",
    position: "right"
  },
  {
    id: "help-center",
    title: "Need Help?",
    description: "Access documentation, keyboard shortcuts, and support from the help menu.",
    target: ".help-menu, [data-tour='help']",
    position: "left"
  }
];

export function FeatureTour({ 
  isOpen, 
  onClose, 
  onComplete, 
  steps = defaultSteps 
}: FeatureTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tourPosition, setTourPosition] = useState({ x: 0, y: 0 });
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && steps.length > 0) {
      updateTourPosition();
      // Update position on window resize
      const handleResize = () => updateTourPosition();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    // If not open or no steps, no cleanup needed
    return undefined;
  }, [isOpen, currentStep, steps]);

  const updateTourPosition = () => {
    const step = steps[currentStep];
    if (!step) return;

    // Find the target element
    const element = document.querySelector(step.target) as HTMLElement;
    if (element) {
      setTargetElement(element);
      
      // Scroll element into view
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center', 
        inline: 'center' 
      });

      // Calculate position for the tooltip
      const rect = element.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      
      let x = 0;
      let y = 0;

      switch (step.position) {
        case "top":
          x = rect.left + rect.width / 2;
          y = rect.top - 20;
          break;
        case "bottom":
          x = rect.left + rect.width / 2;
          y = rect.bottom + 20;
          break;
        case "left":
          x = rect.left - 20;
          y = rect.top + rect.height / 2;
          break;
        case "right":
          x = rect.right + 20;
          y = rect.top + rect.height / 2;
          break;
        case "center":
        default:
          x = windowWidth / 2;
          y = windowHeight / 2;
          break;
      }

      setTourPosition({ x, y });
    } else {
      setTargetElement(null);
      // If element not found, position in center
      setTourPosition({ 
        x: window.innerWidth / 2, 
        y: window.innerHeight / 2 
      });
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const completeTour = () => {
    onComplete();
    onClose();
  };

  const skipTour = () => {
    onClose();
  };

  if (!isOpen || steps.length === 0) return null;

  const currentStepData = steps[currentStep];
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay with spotlight effect */}
      <div 
        ref={overlayRef}
        className="absolute inset-0 bg-black bg-opacity-75 transition-all duration-300"
        style={{
          background: targetElement ? 
            `radial-gradient(circle at ${targetElement.getBoundingClientRect().left + targetElement.getBoundingClientRect().width / 2}px ${targetElement.getBoundingClientRect().top + targetElement.getBoundingClientRect().height / 2}px, transparent 0px, transparent ${Math.max(targetElement.getBoundingClientRect().width, targetElement.getBoundingClientRect().height) + 10}px, rgba(0,0,0,0.8) ${Math.max(targetElement.getBoundingClientRect().width, targetElement.getBoundingClientRect().height) + 30}px)` :
            'rgba(0,0,0,0.8)'
        }}
      />

      {/* Highlight border for target element */}
      {targetElement && (
        <div
          className="absolute border-2 border-blue-500 rounded-lg animate-pulse"
          style={{
            left: targetElement.getBoundingClientRect().left - 4,
            top: targetElement.getBoundingClientRect().top - 4,
            width: targetElement.getBoundingClientRect().width + 8,
            height: targetElement.getBoundingClientRect().height + 8,
            pointerEvents: 'none'
          }}
        />
      )}

      {/* Tour tooltip */}
      <div
        ref={tooltipRef}
        className="absolute bg-white rounded-xl shadow-2xl border max-w-sm w-80 transform -translate-x-1/2 -translate-y-1/2"
        style={{
          left: tourPosition.x,
          top: tourPosition.y,
          zIndex: 60
        }}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <Target className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-600">
                Step {currentStep + 1} of {steps.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {currentStepData.title}
          </h3>
          <p className="text-gray-600 mb-4 leading-relaxed">
            {currentStepData.description}
          </p>

          {/* Action button for step */}
          {currentStepData.action && (
            <button
              onClick={currentStepData.action.onClick}
              className="w-full mb-3 bg-blue-50 text-blue-700 px-4 py-2 rounded-lg hover:bg-blue-100 transition-colors border border-blue-200"
            >
              {currentStepData.action.label}
            </button>
          )}

          {/* Pointer/Arrow indicating target */}
          {targetElement && currentStepData.position !== "center" && (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
              <ArrowDown className="w-4 h-4" />
              <span>Look for the highlighted area</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  onClick={prevStep}
                  className="flex items-center gap-1 px-3 py-2 text-gray-600 hover:text-gray-800 transition-colors text-sm"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={skipTour}
                className="px-3 py-2 text-gray-600 hover:text-gray-800 transition-colors text-sm"
              >
                Skip Tour
              </button>
              
              <button
                onClick={nextStep}
                className="flex items-center gap-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                {currentStep === steps.length - 1 ? (
                  <>
                    <Lightbulb className="w-4 h-4" />
                    Finish Tour
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tour Controls (Floating) */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
        <div className="bg-white rounded-full shadow-lg border px-4 py-2 flex items-center gap-3">
          <span className="text-sm text-gray-600">
            Tour: {currentStep + 1}/{steps.length}
          </span>
          <div className="flex items-center gap-1">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentStep ? 'bg-blue-600' : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
