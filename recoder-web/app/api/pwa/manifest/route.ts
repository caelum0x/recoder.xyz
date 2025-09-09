import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const theme = searchParams.get('theme') || 'default';
    const customization = searchParams.get('customization') || 'standard';

    // Dynamic manifest generation based on user preferences
    const manifest = {
      name: 'Recoder.xyz - AI Development Platform',
      short_name: 'Recoder',
      description: 'Professional AI-powered development platform with real code generation, multi-language execution, and advanced collaboration features',
      start_url: '/',
      display: 'standalone',
      background_color: theme === 'dark' ? '#0f0f23' : '#ffffff',
      theme_color: theme === 'dark' ? '#1a1a2e' : '#007AFF',
      orientation: 'any',
      scope: '/',
      lang: 'en',
      dir: 'ltr',
      
      categories: [
        'development',
        'productivity',
        'utilities',
        'education'
      ],

      icons: [
        {
          src: '/icons/manifest-icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable any'
        },
        {
          src: '/icons/manifest-icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable any'
        },
        {
          src: '/icons/apple-icon-180.png',
          sizes: '180x180',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/favicon-96x96.png',
          sizes: '96x96',
          type: 'image/png',
          purpose: 'any'
        }
      ],

      screenshots: [
        {
          src: '/screenshots/desktop-wide.png',
          type: 'image/png',
          sizes: '2560x1440',
          form_factor: 'wide',
          label: 'Main development interface on desktop'
        },
        {
          src: '/screenshots/desktop-narrow.png',
          type: 'image/png',
          sizes: '1280x800',
          form_factor: 'narrow',
          label: 'Code editor view'
        },
        {
          src: '/screenshots/mobile.png',
          type: 'image/png',
          sizes: '390x844',
          form_factor: 'narrow',
          label: 'Mobile optimized interface'
        }
      ],

      shortcuts: [
        {
          name: 'New Project',
          short_name: 'New',
          description: 'Create a new development project',
          url: '/projects/new',
          icons: [
            {
              src: '/icons/shortcut-new.png',
              sizes: '96x96',
              type: 'image/png'
            }
          ]
        },
        {
          name: 'Code Generator',
          short_name: 'Generate',
          description: 'Open the AI code generator',
          url: '/generate',
          icons: [
            {
              src: '/icons/shortcut-generate.png',
              sizes: '96x96',
              type: 'image/png'
            }
          ]
        },
        {
          name: 'Analytics',
          short_name: 'Analytics',
          description: 'View development analytics',
          url: '/analytics',
          icons: [
            {
              src: '/icons/shortcut-analytics.png',
              sizes: '96x96',
              type: 'image/png'
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
              src: '/icons/shortcut-settings.png',
              sizes: '96x96',
              type: 'image/png'
            }
          ]
        }
      ],

      file_handlers: [
        {
          action: '/projects/import',
          accept: {
            'application/zip': ['.zip'],
            'application/x-tar': ['.tar'],
            'application/gzip': ['.tar.gz'],
            'text/javascript': ['.js', '.jsx'],
            'text/typescript': ['.ts', '.tsx'],
            'text/html': ['.html', '.htm'],
            'text/css': ['.css'],
            'application/json': ['.json'],
            'text/markdown': ['.md', '.mdx'],
            'text/plain': ['.txt', '.env'],
            'application/x-python': ['.py'],
            'text/x-java-source': ['.java'],
            'text/x-c': ['.c', '.cpp', '.h'],
            'text/x-rust': ['.rs'],
            'text/x-go': ['.go']
          }
        }
      ],

      protocol_handlers: [
        {
          protocol: 'web+recoder',
          url: '/handle?protocol=%s'
        }
      ],

      edge_side_panel: {
        preferred_width: 400
      },

      launch_handler: {
        client_mode: ['navigate-existing', 'auto']
      },

      related_applications: [
        {
          platform: 'webapp',
          url: 'https://recoder.xyz/manifest.json'
        }
      ],

      prefer_related_applications: false,

      share_target: {
        action: '/share',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: {
          title: 'title',
          text: 'text',
          url: 'url',
          files: [
            {
              name: 'file',
              accept: [
                'image/*',
                'text/*',
                'application/zip',
                'application/json'
              ]
            }
          ]
        }
      }
    };

    return NextResponse.json(manifest, {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control': 'public, max-age=3600'
      }
    });
  } catch (error) {
    console.error('Failed to generate manifest:', error);
    return NextResponse.json(
      { error: 'Failed to generate manifest' },
      { status: 500 }
    );
  }
}