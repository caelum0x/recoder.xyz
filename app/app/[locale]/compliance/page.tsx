'use client';

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { 
  Shield, Lock, Eye, Download, CheckCircle, FileText, 
  Globe, Award, Building2, Users, AlertTriangle, 
  Clock, Zap, ArrowRight, ExternalLink
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

export default function CompliancePage() {
  const certifications = [
    {
      icon: Shield,
      title: "SOC 2 Type II",
      status: "Certified",
      description: "Comprehensive security controls audit for availability, confidentiality, and processing integrity.",
      validUntil: "December 2025",
      downloadUrl: "/compliance/soc2-report.pdf",
      color: "green"
    },
    {
      icon: Award,
      title: "ISO 27001",
      status: "Certified",
      description: "International standard for information security management systems (ISMS).",
      validUntil: "March 2025",
      downloadUrl: "/compliance/iso27001-certificate.pdf",
      color: "blue"
    },
    {
      icon: Globe,
      title: "GDPR",
      status: "Compliant",
      description: "Full compliance with European Union General Data Protection Regulation.",
      validUntil: "Ongoing",
      downloadUrl: "/compliance/gdpr-compliance.pdf",
      color: "purple"
    },
    {
      icon: Building2,
      title: "HIPAA",
      status: "Compliant",
      description: "Health Insurance Portability and Accountability Act compliance for healthcare data.",
      validUntil: "Ongoing",
      downloadUrl: "/compliance/hipaa-compliance.pdf",
      color: "orange"
    },
    {
      icon: Lock,
      title: "FedRAMP",
      status: "In Progress",
      description: "Federal Risk and Authorization Management Program certification for government use.",
      validUntil: "Expected Q2 2025",
      downloadUrl: null,
      color: "yellow"
    },
    {
      icon: Users,
      title: "PCI DSS",
      status: "Certified",
      description: "Payment Card Industry Data Security Standard for secure payment processing.",
      validUntil: "August 2025",
      downloadUrl: "/compliance/pci-dss-certificate.pdf",
      color: "red"
    }
  ];

  const dataProtection = [
    {
      title: "Data Encryption",
      description: "All data encrypted in transit and at rest using AES-256 encryption",
      icon: Lock,
      details: [
        "TLS 1.3 for data in transit",
        "AES-256 encryption at rest",
        "Key rotation every 90 days",
        "Hardware security modules (HSM)"
      ]
    },
    {
      title: "Access Controls",
      description: "Strict access controls and authentication mechanisms",
      icon: Eye,
      details: [
        "Multi-factor authentication",
        "Role-based access control",
        "Least privilege principle",
        "Regular access reviews"
      ]
    },
    {
      title: "Data Residency",
      description: "Control where your data is stored and processed",
      icon: Globe,
      details: [
        "US, EU, APAC data centers",
        "Data sovereignty compliance",
        "Cross-border transfer controls",
        "Regional compliance options"
      ]
    },
    {
      title: "Audit Logging",
      description: "Comprehensive audit trails for all system activities",
      icon: FileText,
      details: [
        "Immutable audit logs",
        "Real-time monitoring",
        "Compliance reporting",
        "Long-term retention"
      ]
    }
  ];

  const policies = [
    {
      title: "Privacy Policy",
      description: "How we collect, use, and protect your personal information",
      lastUpdated: "January 2025",
      downloadUrl: "/legal/privacy-policy.pdf"
    },
    {
      title: "Terms of Service",
      description: "Legal terms governing the use of Recoder.xyz services",
      lastUpdated: "January 2025",
      downloadUrl: "/legal/terms-of-service.pdf"
    },
    {
      title: "Data Processing Agreement",
      description: "GDPR-compliant data processing terms for enterprise customers",
      lastUpdated: "December 2024",
      downloadUrl: "/legal/data-processing-agreement.pdf"
    },
    {
      title: "Security Whitepaper",
      description: "Comprehensive overview of our security architecture and practices",
      lastUpdated: "November 2024",
      downloadUrl: "/legal/security-whitepaper.pdf"
    },
    {
      title: "Incident Response Plan",
      description: "Our procedures for handling security incidents and breaches",
      lastUpdated: "October 2024",
      downloadUrl: "/legal/incident-response-plan.pdf"
    },
    {
      title: "Business Continuity Plan",
      description: "How we ensure service continuity during disruptions",
      lastUpdated: "September 2024",
      downloadUrl: "/legal/business-continuity-plan.pdf"
    }
  ];

  const complianceProcess = [
    {
      step: 1,
      title: "Assessment",
      description: "We regularly assess our systems against compliance requirements",
      icon: FileText
    },
    {
      step: 2,
      title: "Implementation",
      description: "Implement necessary controls and security measures",
      icon: Zap
    },
    {
      step: 3,
      title: "Audit",
      description: "Third-party audits validate our compliance posture",
      icon: Eye
    },
    {
      step: 4,
      title: "Certification",
      description: "Obtain and maintain relevant certifications",
      icon: Award
    }
  ];

  const getStatusColor = (color: string) => {
    const colors = {
      green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
      orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
      yellow: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <SiteHeader />
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent mb-6">
            Compliance & Security
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-12">
            We maintain the highest standards of security and compliance to protect your code and data. 
            Our comprehensive compliance program ensures your organization can trust Recoder.xyz with your most sensitive information.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
              <Download className="mr-2 h-5 w-5" />
              Download Security Overview
            </Button>
            <Button size="lg" className="bg-gray-600 hover:bg-gray-700 text-white">
              View Audit Reports
              <ExternalLink className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </div>
      </section>

      {/* Security Stats */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-600 mb-2">99.99%</div>
              <div className="text-gray-600 dark:text-gray-400">Uptime SLA</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-600 mb-2">256-bit</div>
              <div className="text-gray-600 dark:text-gray-400">AES Encryption</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-purple-600 mb-2">6</div>
              <div className="text-gray-600 dark:text-gray-400">Compliance Certifications</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-orange-600 mb-2">&lt;15min</div>
              <div className="text-gray-600 dark:text-gray-400">Incident Response</div>
            </div>
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Compliance Certifications
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {certifications.map((cert, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <cert.icon className="h-12 w-12 text-blue-600" />
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(cert.color)}`}>
                    {cert.status}
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{cert.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-4">{cert.description}</p>
                <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
                  <span>Valid until: {cert.validUntil}</span>
                </div>
                {cert.downloadUrl ? (
                  <Button size="sm" className="w-full bg-blue-100 hover:bg-blue-200 text-blue-800 dark:bg-blue-900 dark:hover:bg-blue-800 dark:text-blue-200">
                    <Download className="mr-2 h-4 w-4" />
                    Download Certificate
                  </Button>
                ) : (
                  <Button size="sm" className="w-full bg-gray-100 text-gray-500 cursor-not-allowed" disabled>
                    <Clock className="mr-2 h-4 w-4" />
                    Certification Pending
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Data Protection */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Data Protection & Security
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {dataProtection.map((protection, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <div className="flex items-center mb-6">
                  <protection.icon className="h-12 w-12 text-purple-600 mr-4" />
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{protection.title}</h3>
                    <p className="text-gray-600 dark:text-gray-300">{protection.description}</p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {protection.details.map((detail, detailIndex) => (
                    <li key={detailIndex} className="flex items-start">
                      <CheckCircle className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-300">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance Process */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Our Compliance Process
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {complianceProcess.map((process, index) => (
              <div key={index} className="text-center">
                <div className="bg-gradient-to-br from-orange-500 to-purple-600 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <process.icon className="h-8 w-8 text-white" />
                </div>
                <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-4">
                  <span className="font-bold">{process.step}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{process.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{process.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Legal Documents */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Legal Documents & Policies
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {policies.map((policy, index) => (
              <div key={index} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <FileText className="h-8 w-8 text-gray-600 dark:text-gray-300" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Updated {policy.lastUpdated}</span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{policy.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{policy.description}</p>
                <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700 text-white">
                  <Download className="mr-2 h-4 w-4" />
                  Download PDF
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Incident Response */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="text-center mb-8">
              <AlertTriangle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Security Incident Response
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                We take security incidents seriously and have established procedures to respond quickly and effectively.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-red-100 dark:bg-red-900 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <Clock className="h-8 w-8 text-red-600 dark:text-red-300" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">&lt;15 Minutes</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">Initial response time</p>
              </div>
              <div className="text-center">
                <div className="bg-orange-100 dark:bg-orange-900 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <Users className="h-8 w-8 text-orange-600 dark:text-orange-300" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">24/7 Team</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">Dedicated security team</p>
              </div>
              <div className="text-center">
                <div className="bg-green-100 dark:bg-green-900 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-green-600 dark:text-green-300" />
                </div>
                <h3 className="font-bold text-gray-900 dark:text-white mb-2">Full Protection</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm">Comprehensive incident handling</p>
              </div>
            </div>
            <div className="text-center mt-8">
              <Button className="bg-red-600 hover:bg-red-700 text-white">
                Report Security Issue
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-orange-500 to-purple-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Questions About Our Compliance?</h2>
          <p className="text-xl text-blue-100 mb-8">
            Our compliance team is here to help you understand how Recoder.xyz meets your security requirements.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
              Contact Compliance Team
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
            <Button size="lg" className="bg-blue-500 hover:bg-blue-400 text-white">
              Schedule Security Review
            </Button>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
