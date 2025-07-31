"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserPatternAnalyzer = void 0;
class UserPatternAnalyzer {
    constructor() {
        this.patterns = new Map();
        this.sessionHistory = [];
        this.preferences = this.loadPreferences();
        this.loadPatterns();
    }
    analyzeCodeSubmission(code, language, context) {
        this.detectFrameworkUsage(code, language);
        this.analyzeCodeStyle(code, language);
        this.trackWorkflowPattern(context);
        this.updateSessionHistory('code_submission', context, true);
    }
    analyzeUserFeedback(feedback, context, rating) {
        const pattern = this.extractPatternFromFeedback(feedback, context);
        if (pattern) {
            this.updatePatternEffectiveness(pattern.id, rating);
        }
        this.updateSessionHistory('feedback', context, rating > 3);
    }
    getRecommendations(currentContext) {
        const relevantPatterns = this.getRelevantPatterns(currentContext);
        return relevantPatterns
            .sort((a, b) => b.effectiveness - a.effectiveness)
            .slice(0, 5)
            .map(p => p.pattern);
    }
    detectFrameworkUsage(code, language) {
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
    analyzeCodeStyle(code, language) {
        const stylePatterns = {
            indentation: code.includes('\t') ? 'tabs' : 'spaces',
            quotes: (code.match(/'/g)?.length || 0) > (code.match(/"/g)?.length || 0) ? 'single' : 'double',
            semicolons: code.includes(';'),
            bracketSpacing: /{\s/.test(code)
        };
        this.updatePreferences(stylePatterns);
    }
    trackWorkflowPattern(context) {
        const workflowId = `workflow_${context}`;
        const existing = this.patterns.get(workflowId);
        if (existing) {
            existing.frequency++;
            existing.lastUsed = new Date();
        }
        else {
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
    extractPatternFromFeedback(feedback, context) {
        const keywords = feedback.toLowerCase().split(' ');
        for (const [id, pattern] of this.patterns.entries()) {
            if (keywords.some(word => pattern.pattern.toLowerCase().includes(word))) {
                return pattern;
            }
        }
        return null;
    }
    updatePatternEffectiveness(patternId, rating) {
        const pattern = this.patterns.get(patternId);
        if (pattern) {
            pattern.effectiveness = (pattern.effectiveness + rating / 5) / 2;
        }
    }
    getRelevantPatterns(context) {
        return Array.from(this.patterns.values())
            .filter(p => p.context.some(c => c.includes(context)))
            .filter(p => (Date.now() - p.lastUsed.getTime()) < 30 * 24 * 60 * 60 * 1000); // Last 30 days
    }
    recordPattern(pattern) {
        const existing = this.patterns.get(pattern.id);
        if (existing) {
            existing.frequency++;
            existing.lastUsed = new Date();
        }
        else {
            this.patterns.set(pattern.id, pattern);
        }
    }
    getFrameworkSignatures(language) {
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
    updatePreferences(stylePatterns) {
        this.preferences.codingStyle = { ...this.preferences.codingStyle, ...stylePatterns };
        this.savePreferences();
    }
    loadPreferences() {
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
    loadPatterns() {
        // Load from persistent storage
    }
    savePreferences() {
        // Save to persistent storage
    }
    getInsights() {
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
exports.UserPatternAnalyzer = UserPatternAnalyzer;
//# sourceMappingURL=user-pattern-analyzer.js.map