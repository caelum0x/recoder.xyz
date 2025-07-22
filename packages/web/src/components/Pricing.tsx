import { Check, Star, Zap, Shield, Crown } from 'lucide-react'

export function Pricing() {
  const plans = [
    {
      name: 'Open Source',
      price: '$0',
      period: '/forever',
      description: 'Perfect for learning and personal projects',
      icon: <Star className="w-6 h-6" />,
      color: 'border-gray-300',
      features: [
        'Full CLI with basic features',
        'Community support',
        'Basic AI agent access',
        'Local development',
        'GitHub repository access',
        'Basic templates',
        'Community Discord'
      ],
      limitations: [
        'Limited cloud AI usage',
        'Community support only',
        'Basic error handling'
      ],
      cta: 'Get Started Free',
      popular: false
    },
    {
      name: 'Pro',
      price: '$49',
      period: '/month',
      description: 'Ideal for professional developers and small teams',
      icon: <Zap className="w-6 h-6" />,
      color: 'border-blue-500',
      features: [
        'Everything in Open Source',
        'Advanced AI agents',
        'Production engine access',
        'Priority support',
        'Team collaboration',
        'Advanced templates',
        'Real integration testing',
        'Performance optimization',
        'Usage analytics'
      ],
      limitations: [],
      cta: 'Start Pro Trial',
      popular: true
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      period: '/month',
      description: 'For organizations with specific requirements',
      icon: <Crown className="w-6 h-6" />,
      color: 'border-purple-500',
      features: [
        'Everything in Pro',
        'Custom integrations',
        'On-premise deployment',
        'SLA guarantees',
        'Dedicated support',
        'Custom training',
        'Security compliance',
        'Multi-region deployment',
        'Custom AI models',
        'White-label options'
      ],
      limitations: [],
      cta: 'Contact Sales',
      popular: false
    }
  ]

  const faqs = [
    {
      question: 'What makes Recoder different from GitHub Copilot?',
      answer: 'Recoder generates REAL, production-ready applications with working databases, payments, and deployments - not just code suggestions or mock implementations.'
    },
    {
      question: 'Can I use my own AI models?',
      answer: 'Yes! Recoder supports local models via Ollama, custom API endpoints, and even fine-tuned models for maximum privacy and customization.'
    },
    {
      question: 'How does the pricing work for AI usage?',
      answer: 'Open Source includes basic AI usage. Pro includes generous cloud AI credits. Enterprise includes unlimited usage with cost optimization.'
    },
    {
      question: 'Is my code secure?',
      answer: 'Absolutely. We offer local-only processing, encrypted cloud communication, and never store your code. Enterprise includes additional security certifications.'
    }
  ]

  return (
    <div className="container-width">
      <div className="text-center mb-12">
        <h2 className="text-3xl lg:text-4xl font-bold mb-4">
          <span className="gradient-text">Simple, Transparent Pricing</span>
        </h2>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Start free and upgrade when you're ready. All plans include access to real code generation - 
          no hidden fees or usage limits on core features.
        </p>
      </div>

      {/* Pricing Cards */}
      <div className="grid md:grid-cols-3 gap-8 mb-16">
        {plans.map((plan, index) => (
          <div 
            key={index} 
            className={`feature-card relative ${plan.popular ? 'ring-2 ring-blue-500 scale-105' : ''}`}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="bg-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </span>
              </div>
            )}
            
            <div className="text-center mb-6">
              <div className={`w-12 h-12 mx-auto mb-4 rounded-lg border-2 ${plan.color} flex items-center justify-center`}>
                {plan.icon}
              </div>
              <h3 className="text-2xl font-bold mb-2">{plan.name}</h3>
              <div className="text-3xl font-bold mb-1">
                {plan.price}
                <span className="text-lg font-normal text-gray-600">{plan.period}</span>
              </div>
              <p className="text-gray-600">{plan.description}</p>
            </div>

            <div className="space-y-4 mb-8">
              <div>
                <h4 className="font-semibold mb-3">Features included:</h4>
                <ul className="space-y-2">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start space-x-2">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {plan.limitations.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-3 text-gray-500">Limitations:</h4>
                  <ul className="space-y-2">
                    {plan.limitations.map((limitation, limitIndex) => (
                      <li key={limitIndex} className="flex items-start space-x-2">
                        <div className="w-4 h-4 border border-gray-300 rounded-full mt-0.5 flex-shrink-0"></div>
                        <span className="text-sm text-gray-500">{limitation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button 
              className={`w-full py-3 px-6 rounded-lg font-semibold transition-all duration-200 ${
                plan.popular 
                  ? 'btn-primary' 
                  : 'btn-secondary hover:border-blue-300'
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>

      {/* Feature Comparison */}
      <div className="mb-16">
        <h3 className="text-2xl font-bold text-center mb-8">Feature Comparison</h3>
        <div className="feature-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-4 px-4 font-semibold">Feature</th>
                <th className="text-center py-4 px-4 font-semibold">Open Source</th>
                <th className="text-center py-4 px-4 font-semibold text-blue-600">Pro</th>
                <th className="text-center py-4 px-4 font-semibold">Enterprise</th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 font-medium">AI Model Access</td>
                <td className="py-3 px-4 text-center">Basic</td>
                <td className="py-3 px-4 text-center text-blue-600">Advanced</td>
                <td className="py-3 px-4 text-center">Unlimited</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 font-medium">Production Engine</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center text-green-500">✅</td>
                <td className="py-3 px-4 text-center text-green-500">✅</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 font-medium">Team Collaboration</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center text-green-500">✅</td>
                <td className="py-3 px-4 text-center text-green-500">✅</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 font-medium">Priority Support</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center text-green-500">✅</td>
                <td className="py-3 px-4 text-center text-green-500">✅ + SLA</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="py-3 px-4 font-medium">Custom Integrations</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center text-green-500">✅</td>
              </tr>
              <tr>
                <td className="py-3 px-4 font-medium">On-premise Deployment</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center text-green-500">✅</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Security & Compliance */}
      <div className="mb-16">
        <div className="feature-card bg-gradient-to-r from-gray-50 to-blue-50 border border-gray-200">
          <div className="flex items-center space-x-3 mb-6">
            <Shield className="w-8 h-8 text-blue-600" />
            <h3 className="text-2xl font-bold">Security & Compliance</h3>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Data Protection</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• End-to-end encryption</li>
                <li>• Local-first processing</li>
                <li>• Zero data retention</li>
                <li>• GDPR compliant</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Enterprise Security</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• SOC 2 Type II</li>
                <li>• HIPAA compliance</li>
                <li>• Penetration testing</li>
                <li>• Vulnerability scanning</li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Development Security</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Code vulnerability scanning</li>
                <li>• Dependency auditing</li>
                <li>• Security best practices</li>
                <li>• Audit trails</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* FAQ Section */}
      <div>
        <h3 className="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h3>
        <div className="grid md:grid-cols-2 gap-6">
          {faqs.map((faq, index) => (
            <div key={index} className="feature-card">
              <h4 className="font-semibold mb-3">{faq.question}</h4>
              <p className="text-gray-600 text-sm">{faq.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}