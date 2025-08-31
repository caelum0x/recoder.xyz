'use client';

import { 
  Building2, Shield, Cloud, Users, Zap, CheckCircle, 
  ArrowRight, Phone, Mail, Calendar, Award, Lock,
  Headphones, Globe, Settings, BarChart3
} from 'lucide-react';

// Simple button component
const Button = ({ children, className = '', size = 'md', ...props }: any) => {
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };
  
  return (
    <button 
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default function EnterprisePage() {
  const enterpriseFeatures = [
    {
      icon: Shield,
      title: "Advanced Security",
      description: "Enterprise-grade security with SSO, SAML, SCIM provisioning, and compliance certifications.",
      features: [
        "Single Sign-On (SSO) integration",
        "SAML 2.0 authentication",
        "SCIM user provisioning",
        "SOC 2 Type II certified",
        "ISO 27001 compliance",
        "Advanced audit logging"
      ]
    },
    {
      icon: Cloud,
      title: "Private Cloud Deployment",
      description: "Deploy Recoder.xyz on your own infrastructure with dedicated cloud instances.",
      features: [
        "AWS, Azure, GCP deployment",
        "Dedicated VPC environments",
        "Custom domain configuration",
        "Private Docker registries",
        "On-premises deployment",
        "Hybrid cloud solutions"
      ]
    },
    {
      icon: Users,
      title: "Team Management",
      description: "Comprehensive team management with granular permissions and role-based access.",
      features: [
        "Unlimited team members",
        "Role-based access control",
        "Department organization",
        "Custom user roles",
        "Team analytics & insights",
        "Bulk user management"
      ]
    },
    {
      icon: Settings,
      title: "Custom Integrations",
      description: "Deep integrations with your existing enterprise tools and workflows.",
      features: [
        "Custom API endpoints",
        "Webhook integrations",
        "Enterprise connectors",
        "Legacy system support",
        "Custom authentication",
        "Data migration services"
      ]
    }
  ];

  const pricingTiers = [
    {
      name: "Professional",
      price: "$49",
      period: "per user/month",
      description: "For growing teams that need advanced collaboration features",
      features: [
        "Up to 100 team members",
        "Priority support",
        "Advanced analytics",
        "Team collaboration tools",
        "API access",
        "99.9% uptime SLA"
      ],
      cta: "Start Free Trial",
      popular: false
    },
    {
      name: "Enterprise",
      price: "$99",
      period: "per user/month",
      description: "For large organizations with complex requirements",
      features: [
        "Unlimited team members",
        "24/7 dedicated support",
        "Advanced security features",
        "Custom integrations",
        "On-premises deployment",
        "99.99% uptime SLA"
      ],
      cta: "Contact Sales",
      popular: true
    },
    {
      name: "Enterprise Plus",
      price: "Custom",
      period: "contact for pricing",
      description: "For enterprises requiring white-label solutions",
      features: [
        "White-label solution",
        "Custom development",
        "Dedicated infrastructure",
        "Custom SLA agreements",
        "Compliance consulting",
        "Migration assistance"
      ],
      cta: "Schedule Demo",
      popular: false
    }
  ];

  const clientLogos = [
    { name: "Microsoft", logo: "/enterprise/microsoft-logo.png" },
    { name: "Amazon", logo: "/enterprise/amazon-logo.png" },
    { name: "Google", logo: "/enterprise/google-logo.png" },
    { name: "IBM", logo: "/enterprise/ibm-logo.png" },
    { name: "Oracle", logo: "/enterprise/oracle-logo.png" },
    { name: "Salesforce", logo: "/enterprise/salesforce-logo.png" }
  ];

  const caseStudies = [
    {
      company: "TechCorp Global",
      industry: "Technology",
      employees: "50,000+",
      results: [
        "65% faster development cycles",
        "$2.5M annual cost savings",
        "99.9% developer satisfaction"
      ],
      quote: "Recoder.xyz transformed our development workflow across 200+ teams worldwide.",
      logo: "/enterprise/techcorp-logo.png"
    },
    {
      company: "FinanceSecure Inc",
      industry: "Financial Services",
      employees: "15,000+",
      results: [
        "100% compliance achievement",
        "40% reduction in security incidents",
        "85% faster code reviews"
      ],
      quote: "The security features and compliance tools exceed our strict financial industry requirements.",
      logo: "/enterprise/financesecure-logo.png"
    }
  ];

  const supportOptions = [
    {
      icon: Headphones,
      title: "24/7 Dedicated Support",
      description: "Round-the-clock support from our enterprise team",
      features: [
        "Dedicated customer success manager",
        "Priority support queue",
        "Phone and video support",
        "Custom SLA agreements"
      ]
    },
    {
      icon: Users,
      title: "Professional Services",
      description: "Expert services to ensure successful deployment",
      features: [
        "Implementation consulting",
        "Custom integration development",
        "Training and onboarding",
        "Migration assistance"
      ]
    },
    {
      icon: BarChart3,
      title: "Success Analytics",
      description: "Comprehensive insights into your team's usage",
      features: [
        "Usage analytics dashboard",
        "Performance metrics",
        "ROI reporting",
        "Custom reporting"
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-6">
            Enterprise Solutions
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-12">
            Scale your development teams with enterprise-grade security, custom deployments, and dedicated support. 
            Built for the world's largest organizations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
              <Calendar className="mr-2 h-5 w-5" />
              Schedule Demo
            </Button>
            <Button size="lg" className="bg-gray-600 hover:bg-gray-700 text-white">
              <Phone className="mr-2 h-5 w-5" />
              Contact Sales
            </Button>
          </div>

          {/* Trusted by logos */}
          <div className="mb-16">
            <p className="text-gray-500 dark:text-gray-400 mb-8">Trusted by industry leaders</p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center opacity-60">
              {clientLogos.map((client, index) => (
                <div key={index} className="flex items-center justify-center">
                  <div className="bg-gray-200 dark:bg-gray-700 rounded-lg p-4 w-24 h-16 flex items-center justify-center">
                    <span className="text-gray-600 dark:text-gray-300 text-sm font-medium">
                      {client.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Enterprise Features */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Enterprise-Grade Features
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {enterpriseFeatures.map((feature, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-8">
                <div className="flex items-center mb-6">
                  <feature.icon className="h-12 w-12 text-blue-600 mr-4" />
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{feature.title}</h3>
                    <p className="text-gray-600 dark:text-gray-300 mt-2">{feature.description}</p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {feature.features.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Enterprise Pricing
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {pricingTiers.map((tier, index) => (
              <div key={index} className={`bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 ${tier.popular ? 'ring-2 ring-blue-500 scale-105' : ''}`}>
                {tier.popular && (
                  <div className="text-center mb-4">
                    <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </span>
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{tier.name}</h3>
                  <div className="mb-2">
                    <span className="text-4xl font-bold text-gray-900 dark:text-white">{tier.price}</span>
                    <span className="text-gray-600 dark:text-gray-400 ml-1">/{tier.period}</span>
                  </div>
                  <p className="text-gray-600 dark:text-gray-300">{tier.description}</p>
                </div>
                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-300">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button className={`w-full ${tier.popular ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-white'}`}>
                  {tier.cta}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Case Studies */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Enterprise Success Stories
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {caseStudies.map((study, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <div className="flex items-center mb-6">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mr-4">
                    <Building2 className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{study.company}</h3>
                    <p className="text-gray-600 dark:text-gray-400">{study.industry} • {study.employees} employees</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {study.results.map((result, resultIndex) => (
                    <div key={resultIndex} className="text-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">{result}</div>
                    </div>
                  ))}
                </div>
                <blockquote className="text-gray-600 dark:text-gray-300 italic">
                  "{study.quote}"
                </blockquote>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Support Options */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Enterprise Support & Services
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {supportOptions.map((option, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
                <div className="bg-gradient-to-br from-purple-500 to-blue-600 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
                  <option.icon className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{option.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">{option.description}</p>
                <ul className="space-y-2 text-left">
                  {option.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start">
                      <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-1 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security & Compliance */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-8">
            Security & Compliance First
          </h2>
          <p className="text-xl text-gray-600 dark:text-gray-300 mb-12 max-w-3xl mx-auto">
            Built with enterprise security from the ground up. We maintain the highest standards 
            of security and compliance to protect your code and data.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
                <Shield className="h-12 w-12 text-green-600 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">SOC 2 Type II</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Certified</p>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
                <Lock className="h-12 w-12 text-blue-600 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">ISO 27001</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Compliant</p>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
                <Globe className="h-12 w-12 text-purple-600 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">GDPR</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Ready</p>
              </div>
            </div>
            <div className="text-center">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-lg">
                <Award className="h-12 w-12 text-orange-600 mx-auto mb-3" />
                <h3 className="font-bold text-gray-900 dark:text-white mb-1">HIPAA</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">Compliant</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Ready to Transform Your Enterprise Development?</h2>
          <p className="text-xl text-blue-100 mb-8">
            Join the world's leading companies using Recoder.xyz to accelerate their development teams.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
              <Calendar className="mr-2 h-5 w-5" />
              Schedule Enterprise Demo
            </Button>
            <Button size="lg" className="bg-blue-500 hover:bg-blue-400 text-white">
              <Mail className="mr-2 h-5 w-5" />
              Contact Enterprise Sales
            </Button>
          </div>
          <div className="mt-8 text-blue-100">
            <p>Questions? Call our enterprise team: <strong>1-800-RECODER</strong></p>
          </div>
        </div>
      </section>
    </div>
  );
}
