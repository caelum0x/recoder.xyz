import { Github, Twitter, MessageCircle, Mail, ExternalLink } from 'lucide-react'

export function Footer() {
  const footerLinks = {
    product: [
      { name: 'Features', href: '#features' },
      { name: 'AI Models', href: '#ai-models' },
      { name: 'Examples', href: '#examples' },
      { name: 'Pricing', href: '#pricing' },
      { name: 'Installation', href: '#installation' },
    ],
    resources: [
      { name: 'Documentation', href: '/docs' },
      { name: 'API Reference', href: '/docs/api' },
      { name: 'Tutorials', href: '/docs/tutorials' },
      { name: 'Best Practices', href: '/docs/best-practices' },
      { name: 'Troubleshooting', href: '/docs/troubleshooting' },
    ],
    community: [
      { name: 'Discord Server', href: 'https://discord.gg/recoder', external: true },
      { name: 'GitHub Discussions', href: 'https://github.com/recoder-team/recoder/discussions', external: true },
      { name: 'Twitter', href: 'https://twitter.com/recoderxyz', external: true },
      { name: 'Blog', href: '/blog' },
      { name: 'Newsletter', href: '/newsletter' },
    ],
    company: [
      { name: 'About', href: '/about' },
      { name: 'Careers', href: '/careers' },
      { name: 'Contact', href: '/contact' },
      { name: 'Privacy Policy', href: '/privacy' },
      { name: 'Terms of Service', href: '/terms' },
    ]
  }

  const socialLinks = [
    {
      name: 'GitHub',
      href: 'https://github.com/recoder-team/recoder',
      icon: <Github className="w-5 h-5" />
    },
    {
      name: 'Discord',
      href: 'https://discord.gg/recoder',
      icon: <MessageCircle className="w-5 h-5" />
    },
    {
      name: 'Twitter',
      href: 'https://twitter.com/recoderxyz',
      icon: <Twitter className="w-5 h-5" />
    },
    {
      name: 'Email',
      href: 'mailto:hello@recoder.xyz',
      icon: <Mail className="w-5 h-5" />
    }
  ]

  const scrollToSection = (href: string) => {
    if (href.startsWith('#')) {
      const element = document.querySelector(href)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' })
      }
    }
  }

  return (
    <footer className="bg-gray-900 text-white">
      <div className="section-padding">
        <div className="container-width">
          {/* Main Footer Content */}
          <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-8 mb-8">
            {/* Brand & Description */}
            <div className="lg:col-span-2">
              <div className="flex items-center space-x-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">R</span>
                </div>
                <span className="font-bold text-xl">Recoder.xyz</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed mb-4">
                Superior AI-powered development platform that generates REAL, production-ready code. 
                Build working applications that generate real revenue - not mock implementations.
              </p>
              <div className="flex space-x-3">
                {socialLinks.map((social) => (
                  <a
                    key={social.name}
                    href={social.href}
                    target={social.href.startsWith('http') ? '_blank' : undefined}
                    rel={social.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                    className="w-10 h-10 bg-gray-800 hover:bg-gray-700 rounded-lg flex items-center justify-center transition-colors group"
                    aria-label={social.name}
                  >
                    <div className="group-hover:text-blue-400 transition-colors">
                      {social.icon}
                    </div>
                  </a>
                ))}
              </div>
            </div>

            {/* Product Links */}
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2">
                {footerLinks.product.map((link) => (
                  <li key={link.name}>
                    <button
                      onClick={() => scrollToSection(link.href)}
                      className="text-gray-400 hover:text-white transition-colors text-sm"
                    >
                      {link.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources Links */}
            <div>
              <h4 className="font-semibold mb-4">Resources</h4>
              <ul className="space-y-2">
                {footerLinks.resources.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-gray-400 hover:text-white transition-colors text-sm"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Community Links */}
            <div>
              <h4 className="font-semibold mb-4">Community</h4>
              <ul className="space-y-2">
                {footerLinks.community.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className="text-gray-400 hover:text-white transition-colors text-sm flex items-center space-x-1"
                    >
                      <span>{link.name}</span>
                      {link.external && <ExternalLink className="w-3 h-3" />}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company Links */}
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2">
                {footerLinks.company.map((link) => (
                  <li key={link.name}>
                    <a
                      href={link.href}
                      className="text-gray-400 hover:text-white transition-colors text-sm"
                    >
                      {link.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Newsletter Signup */}
          <div className="border-t border-gray-800 pt-8 mb-8">
            <div className="max-w-md">
              <h4 className="font-semibold mb-2">Stay updated</h4>
              <p className="text-gray-400 text-sm mb-4">
                Get the latest updates on new AI models, features, and examples.
              </p>
              <div className="flex space-x-2">
                <input
                  type="email"
                  placeholder="Enter your email"
                  className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
                <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors">
                  Subscribe
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-6">
              <p className="text-gray-400 text-sm">
                © 2024 Recoder.xyz. All rights reserved.
              </p>
              <div className="flex items-center space-x-4 text-xs text-gray-500">
                <span>Made with ❤️ for developers</span>
                <span>•</span>
                <span>Built with Recoder.xyz</span>
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-gray-400">All systems operational</span>
            </div>
          </div>

          {/* Additional Info */}
          <div className="mt-8 text-center">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-gray-800 rounded-full">
              <span className="text-xs text-gray-400">
                🚀 Join 10,000+ developers building real applications with AI
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}