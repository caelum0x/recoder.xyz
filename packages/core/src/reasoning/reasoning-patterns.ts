/**
 * Reasoning Patterns Library for DeepSeek R1
 * 
 * Collection of reasoning patterns and templates for different problem types
 */

export interface ReasoningPattern {
  id: string;
  name: string;
  description: string;
  approach: 'analytical' | 'creative' | 'logical' | 'strategic';
  applicableDomains: string[];
  stepTemplates: ReasoningStepTemplate[];
  expectedSteps: number;
  averageConfidence: number;
  complexity: 'low' | 'medium' | 'high';
}

export interface ReasoningStepTemplate {
  type: 'observation' | 'hypothesis' | 'analysis' | 'conclusion' | 'decision' | 'reflection';
  order: number;
  description: string;
  prompts: string[];
  expectedConfidence: number;
  criticalPath: boolean;
  alternatives?: string[];
}

export class ReasoningPatternsLibrary {
  private patterns: Map<string, ReasoningPattern> = new Map();

  constructor() {
    this.initializePatterns();
  }

  private initializePatterns(): void {
    // Problem-Solving Pattern
    this.registerPattern({
      id: 'problem_solving',
      name: 'Problem-Solving Analysis',
      description: 'Systematic approach to analyzing and solving complex problems',
      approach: 'analytical',
      applicableDomains: ['software-development', 'engineering', 'business', 'research'],
      stepTemplates: [
        {
          type: 'observation',
          order: 1,
          description: 'Identify and understand the problem',
          prompts: [
            'What exactly is the problem we need to solve?',
            'What are the constraints and requirements?',
            'What information do we have available?'
          ],
          expectedConfidence: 0.8,
          criticalPath: true
        },
        {
          type: 'analysis',
          order: 2,
          description: 'Break down the problem into components',
          prompts: [
            'What are the key components of this problem?',
            'How do these components interact?',
            'What are the root causes?'
          ],
          expectedConfidence: 0.7,
          criticalPath: true
        },
        {
          type: 'hypothesis',
          order: 3,
          description: 'Generate potential solutions',
          prompts: [
            'What are possible approaches to solve this?',
            'Which solutions have worked for similar problems?',
            'What novel approaches could we try?'
          ],
          expectedConfidence: 0.6,
          criticalPath: true,
          alternatives: ['Multiple solution paths', 'Hybrid approaches', 'Iterative solutions']
        },
        {
          type: 'analysis',
          order: 4,
          description: 'Evaluate and compare solutions',
          prompts: [
            'What are the pros and cons of each solution?',
            'Which solution best meets our constraints?',
            'What are the risks and trade-offs?'
          ],
          expectedConfidence: 0.75,
          criticalPath: true
        },
        {
          type: 'decision',
          order: 5,
          description: 'Select the optimal solution',
          prompts: [
            'Which solution provides the best outcome?',
            'How do we implement this solution?',
            'What metrics will measure success?'
          ],
          expectedConfidence: 0.85,
          criticalPath: true
        },
        {
          type: 'reflection',
          order: 6,
          description: 'Validate and refine the solution',
          prompts: [
            'Does this solution address all aspects of the problem?',
            'What could go wrong and how do we mitigate risks?',
            'How can we improve this solution further?'
          ],
          expectedConfidence: 0.8,
          criticalPath: false
        }
      ],
      expectedSteps: 6,
      averageConfidence: 0.75,
      complexity: 'medium'
    });

    // Creative Design Pattern
    this.registerPattern({
      id: 'creative_design',
      name: 'Creative Design Thinking',
      description: 'Human-centered approach to innovation and creative problem solving',
      approach: 'creative',
      applicableDomains: ['design', 'product-development', 'innovation', 'user-experience'],
      stepTemplates: [
        {
          type: 'observation',
          order: 1,
          description: 'Empathize with users and understand context',
          prompts: [
            'Who are the users and what are their needs?',
            'What is the current user experience?',
            'What pain points and opportunities exist?'
          ],
          expectedConfidence: 0.7,
          criticalPath: true
        },
        {
          type: 'analysis',
          order: 2,
          description: 'Define the core problem',
          prompts: [
            'What is the real problem we need to solve?',
            'How might we frame this challenge differently?',
            'What would success look like?'
          ],
          expectedConfidence: 0.75,
          criticalPath: true
        },
        {
          type: 'hypothesis',
          order: 3,
          description: 'Ideate creative solutions',
          prompts: [
            'What are all possible ways to solve this?',
            'How can we think outside the box?',
            'What if we removed all constraints?'
          ],
          expectedConfidence: 0.6,
          criticalPath: true,
          alternatives: ['Divergent thinking', 'Analogical reasoning', 'Combinatorial creativity']
        },
        {
          type: 'decision',
          order: 4,
          description: 'Select promising concepts',
          prompts: [
            'Which ideas have the most potential?',
            'What can we prototype quickly?',
            'Which solutions are feasible?'
          ],
          expectedConfidence: 0.7,
          criticalPath: true
        },
        {
          type: 'analysis',
          order: 5,
          description: 'Prototype and test',
          prompts: [
            'How can we test these concepts?',
            'What feedback are we getting?',
            'What works and what doesn\'t?'
          ],
          expectedConfidence: 0.8,
          criticalPath: true
        },
        {
          type: 'reflection',
          order: 6,
          description: 'Iterate and refine',
          prompts: [
            'How can we improve based on feedback?',
            'What have we learned?',
            'What should we try next?'
          ],
          expectedConfidence: 0.75,
          criticalPath: false
        }
      ],
      expectedSteps: 6,
      averageConfidence: 0.7,
      complexity: 'high'
    });

    // Strategic Analysis Pattern
    this.registerPattern({
      id: 'strategic_analysis',
      name: 'Strategic Analysis & Planning',
      description: 'Comprehensive framework for strategic decision making',
      approach: 'strategic',
      applicableDomains: ['business-strategy', 'technology-planning', 'product-strategy', 'organizational'],
      stepTemplates: [
        {
          type: 'observation',
          order: 1,
          description: 'Environmental scan and situation analysis',
          prompts: [
            'What is the current state of the market/environment?',
            'What trends and forces are shaping the landscape?',
            'Who are the key stakeholders and players?'
          ],
          expectedConfidence: 0.8,
          criticalPath: true
        },
        {
          type: 'analysis',
          order: 2,
          description: 'SWOT and capability analysis',
          prompts: [
            'What are our strengths and weaknesses?',
            'What opportunities and threats exist?',
            'What are our core capabilities and resources?'
          ],
          expectedConfidence: 0.75,
          criticalPath: true
        },
        {
          type: 'hypothesis',
          order: 3,
          description: 'Strategic options generation',
          prompts: [
            'What strategic options are available to us?',
            'How can we leverage our strengths?',
            'What partnerships or acquisitions could help?'
          ],
          expectedConfidence: 0.65,
          criticalPath: true,
          alternatives: ['Growth strategies', 'Defensive strategies', 'Innovation strategies']
        },
        {
          type: 'analysis',
          order: 4,
          description: 'Strategic evaluation and scenario planning',
          prompts: [
            'What are the potential outcomes of each strategy?',
            'How do different scenarios affect our options?',
            'What are the resource requirements and risks?'
          ],
          expectedConfidence: 0.7,
          criticalPath: true
        },
        {
          type: 'decision',
          order: 5,
          description: 'Strategic choice and roadmap',
          prompts: [
            'Which strategy best aligns with our vision?',
            'What is our implementation roadmap?',
            'How do we sequence our initiatives?'
          ],
          expectedConfidence: 0.8,
          criticalPath: true
        },
        {
          type: 'reflection',
          order: 6,
          description: 'Implementation planning and monitoring',
          prompts: [
            'How will we execute this strategy?',
            'What metrics will track our progress?',
            'How often should we review and adapt?'
          ],
          expectedConfidence: 0.75,
          criticalPath: false
        }
      ],
      expectedSteps: 6,
      averageConfidence: 0.74,
      complexity: 'high'
    });

    // Technical Architecture Pattern
    this.registerPattern({
      id: 'technical_architecture',
      name: 'Technical Architecture Design',
      description: 'Systematic approach to designing technical systems and architectures',
      approach: 'analytical',
      applicableDomains: ['software-architecture', 'system-design', 'infrastructure', 'engineering'],
      stepTemplates: [
        {
          type: 'observation',
          order: 1,
          description: 'Requirements and constraints analysis',
          prompts: [
            'What are the functional and non-functional requirements?',
            'What are the performance, scale, and security constraints?',
            'What existing systems need to be integrated?'
          ],
          expectedConfidence: 0.85,
          criticalPath: true
        },
        {
          type: 'analysis',
          order: 2,
          description: 'Domain and data modeling',
          prompts: [
            'What are the key entities and their relationships?',
            'How does data flow through the system?',
            'What are the core business processes?'
          ],
          expectedConfidence: 0.8,
          criticalPath: true
        },
        {
          type: 'hypothesis',
          order: 3,
          description: 'Architecture patterns exploration',
          prompts: [
            'Which architectural patterns fit our needs?',
            'How should we structure our components and services?',
            'What technology stack best supports our requirements?'
          ],
          expectedConfidence: 0.7,
          criticalPath: true,
          alternatives: ['Microservices', 'Modular monolith', 'Event-driven', 'Layered architecture']
        },
        {
          type: 'analysis',
          order: 4,
          description: 'Quality attributes and trade-offs',
          prompts: [
            'How does each approach impact performance, scalability, maintainability?',
            'What are the trade-offs between different patterns?',
            'Which approach best balances our quality attributes?'
          ],
          expectedConfidence: 0.75,
          criticalPath: true
        },
        {
          type: 'decision',
          order: 5,
          description: 'Architecture decision and documentation',
          prompts: [
            'Which architecture best meets our needs?',
            'How do we document our architectural decisions?',
            'What are the key design principles and guidelines?'
          ],
          expectedConfidence: 0.85,
          criticalPath: true
        }
      ],
      expectedSteps: 5,
      averageConfidence: 0.79,
      complexity: 'high'
    });

    // Logical Deduction Pattern
    this.registerPattern({
      id: 'logical_deduction',
      name: 'Logical Deduction & Proof',
      description: 'Formal logical reasoning and proof construction',
      approach: 'logical',
      applicableDomains: ['mathematics', 'logic', 'formal-verification', 'algorithm-design'],
      stepTemplates: [
        {
          type: 'observation',
          order: 1,
          description: 'Establish premises and givens',
          prompts: [
            'What facts and premises do we know to be true?',
            'What are the axioms and rules we can use?',
            'What do we need to prove or derive?'
          ],
          expectedConfidence: 0.9,
          criticalPath: true
        },
        {
          type: 'hypothesis',
          order: 2,
          description: 'Formulate logical propositions',
          prompts: [
            'How can we express this formally?',
            'What logical relationships exist?',
            'What intermediate results might help?'
          ],
          expectedConfidence: 0.8,
          criticalPath: true
        },
        {
          type: 'analysis',
          order: 3,
          description: 'Apply logical rules and inference',
          prompts: [
            'What logical rules apply here?',
            'How can we derive new conclusions?',
            'Are our inferences valid?'
          ],
          expectedConfidence: 0.85,
          criticalPath: true
        },
        {
          type: 'conclusion',
          order: 4,
          description: 'Construct proof and validate',
          prompts: [
            'Does our proof follow logically?',
            'Are there any gaps in our reasoning?',
            'Can we verify our conclusion?'
          ],
          expectedConfidence: 0.9,
          criticalPath: true
        }
      ],
      expectedSteps: 4,
      averageConfidence: 0.86,
      complexity: 'medium'
    });
  }

  private registerPattern(pattern: ReasoningPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Get a reasoning pattern by ID
   */
  getPattern(patternId: string): ReasoningPattern | undefined {
    return this.patterns.get(patternId);
  }

  /**
   * Find patterns suitable for a given domain and approach
   */
  findPatterns(
    domain?: string,
    approach?: string,
    complexity?: string
  ): ReasoningPattern[] {
    const allPatterns = Array.from(this.patterns.values());
    
    return allPatterns.filter(pattern => {
      const domainMatch = !domain || pattern.applicableDomains.includes(domain);
      const approachMatch = !approach || pattern.approach === approach;
      const complexityMatch = !complexity || pattern.complexity === complexity;
      
      return domainMatch && approachMatch && complexityMatch;
    });
  }

  /**
   * Get all available patterns
   */
  getAllPatterns(): ReasoningPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Recommend a pattern based on problem characteristics
   */
  recommendPattern(
    problemDescription: string,
    domain: string = 'general',
    preferredApproach?: string
  ): ReasoningPattern {
    const keywords = problemDescription.toLowerCase();
    
    // Keyword-based pattern matching
    if (keywords.includes('strategy') || keywords.includes('business') || keywords.includes('plan')) {
      return this.patterns.get('strategic_analysis')!;
    }
    
    if (keywords.includes('design') || keywords.includes('creative') || keywords.includes('innovation')) {
      return this.patterns.get('creative_design')!;
    }
    
    if (keywords.includes('architecture') || keywords.includes('system') || keywords.includes('technical')) {
      return this.patterns.get('technical_architecture')!;
    }
    
    if (keywords.includes('prove') || keywords.includes('logic') || keywords.includes('formal')) {
      return this.patterns.get('logical_deduction')!;
    }
    
    // Domain-based matching
    const domainPatterns = this.findPatterns(domain, preferredApproach);
    if (domainPatterns.length > 0) {
      return domainPatterns[0];
    }
    
    // Approach-based matching
    if (preferredApproach) {
      const approachPatterns = this.findPatterns(undefined, preferredApproach);
      if (approachPatterns.length > 0) {
        return approachPatterns[0];
      }
    }
    
    // Default to problem solving
    return this.patterns.get('problem_solving')!;
  }

  /**
   * Generate step prompts for a pattern
   */
  generateStepPrompts(pattern: ReasoningPattern, context: {
    problem: string;
    goal: string;
    domain: string;
  }): Array<{
    type: string;
    description: string;
    prompts: string[];
    expectedConfidence: number;
  }> {
    return pattern.stepTemplates.map(template => ({
      type: template.type,
      description: template.description,
      prompts: template.prompts.map(prompt => 
        this.contextualizePrompt(prompt, context)
      ),
      expectedConfidence: template.expectedConfidence
    }));
  }

  private contextualizePrompt(prompt: string, context: {
    problem: string;
    goal: string;
    domain: string;
  }): string {
    let contextualized = prompt;
    
    // Replace placeholders with context
    contextualized = contextualized.replace(/\{problem\}/g, context.problem);
    contextualized = contextualized.replace(/\{goal\}/g, context.goal);
    contextualized = contextualized.replace(/\{domain\}/g, context.domain);
    
    return contextualized;
  }

  /**
   * Validate if reasoning follows a pattern
   */
  validateReasoning(
    steps: Array<{ type: string; confidence: number }>,
    pattern: ReasoningPattern
  ): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;
    
    // Check step sequence
    const criticalSteps = pattern.stepTemplates
      .filter(t => t.criticalPath)
      .sort((a, b) => a.order - b.order);
    
    let criticalStepsFound = 0;
    criticalSteps.forEach(expectedStep => {
      const matchingStep = steps.find(step => step.type === expectedStep.type);
      if (matchingStep) {
        criticalStepsFound++;
        
        // Check confidence level
        if (matchingStep.confidence >= expectedStep.expectedConfidence) {
          score += 20;
        } else {
          feedback.push(`Step ${expectedStep.type} has lower confidence than expected`);
          score += 10;
        }
      } else {
        feedback.push(`Missing critical step: ${expectedStep.type}`);
      }
    });
    
    // Completeness score
    const completeness = criticalStepsFound / criticalSteps.length;
    score += completeness * 40;
    
    const isValid = completeness >= 0.8 && score >= 70;
    
    if (isValid) {
      feedback.push('Reasoning follows the pattern well');
    }
    
    return { isValid, score, feedback };
  }
}

export default ReasoningPatternsLibrary;