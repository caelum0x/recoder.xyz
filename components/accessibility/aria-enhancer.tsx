'use client'

import React, { useEffect } from 'react'

interface AriaEnhancerProps {
  children: React.ReactNode
  announcePageChanges?: boolean
  announceFormErrors?: boolean
  announceNotifications?: boolean
}

interface AriaLiveRegionProps {
  message: string
  priority?: 'polite' | 'assertive'
  clearAfterAnnounce?: boolean
}

// ARIA Live Region Component for Screen Reader Announcements
export const AriaLiveRegion: React.FC<AriaLiveRegionProps> = ({
  message,
  priority = 'polite',
  clearAfterAnnounce = true
}) => {
  const [currentMessage, setCurrentMessage] = React.useState('')

  useEffect(() => {
    if (message) {
      setCurrentMessage(message)
      
      if (clearAfterAnnounce) {
        const timer = setTimeout(() => {
          setCurrentMessage('')
        }, 1000)
        
        return () => clearTimeout(timer)
      }
    }
  }, [message, clearAfterAnnounce])

  return (
    <div
      aria-live={priority}
      aria-atomic="true"
      className="sr-only"
      role="status"
    >
      {currentMessage}
    </div>
  )
}

// Hook for managing ARIA announcements
export const useAriaAnnounce = () => {
  const [announcement, setAnnouncement] = React.useState('')

  const announce = React.useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    setAnnouncement('')
    // Small delay to ensure screen readers pick up the change
    setTimeout(() => {
      setAnnouncement(message)
    }, 10)
  }, [])

  const clear = React.useCallback(() => {
    setAnnouncement('')
  }, [])

  return {
    announcement,
    announce,
    clear,
    LiveRegion: () => (
      <AriaLiveRegion message={announcement} />
    )
  }
}

// Main ARIA Enhancer Component
export const AriaEnhancer: React.FC<AriaEnhancerProps> = ({
  children,
  announcePageChanges = true,
  announceFormErrors = true,
  announceNotifications = true
}) => {
  const { announce, LiveRegion } = useAriaAnnounce()

  useEffect(() => {
    // Announce page changes
    if (announcePageChanges) {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if main content has changed
            const mainElement = document.querySelector('main')
            if (mainElement && Array.from(mutation.addedNodes).includes(mainElement)) {
              const pageTitle = document.title || 'Page content updated'
              announce(`Navigated to ${pageTitle}`)
            }
          }
        })
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true
      })

      return () => observer.disconnect()
    }
  }, [announcePageChanges, announce])

  useEffect(() => {
    // Announce form errors
    if (announceFormErrors) {
      const handleFormError = (event: Event) => {
        const target = event.target as HTMLElement
        if (target.getAttribute('aria-invalid') === 'true') {
          const errorMessage = target.getAttribute('aria-describedby')
          if (errorMessage) {
            const errorElement = document.getElementById(errorMessage)
            if (errorElement) {
              announce(`Form error: ${errorElement.textContent}`, 'assertive')
            }
          }
        }
      }

      document.addEventListener('invalid', handleFormError, true)
      return () => document.removeEventListener('invalid', handleFormError, true)
    }
  }, [announceFormErrors, announce])

  useEffect(() => {
    // Announce notifications
    if (announceNotifications) {
      const handleNotification = (event: CustomEvent) => {
        const { message, type } = event.detail
        announce(`${type} notification: ${message}`, 'assertive')
      }

      window.addEventListener('notification' as any, handleNotification)
      return () => window.removeEventListener('notification' as any, handleNotification)
    }
  }, [announceNotifications, announce])

  return (
    <>
      {children}
      <LiveRegion />
    </>
  )
}

// Utility function to add ARIA labels to common elements
export const addAriaLabels = () => {
  useEffect(() => {
    // Add labels to buttons without accessible names
    const buttons = document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])')
    buttons.forEach((button) => {
      const text = button.textContent?.trim()
      if (!text) {
        // Try to find an icon and guess the purpose
        const icon = button.querySelector('svg')
        if (icon) {
          const iconClass = icon.className.baseVal || icon.getAttribute('class') || ''
          if (iconClass.includes('menu')) {
            button.setAttribute('aria-label', 'Open menu')
          } else if (iconClass.includes('close') || iconClass.includes('x')) {
            button.setAttribute('aria-label', 'Close')
          } else if (iconClass.includes('search')) {
            button.setAttribute('aria-label', 'Search')
          } else if (iconClass.includes('play')) {
            button.setAttribute('aria-label', 'Play')
          } else if (iconClass.includes('pause')) {
            button.setAttribute('aria-label', 'Pause')
          } else {
            button.setAttribute('aria-label', 'Button')
          }
        }
      }
    })

    // Add labels to form inputs without labels
    const inputs = document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])')
    inputs.forEach((input) => {
      const placeholder = input.getAttribute('placeholder')
      const type = input.getAttribute('type')
      
      if (placeholder) {
        input.setAttribute('aria-label', placeholder)
      } else if (type) {
        input.setAttribute('aria-label', `${type} input`)
      }
    })

    // Add landmarks to common page sections
    const nav = document.querySelector('nav:not([role])')
    if (nav) nav.setAttribute('role', 'navigation')

    const main = document.querySelector('main:not([role])')
    if (main) main.setAttribute('role', 'main')

    const aside = document.querySelector('aside:not([role])')
    if (aside) aside.setAttribute('role', 'complementary')

    const footer = document.querySelector('footer:not([role])')
    if (footer) footer.setAttribute('role', 'contentinfo')

    // Add skip links if they don't exist
    if (!document.querySelector('[href="#main-content"]')) {
      const skipLink = document.createElement('a')
      skipLink.href = '#main-content'
      skipLink.textContent = 'Skip to main content'
      skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded'
      document.body.insertBefore(skipLink, document.body.firstChild)
    }

    // Ensure main content has an ID for skip link
    const mainContent = document.querySelector('main')
    if (mainContent && !mainContent.id) {
      mainContent.id = 'main-content'
    }
  }, [])
}

// Component to wrap applications with accessibility enhancements
export const AccessibilityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  addAriaLabels()

  return (
    <AriaEnhancer>
      {children}
    </AriaEnhancer>
  )
}

export default AriaEnhancer
