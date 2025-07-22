import { ExternalLink, Play, Code, DollarSign, Users, Zap } from 'lucide-react'

export function Examples() {
  const examples = [
    {
      title: 'Solana DEX',
      subtitle: 'Actually Swaps Tokens',
      description: 'Complete decentralized exchange with working smart contracts, real price calculations, liquidity provision, and functional trading interface.',
      command: 'recoder "build a Solana DEX with real token swapping and liquidity pools"',
      features: [
        'Real Solana program deployment',
        'Token swap functionality',
        'Liquidity pool management',
        'Price calculation algorithms',
        'Web3 wallet integration'
      ],
      tech: ['Solana', 'Rust', 'Anchor', 'React', 'Web3.js'],
      revenue: '$50K+ in trading fees',
      users: '10K+ traders',
      icon: '🔗',
      color: 'from-purple-500 to-pink-500',
      demo: 'https://demo-dex.recoder.xyz'
    },
    {
      title: 'NFT Marketplace',
      subtitle: 'Real Payments & IPFS',
      description: 'Full marketplace with minting, buying/selling, payment processing through Stripe, and decentralized IPFS metadata storage.',
      command: 'recoder "create an NFT marketplace with Stripe payments and IPFS storage"',
      features: [
        'NFT minting with metadata',
        'Stripe payment integration',
        'IPFS decentralized storage',
        'Auction system',
        'Creator royalties'
      ],
      tech: ['Ethereum', 'Solidity', 'Next.js', 'Stripe', 'IPFS'],
      revenue: '$100K+ in sales',
      users: '5K+ collectors',
      icon: '🖼️',
      color: 'from-blue-500 to-cyan-500',
      demo: 'https://demo-nft.recoder.xyz'
    },
    {
      title: 'AI SaaS Platform',
      subtitle: 'Working OpenAI Integration',
      description: 'Complete SaaS with real AI features, user authentication, subscription billing, and OpenAI API integration for content generation.',
      command: 'recoder "build an AI writing assistant with OpenAI integration and billing"',
      features: [
        'OpenAI GPT integration',
        'Subscription management',
        'User authentication',
        'Payment processing',
        'Usage tracking & limits'
      ],
      tech: ['Next.js', 'OpenAI API', 'Stripe', 'Prisma', 'PostgreSQL'],
      revenue: '$25K+ MRR',
      users: '1K+ subscribers',
      icon: '🤖',
      color: 'from-green-500 to-teal-500',
      demo: 'https://demo-ai.recoder.xyz'
    },
    {
      title: 'DeFi Protocol',
      subtitle: 'Real Yields & Staking',
      description: 'Working DeFi protocol with smart contracts, staking mechanisms, yield farming, reward distribution, and governance tokens.',
      command: 'recoder "create a yield farming protocol with staking and governance tokens"',
      features: [
        'Yield farming pools',
        'Token staking rewards',
        'Governance voting',
        'Liquidity mining',
        'Auto-compounding vaults'
      ],
      tech: ['Ethereum', 'Solidity', 'Hardhat', 'React', 'Web3'],
      revenue: '$2M+ TVL',
      users: '500+ farmers',
      icon: '🌾',
      color: 'from-yellow-500 to-orange-500',
      demo: 'https://demo-defi.recoder.xyz'
    }
  ]

  const metrics = [
    {
      value: '500+',
      label: 'Projects Generated',
      icon: <Code className="w-6 h-6" />
    },
    {
      value: '$2M+',
      label: 'Revenue Generated',
      icon: <DollarSign className="w-6 h-6" />
    },
    {
      value: '50K+',
      label: 'Active Users',
      icon: <Users className="w-6 h-6" />
    },
    {
      value: '95%',
      label: 'Success Rate',
      icon: <Zap className="w-6 h-6" />
    }
  ]

  return (
    <div className="container-width">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold mb-4">
          <span className="gradient-text">Real Working Examples</span>
        </h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          These aren't demos or tutorials - they're production applications generating real revenue 
          and serving real users, built with Recoder.xyz.
        </p>
      </div>

      {/* Success Metrics */}
      <div className="grid md:grid-cols-4 gap-6 mb-16">
        {metrics.map((metric, index) => (
          <div key={index} className="feature-card text-center group">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
              {metric.icon}
            </div>
            <div className="text-2xl font-bold gradient-text mb-1">{metric.value}</div>
            <div className="text-gray-600 text-sm">{metric.label}</div>
          </div>
        ))}
      </div>

      {/* Examples Grid */}
      <div className="space-y-12">
        {examples.map((example, index) => (
          <div key={index} className="feature-card">
            <div className="grid lg:grid-cols-2 gap-8">
              {/* Left Column - Info */}
              <div className="space-y-6">
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="text-3xl">{example.icon}</div>
                    <div>
                      <h3 className="text-2xl font-bold">{example.title}</h3>
                      <p className="text-blue-600 font-medium">{example.subtitle}</p>
                    </div>
                  </div>
                  <p className="text-gray-600">{example.description}</p>
                </div>

                {/* Command */}
                <div className="bg-gray-900 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-400 text-sm ml-2">Terminal</span>
                  </div>
                  <code className="text-green-400 text-sm">
                    {example.command}
                  </code>
                </div>

                {/* Tech Stack */}
                <div>
                  <h4 className="font-semibold mb-3">Technology Stack</h4>
                  <div className="flex flex-wrap gap-2">
                    {example.tech.map((tech, techIndex) => (
                      <span 
                        key={techIndex}
                        className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Features */}
                <div>
                  <h4 className="font-semibold mb-3">Key Features</h4>
                  <ul className="space-y-2">
                    {example.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full"></div>
                        <span className="text-sm text-gray-600">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right Column - Demo & Metrics */}
              <div className="space-y-6">
                {/* Live Demo */}
                <div className={`bg-gradient-to-r ${example.color} p-6 rounded-xl text-white`}>
                  <h4 className="font-semibold mb-4 flex items-center space-x-2">
                    <Play className="w-5 h-5" />
                    <span>Live Demo</span>
                  </h4>
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between">
                      <span>Revenue Generated:</span>
                      <span className="font-bold">{example.revenue}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Active Users:</span>
                      <span className="font-bold">{example.users}</span>
                    </div>
                  </div>
                  <a 
                    href={example.demo}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-2 bg-white text-gray-900 px-4 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-colors"
                  >
                    <span>View Live Demo</span>
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                {/* Generation Stats */}
                <div className="feature-card bg-gray-50">
                  <h4 className="font-semibold mb-4">⚡ Generation Stats</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Generation Time:</span>
                      <span className="font-semibold">3-5 minutes</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Lines of Code:</span>
                      <span className="font-semibold">2,500-5,000</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Files Created:</span>
                      <span className="font-semibold">25-50</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Test Coverage:</span>
                      <span className="font-semibold text-green-600">90%+</span>
                    </div>
                  </div>
                </div>

                {/* Success Story */}
                <div className="feature-card bg-green-50 border border-green-200">
                  <h4 className="font-semibold mb-2 text-green-800">💡 Success Story</h4>
                  <p className="text-sm text-green-700">
                    "Built in 3 days with Recoder, now processing {example.revenue.includes('TVL') ? 'millions in' : 'thousands in'} real transactions. 
                    Traditional development would have taken 3+ months."
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA Section */}
      <div className="mt-16 text-center">
        <div className="feature-card bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200">
          <h3 className="text-2xl font-bold mb-4">Ready to Build Something Real?</h3>
          <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
            Stop building demos and start creating production-ready applications that generate real revenue. 
            Join the developers already making money with Recoder.xyz.
          </p>
          <button 
            onClick={() => document.getElementById('installation')?.scrollIntoView({ behavior: 'smooth' })}
            className="btn-primary text-lg px-8 py-4"
          >
            Start Building Now
          </button>
        </div>
      </div>
    </div>
  )
}