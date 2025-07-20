interface CodingPattern {
  id: string;
  type: 'framework' | 'library' | 'design-pattern' | 'style' | 'workflow';
  pattern: string;
  frequency: number;
  context: string[];
  lastUsed: Date;
  effectiveness: number;
}

interface UserPreferences {
  preferredFrameworks: string[];
  codingStyle: {
    indentation: 'tabs' | 'spaces';
    quotes: 'single' | 'double';
    semicolons: boolean;
    bracketSpacing: boolean;
  };
  workflowPatterns: string[];
  errorPatterns: string[];
}

export class UserPatternAnalyzer {
  private patterns: Map<string, CodingPattern> = new Map();
  private preferences: UserPreferences;
  private sessionHistory: Array<{
    timestamp: Date;
    action: string;
    context: string;
    success: boolean;
  }> = [];

  constructor() {
    this.preferences = this.loadPreferences();
    this.loadPatterns();
  }

  analyzeCodeSubmission(code: string, language: string, context: string): void {
    this.detectFrameworkUsage(code, language);
    this.analyzeCodeStyle(code, language);
    this.trackWorkflowPattern(context);
    this.updateSessionHistory('code_submission', context, true);
  }

  analyzeUserFeedback(feedback: string, context: string, rating: number): void {
    const pattern = this.extractPatternFromFeedback(feedback, context);
    if (pattern) {
      this.updatePatternEffectiveness(pattern.id, rating);
    }
    this.updateSessionHistory('feedback', context, rating > 3);
  }

  getRecommendations(currentContext: string): string[] {
    const relevantPatterns = this.getRelevantPatterns(currentContext);
    return relevantPatterns
      .sort((a, b) => b.effectiveness - a.effectiveness)
      .slice(0, 5)
      .map(p => p.pattern);
  }

  private detectFrameworkUsage(code: string, language: string): void {
    const frameworks = this.getFrameworkSignatures(language);
    
    for (const [framework, signatures] of frameworks.entries()) {
      const usage = signatures.some(sig => code.includes(sig));
      if (usage) {
        this.recordPattern({
          id: `framework_${framework}`,
          type: 'framework',
          pattern: framework,
          frequency: 1,
          context: [language],
          lastUsed: new Date(),
          effectiveness: 0.8
        });
      }
    }
  }

  private analyzeCodeStyle(code: string, language: string): void {
    const stylePatterns = {
      indentation: code.includes('\t') ? 'tabs' : 'spaces',
      quotes: (code.match(/'/g)?.length || 0) > (code.match(/"/g)?.length || 0) ? 'single' : 'double',
      semicolons: code.includes(';'),
      bracketSpacing: /{\s/.test(code)
    };

    this.updatePreferences(stylePatterns);
  }

  private trackWorkflowPattern(context: string): void {
    const workflowId = `workflow_${context}`;
    const existing = this.patterns.get(workflowId);
    
    if (existing) {
      existing.frequency++;
      existing.lastUsed = new Date();
    } else {
      this.recordPattern({
        id: workflowId,
        type: 'workflow',
        pattern: context,
        frequency: 1,
        context: [context],
        lastUsed: new Date(),
        effectiveness: 0.5
      });
    }
  }

  private extractPatternFromFeedback(feedback: string, context: string): CodingPattern | null {
    const keywords = feedback.toLowerCase().split(' ');
    
    for (const [id, pattern] of this.patterns.entries()) {
      if (keywords.some(word => pattern.pattern.toLowerCase().includes(word))) {
        return pattern;
      }
    }
    
    return null;
  }

  private updatePatternEffectiveness(patternId: string, rating: number): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.effectiveness = (pattern.effectiveness + rating / 5) / 2;
    }
  }

  private getRelevantPatterns(context: string): CodingPattern[] {
    return Array.from(this.patterns.values())
      .filter(p => p.context.some(c => c.includes(context)))
      .filter(p => (Date.now() - p.lastUsed.getTime()) < 30 * 24 * 60 * 60 * 1000); // Last 30 days
  }

  private recordPattern(pattern: CodingPattern): void {
    const existing = this.patterns.get(pattern.id);
    if (existing) {
      existing.frequency++;
      existing.lastUsed = new Date();
    } else {
      this.patterns.set(pattern.id, pattern);
    }
  }

  private getFrameworkSignatures(language: string): Map<string, string[]> {
    const signatures = new Map();
    
    switch (language.toLowerCase()) {
      case 'typescript':
      case 'javascript':
        signatures.set('react', ['jsx', 'useState', 'useEffect', 'React.']);
        signatures.set('vue', ['Vue.', 'v-if', 'v-for', '@click']);
        signatures.set('angular', ['@Component', '@Injectable', 'NgModule']);
        signatures.set('express', ['app.get', 'app.post', 'express()']);
        break;
      case 'python':
        signatures.set('django', ['from django', 'models.Model', 'HttpResponse']);
        signatures.set('flask', ['from flask', 'Flask(__name__)', '@app.route']);
        signatures.set('fastapi', ['from fastapi', 'FastAPI()', '@app.get']);
        break;
    }
    
    return signatures;
  }

  private updatePreferences(stylePatterns: any): void {
    this.preferences.codingStyle = { ...this.preferences.codingStyle, ...stylePatterns };
    this.savePreferences();
  }

  private loadPreferences(): UserPreferences {
    return {
      preferredFrameworks: [],
      codingStyle: {
        indentation: 'spaces',
        quotes: 'single',
        semicolons: true,
        bracketSpacing: true
      },
      workflowPatterns: [],
      errorPatterns: []
    };
  }

  private loadPatterns(): void {
    // Load from persistent storage
  }

  private savePreferences(): void {
    // Save to persistent storage
  }

  getInsights(): {
    mostUsedFrameworks: string[];
    preferredStyle: UserPreferences['codingStyle'];
    successRate: number;
    improvementAreas: string[];
  } {
    const frameworkPatterns = Array.from(this.patterns.values())
      .filter(p => p.type === 'framework')
      .sort((a, b) => b.frequency - a.frequency);

    const successfulActions = this.sessionHistory.filter(h => h.success).length;
    const successRate = successfulActions / Math.max(this.sessionHistory.length, 1);

    const lowEffectivenessPatterns = Array.from(this.patterns.values())
      .filter(p => p.effectiveness < 0.5)
      .map(p => p.pattern);

    return {
      mostUsedFrameworks: frameworkPatterns.slice(0, 5).map(p => p.pattern),
      preferredStyle: this.preferences.codingStyle,
      successRate,
      improvementAreas: lowEffectivenessPatterns
    };
  }
}