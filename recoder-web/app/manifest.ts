import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Recoder.xyz - AI-Powered Development Platform',
    short_name: 'Recoder.xyz',
    description: 'The ultimate AI-powered development platform with multi-model intelligence, real-time collaboration, and enterprise-grade features.',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/icon-192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      },
      {
        src: '/icon-192',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/icon-512',
        sizes: '512x512',
        type: 'image/png'
      },
      {
        src: '/icon',
        sizes: '32x32',
        type: 'image/png'
      }
    ],
    categories: ['developer', 'productivity', 'business', 'utilities'],
    orientation: 'portrait-primary',
    scope: '/',
    lang: 'en',
    dir: 'ltr',
    prefer_related_applications: false,
    shortcuts: [
      {
        name: 'New Chat',
        short_name: 'Chat',
        description: 'Start a new AI conversation',
        url: '/chats',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192'
          }
        ]
      },
      {
        name: 'New Project',
        short_name: 'Project',
        description: 'Create a new development project',
        url: '/projects',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192'
          }
        ]
      },
      {
        name: 'Dashboard',
        short_name: 'Dashboard',
        description: 'View your development dashboard',
        url: '/dashboard',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192'
          }
        ]
      },
      {
        name: 'Settings',
        short_name: 'Settings',
        description: 'Manage account settings',
        url: '/settings',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192'
          }
        ]
      }
    ]
  }
}