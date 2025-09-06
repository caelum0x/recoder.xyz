'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Lightbulb, 
  X, 
  ArrowRight, 
  ArrowLeft, 
  Play, 
  Pause,
  Settings,
  Eye,
  EyeOff,
  RefreshCw,
  Target
} from 'lucide-react';
import { toast } from 'sonner';

export interface TooltipData {
  id: string;
  title: string;
  content: string;
  element: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  trigger: 'hover' | 'click' | 'focus' | 'auto';
  delay: number;
  duration?: number;
  context: string[];
  priority: 'low' | 'medium' | 'high';
  isActive: boolean;
  userDismissed: boolean;
  showCount: number;
  lastShown: Date;
  category: string;
  conditions?: {
    userLevel?: 'beginner' | 'intermediate' | 'advanced';
    feature?: string;
    pageUrl?: string;
    elementVisible?: boolean;
  };
}

interface TooltipSystemProps {
  userId?: string;
  context?: string;
  userLevel?: 'beginner' | 'intermediate' | 'advanced';
}

export default function TooltipSystem({ userId, context = 'global', userLevel = 'beginner' }: TooltipSystemProps) {
  const [tooltips, setTooltips] = useState<TooltipData[]>([]);
  const [activeTooltip, setActiveTooltip] = useState<TooltipData | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [tourMode, setTourMode] = useState(false);
  const [currentTourIndex, setCurrentTourIndex] = useState(0);
  const [userPreferences, setUserPreferences] = useState({
    showTooltips: true,
    maxTooltipsPerDay: 5,
    preferredTrigger: 'hover' as const,
    enableTour: true,
    skipSeen: false
  });
  
  const tooltipRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<MutationObserver | null>(null);

  // Load user preferences and tooltips from backend
  useEffect(() => {
    loadUserPreferences();
    loadContextTooltips();
    setupElementObserver();
    
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [context, userId]);

  const loadUserPreferences = async () => {
    if (!userId) return;
    
    try {
      const response = await fetch(`/api/tooltips/preferences/${userId}`);
      if (response.ok) {
        const preferences = await response.json();
        setUserPreferences(preferences);
        setIsEnabled(preferences.showTooltips);
      }
    } catch (error) {
      console.error('Failed to load tooltip preferences:', error);
    }
  };

  const loadContextTooltips = async () => {
    try {
      const params = new URLSearchParams({
        context,
        userLevel: userLevel || 'beginner',
        ...(userId && { userId })
      });
      
      const response = await fetch(`/api/tooltips/context?${params}`);
      if (response.ok) {
        const data = await response.json();
        setTooltips(data.tooltips || []);
      }
    } catch (error) {
      console.error('Failed to load tooltips:', error);
    }
  };

  const setupElementObserver = () => {
    // Observe DOM changes to attach tooltips to new elements
    observerRef.current = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            attachTooltipsToElements(node as Element);
          }
        });
      });
    });

    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Initial attachment
    attachTooltipsToElements(document.body);
  };

  const attachTooltipsToElements = (container: Element) => {
    tooltips.forEach((tooltip) => {
      const elements = container.querySelectorAll(tooltip.element);
      elements.forEach((element) => {
        if (!element.hasAttribute('data-tooltip-attached')) {
          element.setAttribute('data-tooltip-attached', 'true');
          element.setAttribute('data-tooltip-id', tooltip.id);
          
          const showTooltip = (e: Event) => {
            if (!isEnabled || tooltip.userDismissed) return;
            
            showTooltipForElement(tooltip, element as HTMLElement);
            trackTooltipInteraction(tooltip.id, 'shown');
          };

          const hideTooltip = () => {
            if (activeTooltip?.id === tooltip.id) {
              setActiveTooltip(null);
            }
          };

          switch (tooltip.trigger) {
            case 'hover':
              element.addEventListener('mouseenter', showTooltip);
              element.addEventListener('mouseleave', hideTooltip);
              break;
            case 'click':
              element.addEventListener('click', showTooltip);
              break;
            case 'focus':
              element.addEventListener('focus', showTooltip);
              element.addEventListener('blur', hideTooltip);
              break;
            case 'auto':
              // Show automatically after delay if conditions are met
              setTimeout(() => {
                if (shouldShowTooltip(tooltip)) {
                  showTooltip(new Event('auto'));
                }
              }, tooltip.delay);
              break;
          }
        }
      });
    });
  };

  const shouldShowTooltip = (tooltip: TooltipData): boolean => {
    if (!isEnabled || tooltip.userDismissed) return false;
    
    // Check user level conditions
    if (tooltip.conditions?.userLevel && tooltip.conditions.userLevel !== userLevel) {
      return false;
    }
    
    // Check if element is visible
    if (tooltip.conditions?.elementVisible) {
      const element = document.querySelector(tooltip.element);
      if (!element || !isElementInViewport(element as HTMLElement)) {
        return false;
      }
    }
    
    // Check show count limits
    if (tooltip.showCount >= userPreferences.maxTooltipsPerDay) {
      return false;
    }
    
    // Check if already seen today and user wants to skip
    if (userPreferences.skipSeen && tooltip.showCount > 0) {
      const today = new Date().toDateString();
      const lastShown = new Date(tooltip.lastShown).toDateString();
      if (today === lastShown) {
        return false;
      }
    }
    
    return true;
  };

  const isElementInViewport = (element: HTMLElement): boolean => {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  };

  const showTooltipForElement = (tooltip: TooltipData, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    let x = rect.left;
    let y = rect.top;

    switch (tooltip.position) {
      case 'top':
        x = rect.left + rect.width / 2;
        y = rect.top - 10;
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom + 10;
        break;
      case 'left':
        x = rect.left - 10;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
        x = rect.right + 10;
        y = rect.top + rect.height / 2;
        break;
    }

    setTooltipPosition({ x, y });
    setActiveTooltip(tooltip);

    // Auto-hide after duration if specified
    if (tooltip.duration) {
      setTimeout(() => {
        setActiveTooltip(null);
      }, tooltip.duration);
    }
  };

  const trackTooltipInteraction = async (tooltipId: string, action: 'shown' | 'dismissed' | 'clicked') => {
    if (!userId) return;
    
    try {
      await fetch('/api/tooltips/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          tooltipId,
          action,
          context,
          timestamp: new Date().toISOString()
        })
      });
      
      // Update local state
      setTooltips(prev => prev.map(t => 
        t.id === tooltipId 
          ? { ...t, showCount: t.showCount + 1, lastShown: new Date() }
          : t
      ));
    } catch (error) {
      console.error('Failed to track tooltip interaction:', error);
    }
  };

  const dismissTooltip = async (tooltipId: string, permanent = false) => {
    setActiveTooltip(null);
    trackTooltipInteraction(tooltipId, 'dismissed');
    
    if (permanent) {
      setTooltips(prev => prev.map(t => 
        t.id === tooltipId ? { ...t, userDismissed: true } : t
      ));
      
      // Update backend
      try {
        await fetch(`/api/tooltips/dismiss/${tooltipId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, permanent: true })
        });
      } catch (error) {
        console.error('Failed to dismiss tooltip:', error);
      }
    }
  };

  const startTooltipTour = () => {
    const availableTooltips = tooltips.filter(t => 
      !t.userDismissed && shouldShowTooltip(t)
    ).sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    if (availableTooltips.length === 0) {
      toast.info('No tooltips available for tour');
      return;
    }
    
    setTourMode(true);
    setCurrentTourIndex(0);
    showTourTooltip(availableTooltips[0]);
  };

  const showTourTooltip = (tooltip: TooltipData) => {
    const element = document.querySelector(tooltip.element) as HTMLElement;
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        showTooltipForElement(tooltip, element);
      }, 500);
    }
  };

  const nextTourStep = () => {
    const availableTooltips = tooltips.filter(t => !t.userDismissed && shouldShowTooltip(t));
    const nextIndex = currentTourIndex + 1;
    
    if (nextIndex < availableTooltips.length) {
      setCurrentTourIndex(nextIndex);
      showTourTooltip(availableTooltips[nextIndex]);
    } else {
      endTour();
    }
  };

  const previousTourStep = () => {
    const availableTooltips = tooltips.filter(t => !t.userDismissed && shouldShowTooltip(t));
    const prevIndex = currentTourIndex - 1;
    
    if (prevIndex >= 0) {
      setCurrentTourIndex(prevIndex);
      showTourTooltip(availableTooltips[prevIndex]);
    }
  };

  const endTour = () => {
    setTourMode(false);
    setCurrentTourIndex(0);
    setActiveTooltip(null);
    toast.success('Tour completed!');
  };

  const updatePreferences = async (newPreferences: Partial<typeof userPreferences>) => {
    const updated = { ...userPreferences, ...newPreferences };
    setUserPreferences(updated);
    
    if (!userId) return;
    
    try {
      await fetch(`/api/tooltips/preferences/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (error) {
      console.error('Failed to update preferences:', error);
    }
  };

  const resetAllTooltips = async () => {
    try {
      await fetch(`/api/tooltips/reset/${userId}`, {
        method: 'POST'
      });
      
      setTooltips(prev => prev.map(t => ({ 
        ...t, 
        userDismissed: false, 
        showCount: 0,
        lastShown: new Date()
      })));
      
      toast.success('All tooltips have been reset');
    } catch (error) {
      console.error('Failed to reset tooltips:', error);
      toast.error('Failed to reset tooltips');
    }
  };

  if (!isEnabled) {
    return null;
  }

  return (
    <>
      {/* Active Tooltip */}
      {activeTooltip && (
        <div
          ref={tooltipRef}
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltipPosition.x,
            top: tooltipPosition.y,
            transform: `translate(${
              activeTooltip.position === 'right' ? '0' :
              activeTooltip.position === 'left' ? '-100%' :
              '-50%'
            }, ${
              activeTooltip.position === 'bottom' ? '0' :
              activeTooltip.position === 'top' ? '-100%' :
              '-50%'
            })`
          }}
        >
          <Card className="max-w-xs shadow-lg border-2 border-blue-200 bg-white pointer-events-auto">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-blue-500" />
                  <h4 className="font-semibold text-sm">{activeTooltip.title}</h4>
                  <Badge variant="secondary" className="text-xs">
                    {activeTooltip.priority}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissTooltip(activeTooltip.id)}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              
              <p className="text-sm text-gray-700 mb-3">{activeTooltip.content}</p>
              
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {tourMode && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={previousTourStep}
                        disabled={currentTourIndex === 0}
                        className="h-7 px-2"
                      >
                        <ArrowLeft className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={nextTourStep}
                        className="h-7 px-2"
                      >
                        <ArrowRight className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={endTour}
                        className="h-7 px-2"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dismissTooltip(activeTooltip.id, true)}
                  className="h-7 px-2 text-xs"
                >
                  Don't show again
                </Button>
              </div>
              
              {tourMode && (
                <div className="mt-3 pt-3 border-t">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Tour Step {currentTourIndex + 1}</span>
                    <span>Category: {activeTooltip.category}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Tooltip Arrow */}
          <div
            className={`absolute w-0 h-0 border-solid ${
              activeTooltip.position === 'top' ? 'top-full left-1/2 transform -translate-x-1/2 border-t-8 border-t-white border-l-4 border-l-transparent border-r-4 border-r-transparent' :
              activeTooltip.position === 'bottom' ? 'bottom-full left-1/2 transform -translate-x-1/2 border-b-8 border-b-white border-l-4 border-l-transparent border-r-4 border-r-transparent' :
              activeTooltip.position === 'left' ? 'left-full top-1/2 transform -translate-y-1/2 border-l-8 border-l-white border-t-4 border-t-transparent border-b-4 border-b-transparent' :
              'right-full top-1/2 transform -translate-y-1/2 border-r-8 border-r-white border-t-4 border-t-transparent border-b-4 border-b-transparent'
            }`}
          />
        </div>
      )}

      {/* Floating Controls */}
      <div className="fixed bottom-4 right-4 z-40">
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={startTooltipTour}
            className="flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Start Tour
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed bottom-16 right-4 z-50">
          <Card className="w-80">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Tooltip Settings</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm">Enable Tooltips</label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIsEnabled(!isEnabled);
                      updatePreferences({ showTooltips: !isEnabled });
                    }}
                  >
                    {isEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between">
                  <label className="text-sm">Skip Seen Tooltips</label>
                  <input
                    type="checkbox"
                    checked={userPreferences.skipSeen}
                    onChange={(e) => updatePreferences({ skipSeen: e.target.checked })}
                  />
                </div>
                
                <div>
                  <label className="text-sm block mb-2">Max Tooltips per Day</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={userPreferences.maxTooltipsPerDay}
                    onChange={(e) => updatePreferences({ maxTooltipsPerDay: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </div>
                
                <div>
                  <label className="text-sm block mb-2">Preferred Trigger</label>
                  <select
                    value={userPreferences.preferredTrigger}
                    onChange={(e) => updatePreferences({ preferredTrigger: e.target.value as any })}
                    className="w-full px-3 py-2 border rounded"
                  >
                    <option value="hover">Hover</option>
                    <option value="click">Click</option>
                    <option value="focus">Focus</option>
                    <option value="auto">Automatic</option>
                  </select>
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetAllTooltips}
                  className="w-full"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset All Tooltips
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}