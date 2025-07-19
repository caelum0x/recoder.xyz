const { BaseAnalyzer } = require('./baseAnalyzer');
const { logger } = require('../utils/logger');

class RequirementAnalyzer extends BaseAnalyzer {
  constructor(options = {}) {
    super(options);
    this.requirementTypes = {
      functional: /\b(user can|system should|must be able to|shall|will)\b/gi,
      nonFunctional: /\b(performance|security|scalability|reliability|usability|maintainability)\b/gi,
      technical: /\b(database|api|framework|library|architecture|technology)\b/gi,
      business: /\b(revenue|cost|profit|market|customer|business)\b/gi,
      security: /\b(authentication|authorization|encryption|privacy|security|ssl|https)\b/gi,
      ui: /\b(interface|design|layout|responsive|mobile|desktop|theme)\b/gi,
      integration: /\b(third.?party|external|api|webhook|integration|connect)\b/gi
    };
  }

  async analyze(requirements, context = {}) {
    try {
      this.validateInput(requirements, ['description']);
      
      const analysis = await this.performAsyncAnalysis(requirements, async (input) => {
        const results = {
          categories: this.categorizeRequirements(input),
          priorities: this.analyzePriorities(input),
          dependencies: this.extractDependencies(input),
          feasibility: this.assessFeasibility(input, context),
          effort: this.estimateEffort(input),
          risks: this.identifyRisks(input),
          acceptance_criteria: this.generateAcceptanceCriteria(input)
        };

        results.summary = this.generateRequirementsSummary(results);
        results.metrics = this.generateMetrics(results);
        
        return results;
      });

      return this.createAnalysisResult(analysis, {
        requirementsCount: Array.isArray(requirements.requirements) ? requirements.requirements.length : 1,
        analysisType: 'requirements'
      });
    } catch (error) {
      return this.createErrorResult(error, { requirements });
    }
  }

  categorizeRequirements(input) {
    const text = this.extractText(input);
    const categories = {};
    
    for (const [type, pattern] of Object.entries(this.requirementTypes)) {
      const matches = text.match(pattern) || [];
      categories[type] = {
        count: matches.length,
        keywords: [...new Set(matches.map(m => m.toLowerCase()))],
        confidence: this.calculateCategoryConfidence(matches, text)
      };
    }
    
    return categories;
  }

  extractText(input) {
    if (typeof input === 'string') {
      return input;
    }
    
    let text = '';
    if (input.description) text += input.description + ' ';
    if (input.requirements && Array.isArray(input.requirements)) {
      text += input.requirements.map(req => 
        typeof req === 'string' ? req : req.description || ''
      ).join(' ');
    }
    if (input.features && Array.isArray(input.features)) {
      text += input.features.map(feature => 
        typeof feature === 'string' ? feature : feature.description || ''
      ).join(' ');
    }
    
    return text;
  }

  calculateCategoryConfidence(matches, fullText) {
    if (matches.length === 0) return 0;
    
    const textLength = fullText.length;
    const matchDensity = matches.length / (textLength / 100); // matches per 100 chars
    
    return Math.min(100, Math.round(matchDensity * 20));
  }

  analyzePriorities(input) {
    const text = this.extractText(input);
    const priorityKeywords = {
      critical: /\b(critical|essential|must have|required|mandatory)\b/gi,
      high: /\b(important|high priority|should have|significant)\b/gi,
      medium: /\b(nice to have|medium priority|could have|moderate)\b/gi,
      low: /\b(low priority|optional|future|enhancement)\b/gi
    };
    
    const priorities = {};
    let totalMatches = 0;
    
    for (const [level, pattern] of Object.entries(priorityKeywords)) {
      const matches = text.match(pattern) || [];
      priorities[level] = matches.length;
      totalMatches += matches.length;
    }
    
    // Convert to percentages
    if (totalMatches > 0) {
      for (const level in priorities) {
        priorities[level] = Math.round((priorities[level] / totalMatches) * 100);
      }
    }
    
    return priorities;
  }

  extractDependencies(input) {
    const text = this.extractText(input);
    const dependencies = {
      internal: [],
      external: [],
      technical: [],
      business: []
    };
    
    const dependencyPatterns = {
      technical: /\b(requires|depends on|needs|uses|integrates with)\s+([A-Za-z0-9\s]+?)(?:\.|,|;|\n|$)/gi,
      external: /\b(third.?party|external|api|service|platform)\s+([A-Za-z0-9\s]+?)(?:\.|,|;|\n|$)/gi
    };
    
    for (const [type, pattern] of Object.entries(dependencyPatterns)) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const dependency = match[2].trim();
        if (dependency.length > 2 && dependency.length < 50) {
          dependencies[type].push({
            name: dependency,
            context: match[0].trim(),
            type: this.classifyDependency(dependency)
          });
        }
      }
    }
    
    return dependencies;
  }

  classifyDependency(dependency) {
    const techKeywords = /\b(database|api|framework|library|server|cloud)\b/i;
    const serviceKeywords = /\b(payment|authentication|email|sms|storage)\b/i;
    
    if (techKeywords.test(dependency)) return 'technology';
    if (serviceKeywords.test(dependency)) return 'service';
    return 'general';
  }

  assessFeasibility(input, context = {}) {
    const text = this.extractText(input);
    const feasibility = {
      technical: this.assessTechnicalFeasibility(text, context),
      timeline: this.assessTimelineFeasibility(text, context),
      budget: this.assessBudgetFeasibility(text, context),
      resources: this.assessResourceFeasibility(text, context),
      overall: 0
    };
    
    // Calculate overall feasibility score
    const scores = [feasibility.technical, feasibility.timeline, feasibility.budget, feasibility.resources];
    feasibility.overall = Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length);
    
    return feasibility;
  }

  assessTechnicalFeasibility(text, context) {
    const complexityIndicators = /\b(complex|advanced|cutting.?edge|experimental|new technology)\b/gi;
    const simplicityIndicators = /\b(simple|basic|standard|common|proven)\b/gi;
    
    const complexMatches = text.match(complexityIndicators) || [];
    const simpleMatches = text.match(simplicityIndicators) || [];
    
    let score = 80; // Base score
    score -= complexMatches.length * 10;
    score += simpleMatches.length * 5;
    
    return Math.max(0, Math.min(100, score));
  }

  assessTimelineFeasibility(text, context) {
    const urgentIndicators = /\b(urgent|asap|immediately|rush|tight deadline)\b/gi;
    const timeIndicators = /\b(\d+)\s+(day|week|month)s?\b/gi;
    
    const urgentMatches = text.match(urgentIndicators) || [];
    let score = 75; // Base score
    
    score -= urgentMatches.length * 15;
    
    // Check for specific timeframes
    let timeMatch;
    while ((timeMatch = timeIndicators.exec(text)) !== null) {
      const number = parseInt(timeMatch[1]);
      const unit = timeMatch[2];
      
      if (unit === 'day' && number < 30) score -= 20;
      if (unit === 'week' && number < 8) score -= 15;
      if (unit === 'month' && number < 3) score -= 10;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  assessBudgetFeasibility(text, context) {
    const costIndicators = /\b(expensive|costly|budget.?friendly|cheap|affordable)\b/gi;
    const budgetConstraints = /\b(limited budget|tight budget|cost.?effective)\b/gi;
    
    const costMatches = text.match(costIndicators) || [];
    const constraintMatches = text.match(budgetConstraints) || [];
    
    let score = 70; // Base score
    score -= constraintMatches.length * 15;
    
    return Math.max(0, Math.min(100, score));
  }

  assessResourceFeasibility(text, context) {
    const resourceIndicators = /\b(team|developer|designer|expert|specialist)\b/gi;
    const skillIndicators = /\b(skilled|experienced|junior|senior)\b/gi;
    
    const resourceMatches = text.match(resourceIndicators) || [];
    let score = 75; // Base score
    
    // Having more resource mentions might indicate resource availability
    score += Math.min(20, resourceMatches.length * 5);
    
    return Math.max(0, Math.min(100, score));
  }

  estimateEffort(input) {
    const categories = this.categorizeRequirements(input);
    const text = this.extractText(input);
    
    const effort = {
      development: this.estimateDevelopmentEffort(categories, text),
      design: this.estimateDesignEffort(categories, text),
      testing: this.estimateTestingEffort(categories, text),
      deployment: this.estimateDeploymentEffort(categories, text),
      total: 0
    };
    
    effort.total = effort.development + effort.design + effort.testing + effort.deployment;
    
    return effort;
  }

  estimateDevelopmentEffort(categories, text) {
    let baseEffort = 40; // Base development effort in hours
    
    baseEffort += (categories.functional?.count || 0) * 8;
    baseEffort += (categories.technical?.count || 0) * 12;
    baseEffort += (categories.integration?.count || 0) * 16;
    
    return baseEffort;
  }

  estimateDesignEffort(categories, text) {
    let baseEffort = 16; // Base design effort in hours
    
    baseEffort += (categories.ui?.count || 0) * 6;
    baseEffort += (categories.functional?.count || 0) * 2;
    
    return baseEffort;
  }

  estimateTestingEffort(categories, text) {
    let baseEffort = 20; // Base testing effort in hours
    
    baseEffort += (categories.functional?.count || 0) * 4;
    baseEffort += (categories.security?.count || 0) * 8;
    
    return baseEffort;
  }

  estimateDeploymentEffort(categories, text) {
    let baseEffort = 8; // Base deployment effort in hours
    
    baseEffort += (categories.technical?.count || 0) * 2;
    baseEffort += (categories.integration?.count || 0) * 4;
    
    return baseEffort;
  }

  identifyRisks(input) {
    const text = this.extractText(input);
    const risks = [];
    
    const riskPatterns = {
      technical: {
        pattern: /\b(new technology|experimental|unproven|complex|difficult)\b/gi,
        severity: 'high',
        type: 'technical'
      },
      timeline: {
        pattern: /\b(tight deadline|urgent|rush|limited time)\b/gi,
        severity: 'medium',
        type: 'timeline'
      },
      scope: {
        pattern: /\b(unclear|ambiguous|vague|undefined)\b/gi,
        severity: 'medium',
        type: 'scope'
      },
      integration: {
        pattern: /\b(third.?party|external|dependency|integration)\b/gi,
        severity: 'medium',
        type: 'integration'
      }
    };
    
    for (const [riskType, config] of Object.entries(riskPatterns)) {
      const matches = text.match(config.pattern) || [];
      if (matches.length > 0) {
        risks.push({
          type: config.type,
          severity: config.severity,
          count: matches.length,
          description: `${riskType} risks detected based on requirement language`,
          mitigation: this.suggestMitigation(config.type)
        });
      }
    }
    
    return risks;
  }

  suggestMitigation(riskType) {
    const mitigations = {
      technical: 'Consider proof of concept, technical research, or alternative approaches',
      timeline: 'Break down into smaller phases, prioritize critical features',
      scope: 'Conduct stakeholder interviews, create detailed specifications',
      integration: 'Validate external dependencies, create fallback plans'
    };
    
    return mitigations[riskType] || 'Monitor and reassess regularly';
  }

  generateAcceptanceCriteria(input) {
    const categories = this.categorizeRequirements(input);
    const text = this.extractText(input);
    const criteria = [];
    
    // Extract explicit criteria from text
    const criteriaPatterns = /\b(given|when|then|should|must|verify|ensure)\s+([^.]+)/gi;
    let match;
    while ((match = criteriaPatterns.exec(text)) !== null) {
      criteria.push({
        type: 'explicit',
        statement: match[0].trim(),
        testable: true
      });
    }
    
    // Generate implicit criteria based on categories
    if (categories.functional?.count > 0) {
      criteria.push({
        type: 'implicit',
        statement: 'All functional requirements should be implemented and working',
        testable: true
      });
    }
    
    if (categories.security?.count > 0) {
      criteria.push({
        type: 'implicit',
        statement: 'Security requirements should be validated through testing',
        testable: true
      });
    }
    
    return criteria;
  }

  generateRequirementsSummary(analysis) {
    const totalCategories = Object.keys(analysis.categories).length;
    const totalDependencies = Object.values(analysis.dependencies).flat().length;
    const totalRisks = analysis.risks.length;
    
    return {
      overview: `Analysis found ${totalCategories} requirement categories with ${totalDependencies} dependencies and ${totalRisks} potential risks`,
      feasibility: analysis.feasibility.overall,
      effortEstimate: `${analysis.effort.total} hours total effort`,
      topRisks: analysis.risks.slice(0, 3),
      recommendations: this.generateRecommendations(analysis)
    };
  }

  generateRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.feasibility.overall < 60) {
      recommendations.push({
        type: 'feasibility',
        priority: 'high',
        message: 'Consider breaking down requirements into smaller, more manageable phases'
      });
    }
    
    if (analysis.risks.length > 3) {
      recommendations.push({
        type: 'risk',
        priority: 'medium',
        message: 'Develop risk mitigation strategies for identified risks'
      });
    }
    
    if (analysis.effort.total > 200) {
      recommendations.push({
        type: 'effort',
        priority: 'medium',
        message: 'Consider prioritizing requirements to reduce initial development effort'
      });
    }
    
    return recommendations;
  }
}

module.exports = { RequirementAnalyzer };