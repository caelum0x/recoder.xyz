'use client'

import React, { useState, useEffect } from 'react'
import { X, Download, Smartphone, Monitor, Chrome } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

interface PWAInstallPromptProps {
  showPrompt?: boolean
  onDismiss?: () => void
  onInstall?: () => void
  customMessage?: string
}

interface InstallationGuideProps {
  platform: 'ios' | 'android' | 'desktop'
  isVisible: boolean
  onClose: () => void
}

// Main PWA Install Prompt Component
export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  showPrompt: externalShowPrompt,
  onDismiss,
  onInstall,
  customMessage
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [platform, setPlatform] = useState<'desktop' | 'mobile' | 'ios' | 'android'>('desktop')
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    // Check if PWA is already installed
    const checkInstallation = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      const isInWebAppiOS = (window.navigator as any).standalone
      const isInWebAppChrome = window.matchMedia('(display-mode: standalone)').matches
      
      setIsInstalled(isStandalone || isInWebAppiOS || isInWebAppChrome)
    }

    // Detect platform
    const detectPlatform = () => {
      const userAgent = navigator.userAgent.toLowerCase()
      const isIOS = /iphone|ipad|ipod/.test(userAgent)
      const isAndroid = /android/.test(userAgent)
      const isMobile = /mobile|android|iphone|ipad|ipod|blackberry|iemobile/.test(userAgent)

      if (isIOS) {
        setPlatform('ios')
      } else if (isAndroid) {
        setPlatform('android')
      } else if (isMobile) {
        setPlatform('mobile')
      } else {
        setPlatform('desktop')
      }
    }

    checkInstallation()
    detectPlatform()

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      const event = e as BeforeInstallPromptEvent
      setDeferredPrompt(event)
      
      // Show prompt after a delay to improve user experience
      if (!isInstalled && !hasUserDismissed()) {
        setTimeout(() => {
          setShowPrompt(true)
        }, 5000) // Show after 5 seconds
      }
    }

    // Listen for app installation
    const handleAppInstalled = () => {
      console.log('[PWA] App was installed')
      setIsInstalled(true)
      setShowPrompt(false)
      setDeferredPrompt(null)
      onInstall?.()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [isInstalled, onInstall])

  // Check if user has previously dismissed the prompt
  const hasUserDismissed = () => {
    const dismissed = localStorage.getItem('pwa-install-dismissed')
    const dismissedTime = dismissed ? parseInt(dismissed) : 0
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000)
    
    return dismissedTime > sevenDaysAgo
  }

  // Handle install button click
  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      // Show manual installation guide for iOS/Android
      if (platform === 'ios' || platform === 'android') {
        setShowGuide(true)
      }
      return
    }

    try {
      await deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      
      console.log(`[PWA] User response to install prompt: ${outcome}`)
      
      if (outcome === 'accepted') {
        setIsInstalled(true)
        onInstall?.()
      }
      
      setDeferredPrompt(null)
      setShowPrompt(false)
    } catch (error) {
      console.error('[PWA] Error showing install prompt:', error)
    }
  }

  // Handle dismiss
  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', Date.now().toString())
    setShowPrompt(false)
    onDismiss?.()
  }

  // Show prompt based on external prop or internal state
  const shouldShowPrompt = externalShowPrompt !== undefined ? externalShowPrompt : showPrompt

  if (isInstalled || !shouldShowPrompt) {
    return null
  }

  const getInstallMessage = () => {
    if (customMessage) return customMessage
    
    switch (platform) {
      case 'ios':
        return 'Install Recoder.xyz app for the best mobile experience'
      case 'android':
        return 'Add Recoder.xyz to your home screen for quick access'
      case 'desktop':
        return 'Install Recoder.xyz as a desktop app for better performance'
      default:
        return 'Install Recoder.xyz for offline access and better performance'
    }
  }

  const getInstallIcon = () => {
    switch (platform) {
      case 'ios':
      case 'android':
        return <Smartphone className="w-5 h-5" />
      case 'desktop':
        return <Monitor className="w-5 h-5" />
      default:
        return <Download className="w-5 h-5" />
    }
  }

  return (
    <>
      <Card className="fixed bottom-4 left-4 right-4 md:left-auto md:w-96 z-50 shadow-lg border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {getInstallIcon()}
              <CardTitle className="text-lg">Install App</CardTitle>
              <Badge variant="secondary">PWA</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismiss}
              className="h-6 w-6 p-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <CardDescription className="mb-4">
            {getInstallMessage()}
          </CardDescription>
          
          <div className="flex gap-2">
            <Button onClick={handleInstallClick} className="flex-1">
              <Download className="w-4 h-4 mr-2" />
              Install Now
            </Button>
            <Button variant="outline" onClick={handleDismiss}>
              Not Now
            </Button>
          </div>
          
          {(platform === 'ios' || platform === 'android') && (
            <p className="text-xs text-muted-foreground mt-2">
              {platform === 'ios' && (
                <>Tap the share button <Chrome className="inline w-3 h-3" /> then "Add to Home Screen"</>
              )}
              {platform === 'android' && (
                <>Tap the menu button then "Install App" or "Add to Home Screen"</>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Manual Installation Guide */}
      <InstallationGuide
        platform={platform === 'ios' ? 'ios' : platform === 'android' ? 'android' : 'desktop'}
        isVisible={showGuide}
        onClose={() => setShowGuide(false)}
      />
    </>
  )
}

// Installation Guide Modal
const InstallationGuide: React.FC<InstallationGuideProps> = ({ platform, isVisible, onClose }) => {
  if (!isVisible) return null

  const getGuideContent = () => {
    switch (platform) {
      case 'ios':
        return {
          title: 'Install on iOS',
          steps: [
            'Open this page in Safari browser',
            'Tap the Share button at the bottom of the screen',
            'Scroll down and tap "Add to Home Screen"',
            'Tap "Add" in the top right corner',
            'Find the Recoder.xyz app on your home screen'
          ]
        }
      case 'android':
        return {
          title: 'Install on Android',
          steps: [
            'Open this page in Chrome browser',
            'Tap the menu button (⋮) in the top right',
            'Tap "Install App" or "Add to Home Screen"',
            'Tap "Install" when prompted',
            'Find the Recoder.xyz app in your app drawer'
          ]
        }
      case 'desktop':
        return {
          title: 'Install on Desktop',
          steps: [
            'Look for the install icon in your browser\'s address bar',
            'Click the install button or use the browser menu',
            'Click "Install" when prompted',
            'The app will appear in your applications folder',
            'You can pin it to your taskbar for quick access'
          ]
        }
    }
  }

  const guide = getGuideContent()

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{guide.title}</CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {guide.steps.map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-sm font-medium">
                  {index + 1}
                </span>
                <span className="text-sm">{step}</span>
              </li>
            ))}
          </ol>
          
          <div className="mt-6 pt-4 border-t">
            <Button onClick={onClose} className="w-full">
              Got it!
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Hook for PWA installation management
export const usePWAInstall = () => {
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [platform, setPlatform] = useState<string>('')

  useEffect(() => {
    const checkInstallation = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      const isInWebAppiOS = (window.navigator as any).standalone
      
      setIsInstalled(isStandalone || isInWebAppiOS)
    }

    const detectPlatform = () => {
      const userAgent = navigator.userAgent.toLowerCase()
      if (/iphone|ipad|ipod/.test(userAgent)) {
        setPlatform('ios')
      } else if (/android/.test(userAgent)) {
        setPlatform('android')
      } else {
        setPlatform('desktop')
      }
    }

    checkInstallation()
    detectPlatform()

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setCanInstall(true)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setCanInstall(false)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  return {
    canInstall,
    isInstalled,
    platform
  }
}

// Simple install button component
export const InstallButton: React.FC<{ variant?: 'default' | 'outline' | 'ghost' }> = ({ 
  variant = 'default' 
}) => {
  const [showPrompt, setShowPrompt] = useState(false)
  const { canInstall, isInstalled } = usePWAInstall()

  if (isInstalled) {
    return null
  }

  return (
    <>
      <Button 
        variant={variant} 
        onClick={() => setShowPrompt(true)}
        className="gap-2"
      >
        <Download className="w-4 h-4" />
        Install App
      </Button>
      
      <PWAInstallPrompt
        showPrompt={showPrompt}
        onDismiss={() => setShowPrompt(false)}
        onInstall={() => setShowPrompt(false)}
      />
    </>
  )
}

export default PWAInstallPrompt
