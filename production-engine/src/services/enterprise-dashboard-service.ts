/**
 * Enterprise Sales Dashboard Service for Recoder.ai DaaS Platform
 * Handles enterprise analytics, sales metrics, customer management, and admin tools
 */

import { logger } from '../utils/logger';
import { userService } from './user-service';
import { billingService } from './billing-service';
import { projectService } from './project-service';

export interface EnterpriseCustomer {
  id: string;
  companyName: string;
  domain: string;
  industry: string;
  size: 'startup' | 'small' | 'medium' | 'large' | 'enterprise';
  
  // Contact information
  primaryContact: {
    name: string;
    email: string;
    title: string;
    phone?: string;
  };
  
  // Business details
  description: string;
  website: string;
  revenue: string; // e.g., "$1M-$5M"
  employees: number;
  techStack: string[];
  useCase: string;
  
  // Account status
  status: 'prospect' | 'trial' | 'active' | 'churned' | 'paused';
  tier: 'free' | 'professional' | 'business' | 'enterprise';
  
  // Sales process
  leadSource: string;
  salesStage: 'lead' | 'qualified' | 'demo' | 'proposal' | 'negotiation' | 'closed-won' | 'closed-lost';
  assignedSalesRep: string;
  dealValue: number; // Annual contract value
  closeDate?: Date;
  
  // Usage metrics
  metrics: {
    totalUsers: number;
    activeUsers: number;
    projectsCreated: number;
    codeGenerated: number; // lines of code
    deploymentsCount: number;
    lastActivity: Date;
  };
  
  // Engagement
  engagement: {
    onboardingCompleted: boolean;
    supportTickets: number;
    npsScore?: number;
    lastNpsDate?: Date;
    healthScore: number; // 0-100
    riskLevel: 'low' | 'medium' | 'high';
  };
  
  // Financial
  financial: {
    mrr: number; // Monthly recurring revenue
    arr: number; // Annual recurring revenue
    churnRisk: number; // 0-100
    paymentMethod: string;
    billingContact: string;
    invoiceEmail: string;
  };
  
  // Custom fields for enterprise
  customFields: Record<string, any>;
  
  // Timeline
  createdAt: Date;
  updatedAt: Date;
  trialStartDate?: Date;
  trialEndDate?: Date;
  conversionDate?: Date;
}

export interface SalesMetrics {
  overview: {
    totalRevenue: number;
    monthlyRecurring: number;
    annualRecurring: number;
    totalCustomers: number;
    activeTrials: number;
    conversionRate: number;
  };
  
  pipeline: {
    totalPipelineValue: number;
    averageDealSize: number;
    salesCycleLength: number; // days
    stageBreakdown: Array<{
      stage: string;
      count: number;
      value: number;
    }>;
  };
  
  performance: {
    newCustomersThisMonth: number;
    churnRate: number;
    expansionRevenue: number;
    customerLifetimeValue: number;
    customerAcquisitionCost: number;
  };
  
  trends: {
    revenueGrowth: Array<{
      month: string;
      revenue: number;
      customers: number;
      churn: number;
    }>;
    conversionFunnel: Array<{
      stage: string;
      count: number;
      conversionRate: number;
    }>;
  };
}

export interface AdminAnalytics {
  platform: {
    totalUsers: number;
    activeUsers: number;
    newSignupsToday: number;
    userGrowthRate: number;
  };
  
  usage: {
    totalProjectsCreated: number;
    codeGenerated: number; // total lines
    deploymentsToday: number;
    apiCallsToday: number;
    averageSessionTime: number;
  };
  
  infrastructure: {
    serverHealth: Array<{
      service: string;
      status: 'healthy' | 'warning' | 'critical';
      uptime: number;
      responseTime: number;
    }>;
    costs: {
      aiProviders: number;
      infrastructure: number;
      total: number;
    };
  };
  
  quality: {
    averageRating: number;
    supportTickets: {
      open: number;
      resolved: number;
      averageResponseTime: number;
    };
    bugReports: number;
    featureRequests: number;
  };
}

export interface SalesActivity {
  id: string;
  customerId: string;
  type: 'call' | 'email' | 'meeting' | 'demo' | 'proposal' | 'contract' | 'note';
  title: string;
  description: string;
  salesRep: string;
  outcome?: string;
  nextAction?: string;
  createdAt: Date;
  scheduledAt?: Date;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  type: 'email' | 'social' | 'ads' | 'content' | 'webinar' | 'conference';
  status: 'draft' | 'active' | 'paused' | 'completed';
  
  targeting: {
    audience: string;
    criteria: Record<string, any>;
    estimatedReach: number;
  };
  
  content: {
    subject?: string;
    message: string;
    ctaText: string;
    ctaUrl: string;
  };
  
  metrics: {
    sent: number;
    opened: number;
    clicked: number;
    converted: number;
    leads: number;
    revenue: number;
  };
  
  schedule: {
    startDate: Date;
    endDate?: Date;
    timezone: string;
  };
  
  budget: {
    allocated: number;
    spent: number;
    costPerLead: number;
    roas: number; // Return on ad spend
  };
  
  createdAt: Date;
  updatedAt: Date;
}

export class EnterpriseDashboardService {
  private customers: Map<string, EnterpriseCustomer> = new Map();
  private salesActivities: Map<string, SalesActivity[]> = new Map(); // customerId -> activities
  private campaigns: Map<string, MarketingCampaign> = new Map();
  private salesReps: Map<string, any> = new Map();

  constructor() {
    this.initializeEnterpriseDashboard();
  }

  private initializeEnterpriseDashboard(): void {
    logger.info('🏢 Initializing Enterprise Sales Dashboard Service...');
    
    // Initialize demo enterprise customers
    this.initializeDemoCustomers();
    
    // Initialize sales team
    this.initializeSalesTeam();
    
    // Initialize demo campaigns
    this.initializeDemoCampaigns();
    
    logger.info('✅ Enterprise Sales Dashboard Service initialized');
  }

  /**
   * Get comprehensive sales metrics
   */
  getSalesMetrics(timeframe: number = 30): SalesMetrics {
    const customers = Array.from(this.customers.values());
    const activeCustomers = customers.filter(c => c.status === 'active');
    const trials = customers.filter(c => c.status === 'trial');
    
    // Calculate revenue metrics
    const totalMRR = activeCustomers.reduce((sum, c) => sum + c.financial.mrr, 0);
    const totalARR = activeCustomers.reduce((sum, c) => sum + c.financial.arr, 0);
    
    // Pipeline analysis
    const pipeline = customers.filter(c => ['qualified', 'demo', 'proposal', 'negotiation'].includes(c.salesStage));
    const totalPipelineValue = pipeline.reduce((sum, c) => sum + c.dealValue, 0);
    
    // Stage breakdown
    const stageBreakdown = [
      'lead', 'qualified', 'demo', 'proposal', 'negotiation', 'closed-won', 'closed-lost'
    ].map(stage => ({
      stage,
      count: customers.filter(c => c.salesStage === stage).length,
      value: customers.filter(c => c.salesStage === stage).reduce((sum, c) => sum + c.dealValue, 0)
    }));

    return {
      overview: {
        totalRevenue: totalARR,
        monthlyRecurring: totalMRR,
        annualRecurring: totalARR,
        totalCustomers: activeCustomers.length,
        activeTrials: trials.length,
        conversionRate: trials.length > 0 ? (activeCustomers.length / (activeCustomers.length + trials.length)) * 100 : 0
      },
      pipeline: {
        totalPipelineValue,
        averageDealSize: pipeline.length > 0 ? totalPipelineValue / pipeline.length : 0,
        salesCycleLength: 45, // Mock data
        stageBreakdown
      },
      performance: {
        newCustomersThisMonth: 12, // Mock data
        churnRate: 2.5,
        expansionRevenue: 50000,
        customerLifetimeValue: 25000,
        customerAcquisitionCost: 1200
      },
      trends: {
        revenueGrowth: this.generateRevenueGrowthData(),
        conversionFunnel: this.generateConversionFunnelData()
      }
    };
  }

  /**
   * Get admin analytics
   */
  getAdminAnalytics(): AdminAnalytics {
    const allUsers = Array.from(userService['users']?.values() || []);
    const totalUsers = allUsers.length;
    
    return {
      platform: {
        totalUsers,
        activeUsers: Math.floor(totalUsers * 0.7),
        newSignupsToday: 25,
        userGrowthRate: 12.5
      },
      usage: {
        totalProjectsCreated: 15420,
        codeGenerated: 2847392, // lines
        deploymentsToday: 145,
        apiCallsToday: 8924,
        averageSessionTime: 1847 // seconds
      },
      infrastructure: {
        serverHealth: [
          { service: 'Production Engine', status: 'healthy', uptime: 99.9, responseTime: 245 },
          { service: 'Database', status: 'healthy', uptime: 99.8, responseTime: 12 },
          { service: 'AI Providers', status: 'warning', uptime: 97.2, responseTime: 890 },
          { service: 'File Storage', status: 'healthy', uptime: 99.95, responseTime: 156 }
        ],
        costs: {
          aiProviders: 12450,
          infrastructure: 8920,
          total: 21370
        }
      },
      quality: {
        averageRating: 4.7,
        supportTickets: {
          open: 23,
          resolved: 145,
          averageResponseTime: 4.2 // hours
        },
        bugReports: 8,
        featureRequests: 34
      }
    };
  }

  /**
   * Add new enterprise customer
   */
  async addEnterpriseCustomer(
    customerData: Omit<EnterpriseCustomer, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ success: boolean; customer?: EnterpriseCustomer; error?: string }> {
    try {
      const customerId = this.generateCustomerId();
      
      const customer: EnterpriseCustomer = {
        id: customerId,
        ...customerData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.customers.set(customerId, customer);
      this.salesActivities.set(customerId, []);

      logger.info(`🏢 Enterprise customer added: ${customer.companyName}`);

      return { success: true, customer };

    } catch (error: any) {
      logger.error('Add enterprise customer failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update enterprise customer
   */
  async updateEnterpriseCustomer(
    customerId: string,
    updates: Partial<EnterpriseCustomer>
  ): Promise<{ success: boolean; customer?: EnterpriseCustomer; error?: string }> {
    try {
      const customer = this.customers.get(customerId);
      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      const updatedCustomer = {
        ...customer,
        ...updates,
        updatedAt: new Date()
      };

      this.customers.set(customerId, updatedCustomer);

      logger.info(`🔄 Enterprise customer updated: ${updatedCustomer.companyName}`);

      return { success: true, customer: updatedCustomer };

    } catch (error: any) {
      logger.error('Update enterprise customer failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get enterprise customers
   */
  getEnterpriseCustomers(filters?: {
    status?: string;
    tier?: string;
    salesStage?: string;
    industry?: string;
    riskLevel?: string;
    limit?: number;
    offset?: number;
  }): {
    customers: EnterpriseCustomer[];
    total: number;
    summary: {
      byStatus: Record<string, number>;
      byTier: Record<string, number>;
      byRisk: Record<string, number>;
    };
  } {
    let customers = Array.from(this.customers.values());

    // Apply filters
    if (filters) {
      if (filters.status) {
        customers = customers.filter(c => c.status === filters.status);
      }
      if (filters.tier) {
        customers = customers.filter(c => c.tier === filters.tier);
      }
      if (filters.salesStage) {
        customers = customers.filter(c => c.salesStage === filters.salesStage);
      }
      if (filters.industry) {
        customers = customers.filter(c => c.industry === filters.industry);
      }
      if (filters.riskLevel) {
        customers = customers.filter(c => c.engagement.riskLevel === filters.riskLevel);
      }
    }

    // Sort by deal value (highest first)
    customers.sort((a, b) => b.dealValue - a.dealValue);

    const total = customers.length;

    // Apply pagination
    if (filters?.limit) {
      const offset = filters.offset || 0;
      customers = customers.slice(offset, offset + filters.limit);
    }

    // Generate summary
    const allCustomers = Array.from(this.customers.values());
    const summary = {
      byStatus: this.groupBy(allCustomers, 'status'),
      byTier: this.groupBy(allCustomers, 'tier'),
      byRisk: this.groupBy(allCustomers, c => c.engagement.riskLevel)
    };

    return { customers, total, summary };
  }

  /**
   * Get enterprise customer details
   */
  getEnterpriseCustomer(customerId: string): EnterpriseCustomer | null {
    return this.customers.get(customerId) || null;
  }

  /**
   * Add sales activity
   */
  async addSalesActivity(
    customerId: string,
    activityData: Omit<SalesActivity, 'id' | 'customerId' | 'createdAt'>
  ): Promise<{ success: boolean; activity?: SalesActivity; error?: string }> {
    try {
      const customer = this.customers.get(customerId);
      if (!customer) {
        return { success: false, error: 'Customer not found' };
      }

      const activityId = this.generateActivityId();
      const activity: SalesActivity = {
        id: activityId,
        customerId,
        ...activityData,
        createdAt: new Date()
      };

      if (!this.salesActivities.has(customerId)) {
        this.salesActivities.set(customerId, []);
      }
      this.salesActivities.get(customerId)!.push(activity);

      logger.info(`📝 Sales activity added: ${activity.type} for ${customer.companyName}`);

      return { success: true, activity };

    } catch (error: any) {
      logger.error('Add sales activity failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get sales activities for customer
   */
  getCustomerActivities(customerId: string): SalesActivity[] {
    return this.salesActivities.get(customerId) || [];
  }

  /**
   * Create marketing campaign
   */
  async createMarketingCampaign(
    campaignData: Omit<MarketingCampaign, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<{ success: boolean; campaign?: MarketingCampaign; error?: string }> {
    try {
      const campaignId = this.generateCampaignId();
      
      const campaign: MarketingCampaign = {
        id: campaignId,
        ...campaignData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.campaigns.set(campaignId, campaign);

      logger.info(`📢 Marketing campaign created: ${campaign.name}`);

      return { success: true, campaign };

    } catch (error: any) {
      logger.error('Create marketing campaign failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get marketing campaigns
   */
  getMarketingCampaigns(filters?: {
    status?: string;
    type?: string;
    limit?: number;
  }): MarketingCampaign[] {
    let campaigns = Array.from(this.campaigns.values());

    // Apply filters
    if (filters) {
      if (filters.status) {
        campaigns = campaigns.filter(c => c.status === filters.status);
      }
      if (filters.type) {
        campaigns = campaigns.filter(c => c.type === filters.type);
      }
    }

    // Sort by most recent
    campaigns.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply limit
    if (filters?.limit) {
      campaigns = campaigns.slice(0, filters.limit);
    }

    return campaigns;
  }

  /**
   * Generate lead scoring
   */
  generateLeadScore(customer: EnterpriseCustomer): {
    score: number;
    factors: Array<{ factor: string; points: number; reasoning: string }>;
    recommendation: string;
  } {
    const factors = [];
    let totalScore = 0;

    // Company size scoring
    const sizePoints = {
      startup: 10,
      small: 20,
      medium: 40,
      large: 60,
      enterprise: 80
    }[customer.size];
    factors.push({
      factor: 'Company Size',
      points: sizePoints,
      reasoning: `${customer.size} companies typically have higher success rates`
    });
    totalScore += sizePoints;

    // Industry scoring
    const highValueIndustries = ['fintech', 'saas', 'technology', 'healthcare'];
    const industryPoints = highValueIndustries.includes(customer.industry.toLowerCase()) ? 30 : 15;
    factors.push({
      factor: 'Industry',
      points: industryPoints,
      reasoning: `${customer.industry} industry alignment with our target market`
    });
    totalScore += industryPoints;

    // Engagement scoring
    const engagementPoints = Math.round(customer.engagement.healthScore * 0.2);
    factors.push({
      factor: 'Engagement',
      points: engagementPoints,
      reasoning: `Health score of ${customer.engagement.healthScore}/100`
    });
    totalScore += engagementPoints;

    // Usage scoring
    const usagePoints = Math.min(customer.metrics.projectsCreated * 2, 30);
    factors.push({
      factor: 'Platform Usage',
      points: usagePoints,
      reasoning: `${customer.metrics.projectsCreated} projects created shows strong adoption`
    });
    totalScore += usagePoints;

    // Generate recommendation
    let recommendation = '';
    if (totalScore >= 80) {
      recommendation = 'High-priority lead. Schedule executive demo and prepare custom proposal.';
    } else if (totalScore >= 60) {
      recommendation = 'Qualified lead. Engage with technical demo and discuss use cases.';
    } else if (totalScore >= 40) {
      recommendation = 'Potential lead. Nurture with educational content and check-ins.';
    } else {
      recommendation = 'Low-priority lead. Add to email nurture sequence.';
    }

    return {
      score: Math.min(totalScore, 100),
      factors,
      recommendation
    };
  }

  private initializeDemoCustomers(): void {
    const demoCustomers = [
      {
        companyName: 'TechFlow Solutions',
        domain: 'techflow.com',
        industry: 'SaaS',
        size: 'medium' as const,
        primaryContact: {
          name: 'Sarah Chen',
          email: 'sarah.chen@techflow.com',
          title: 'CTO'
        },
        description: 'AI-powered workflow automation platform',
        website: 'https://techflow.com',
        revenue: '$5M-$10M',
        employees: 75,
        techStack: ['React', 'Node.js', 'Python', 'AWS'],
        useCase: 'Rapid prototyping and AI development',
        status: 'active' as const,
        tier: 'business' as const,
        leadSource: 'inbound',
        salesStage: 'closed-won' as const,
        assignedSalesRep: 'john.smith',
        dealValue: 48000,
        metrics: {
          totalUsers: 12,
          activeUsers: 8,
          projectsCreated: 34,
          codeGenerated: 125000,
          deploymentsCount: 89,
          lastActivity: new Date()
        },
        engagement: {
          onboardingCompleted: true,
          supportTickets: 3,
          npsScore: 9,
          healthScore: 85,
          riskLevel: 'low' as const
        },
        financial: {
          mrr: 4000,
          arr: 48000,
          churnRisk: 10,
          paymentMethod: 'Credit Card',
          billingContact: 'finance@techflow.com',
          invoiceEmail: 'billing@techflow.com'
        },
        customFields: {
          contractLength: '12 months',
          integrationNeeds: ['GitHub', 'Slack', 'Jira']
        }
      },
      {
        companyName: 'DataCore Analytics',
        domain: 'datacore.ai',
        industry: 'Data Analytics',
        size: 'large' as const,
        primaryContact: {
          name: 'Michael Rodriguez',
          email: 'michael@datacore.ai',
          title: 'VP Engineering'
        },
        description: 'Enterprise data analytics and machine learning platform',
        website: 'https://datacore.ai',
        revenue: '$50M+',
        employees: 300,
        techStack: ['Python', 'Kubernetes', 'TensorFlow', 'GCP'],
        useCase: 'ML model development and deployment',
        status: 'trial' as const,
        tier: 'enterprise' as const,
        leadSource: 'enterprise_sales',
        salesStage: 'proposal' as const,
        assignedSalesRep: 'emily.watson',
        dealValue: 150000,
        metrics: {
          totalUsers: 45,
          activeUsers: 32,
          projectsCreated: 67,
          codeGenerated: 380000,
          deploymentsCount: 156,
          lastActivity: new Date()
        },
        engagement: {
          onboardingCompleted: true,
          supportTickets: 8,
          npsScore: 8,
          healthScore: 78,
          riskLevel: 'medium' as const
        },
        financial: {
          mrr: 0, // Still in trial
          arr: 0,
          churnRisk: 25,
          paymentMethod: 'Enterprise Invoice',
          billingContact: 'procurement@datacore.ai',
          invoiceEmail: 'ap@datacore.ai'
        },
        customFields: {
          trialLength: '30 days',
          securityRequirements: ['SOC 2', 'GDPR', 'HIPAA']
        }
      }
    ];

    demoCustomers.forEach((customerData, index) => {
      const customerId = `customer_${index + 1}`;
      const customer: EnterpriseCustomer = {
        id: customerId,
        ...customerData,
        createdAt: new Date(Date.now() - Math.random() * 90 * 24 * 60 * 60 * 1000),
        updatedAt: new Date()
      };

      this.customers.set(customerId, customer);
      this.salesActivities.set(customerId, []);
    });

    logger.info(`🏢 Initialized ${demoCustomers.length} demo enterprise customers`);
  }

  private initializeSalesTeam(): void {
    const salesReps = [
      { id: 'john.smith', name: 'John Smith', title: 'Senior Account Executive', email: 'john@recoder.ai' },
      { id: 'emily.watson', name: 'Emily Watson', title: 'Enterprise Sales Director', email: 'emily@recoder.ai' },
      { id: 'david.kim', name: 'David Kim', title: 'Account Executive', email: 'david@recoder.ai' }
    ];

    salesReps.forEach(rep => {
      this.salesReps.set(rep.id, rep);
    });

    logger.info(`👥 Initialized ${salesReps.length} sales team members`);
  }

  private initializeDemoCampaigns(): void {
    const demoCampaigns = [
      {
        name: 'Enterprise Developer Survey 2024',
        type: 'email' as const,
        status: 'active' as const,
        targeting: {
          audience: 'Enterprise CTOs and Engineering VPs',
          criteria: { company_size: 'large', role: 'technical_leader' },
          estimatedReach: 5000
        },
        content: {
          subject: 'The Future of AI-Powered Development: Enterprise Survey',
          message: 'Share your insights on AI development tools and get exclusive access to our enterprise research.',
          ctaText: 'Take Survey',
          ctaUrl: 'https://recoder.ai/enterprise-survey'
        },
        metrics: {
          sent: 4850,
          opened: 1455,
          clicked: 320,
          converted: 85,
          leads: 23,
          revenue: 125000
        },
        schedule: {
          startDate: new Date(),
          timezone: 'UTC'
        },
        budget: {
          allocated: 15000,
          spent: 8500,
          costPerLead: 370,
          roas: 8.3
        }
      }
    ];

    demoCampaigns.forEach((campaignData, index) => {
      const campaignId = `campaign_${index + 1}`;
      const campaign: MarketingCampaign = {
        id: campaignId,
        ...campaignData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.campaigns.set(campaignId, campaign);
    });

    logger.info(`📢 Initialized ${demoCampaigns.length} demo campaigns`);
  }

  private generateRevenueGrowthData() {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    return months.map((month, index) => ({
      month,
      revenue: 50000 + (index * 15000) + Math.random() * 10000,
      customers: 20 + (index * 8) + Math.floor(Math.random() * 5),
      churn: 1 + Math.random() * 3
    }));
  }

  private generateConversionFunnelData() {
    return [
      { stage: 'Visitors', count: 10000, conversionRate: 100 },
      { stage: 'Signups', count: 850, conversionRate: 8.5 },
      { stage: 'Activated Users', count: 650, conversionRate: 76.5 },
      { stage: 'Trial Started', count: 320, conversionRate: 49.2 },
      { stage: 'Paying Customers', count: 85, conversionRate: 26.6 }
    ];
  }

  private groupBy<T>(array: T[], key: string | ((item: T) => string)): Record<string, number> {
    return array.reduce((groups, item) => {
      const groupKey = typeof key === 'string' ? (item as any)[key] : key(item);
      groups[groupKey] = (groups[groupKey] || 0) + 1;
      return groups;
    }, {} as Record<string, number>);
  }

  private generateCustomerId(): string {
    return 'cust_' + Math.random().toString(36).substring(2, 11) + Date.now().toString(36);
  }

  private generateActivityId(): string {
    return 'activity_' + Math.random().toString(36).substring(2, 11);
  }

  private generateCampaignId(): string {
    return 'campaign_' + Math.random().toString(36).substring(2, 11);
  }
}

// Export singleton instance
export const enterpriseDashboardService = new EnterpriseDashboardService();