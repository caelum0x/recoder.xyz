const { logger } = require('../utils/logger');

class BaseAnalyzer {
  constructor(options = {}) {
    this.options = {
      verbose: false,
      includeMetrics: true,
      ...options
    };
  }

  async analyze(input, context = {}) {
    throw new Error('analyze method must be implemented by subclass');
  }

  validateInput(input, requiredFields = []) {
    if (!input) {
      throw new Error('Input is required');
    }

    for (const field of requiredFields) {
      if (!(field in input)) {
        throw new Error(`Required field '${field}' is missing`);
      }
    }

    return true;
  }

  createAnalysisResult(data, metadata = {}) {
    return {
      success: true,
      data,
      metadata: {
        analyzedAt: new Date().toISOString(),
        analyzer: this.constructor.name,
        version: '1.0.0',
        ...metadata
      }
    };
  }

  createErrorResult(error, context = {}) {
    logger.error(`Analysis failed in ${this.constructor.name}:`, {
      error: error.message,
      context
    });

    return {
      success: false,
      error: {
        message: error.message,
        code: error.code || 'ANALYSIS_ERROR',
        analyzer: this.constructor.name
      },
      metadata: {
        analyzedAt: new Date().toISOString(),
        analyzer: this.constructor.name,
        version: '1.0.0'
      }
    };
  }

  extractPatterns(text, patterns) {
    const results = {};
    
    for (const [key, pattern] of Object.entries(patterns)) {
      const matches = text.match(pattern);
      results[key] = matches || [];
    }
    
    return results;
  }

  calculateComplexity(items, complexityRules = {}) {
    let complexity = 0;
    
    for (const item of items) {
      if (typeof item === 'string') {
        complexity += complexityRules.stringBase || 1;
      } else if (Array.isArray(item)) {
        complexity += (item.length * (complexityRules.arrayMultiplier || 0.5));
      } else if (typeof item === 'object') {
        complexity += this.calculateObjectComplexity(item, complexityRules);
      }
    }
    
    return Math.round(complexity);
  }

  calculateObjectComplexity(obj, rules = {}) {
    const keys = Object.keys(obj);
    let complexity = keys.length * (rules.objectBase || 1);
    
    for (const value of Object.values(obj)) {
      if (Array.isArray(value)) {
        complexity += value.length * (rules.nestedArrayMultiplier || 0.3);
      } else if (typeof value === 'object' && value !== null) {
        complexity += this.calculateObjectComplexity(value, rules) * 0.5;
      }
    }
    
    return complexity;
  }

  generateMetrics(analysis) {
    if (!this.options.includeMetrics) {
      return {};
    }

    return {
      itemCount: Array.isArray(analysis) ? analysis.length : Object.keys(analysis).length,
      complexity: this.calculateComplexity(Array.isArray(analysis) ? analysis : [analysis]),
      categories: this.categorizeItems(analysis),
      confidence: this.calculateConfidence(analysis)
    };
  }

  categorizeItems(items) {
    const categories = {};
    const itemsArray = Array.isArray(items) ? items : [items];
    
    for (const item of itemsArray) {
      const category = this.getItemCategory(item);
      categories[category] = (categories[category] || 0) + 1;
    }
    
    return categories;
  }

  getItemCategory(item) {
    if (typeof item === 'string') {
      return 'string';
    } else if (typeof item === 'number') {
      return 'number';
    } else if (Array.isArray(item)) {
      return 'array';
    } else if (typeof item === 'object' && item !== null) {
      return 'object';
    }
    return 'unknown';
  }

  calculateConfidence(analysis) {
    // Basic confidence calculation based on data completeness
    if (!analysis) return 0;
    
    const itemsArray = Array.isArray(analysis) ? analysis : [analysis];
    let totalFields = 0;
    let populatedFields = 0;
    
    for (const item of itemsArray) {
      if (typeof item === 'object' && item !== null) {
        const fields = Object.entries(item);
        totalFields += fields.length;
        
        for (const [key, value] of fields) {
          if (value !== null && value !== undefined && value !== '') {
            populatedFields++;
          }
        }
      } else {
        totalFields++;
        if (item !== null && item !== undefined && item !== '') {
          populatedFields++;
        }
      }
    }
    
    return totalFields > 0 ? Math.round((populatedFields / totalFields) * 100) : 0;
  }

  filterResults(results, filters = {}) {
    if (!filters || Object.keys(filters).length === 0) {
      return results;
    }

    const filteredResults = Array.isArray(results) ? [] : {};
    
    if (Array.isArray(results)) {
      return results.filter(item => this.matchesFilters(item, filters));
    } else {
      for (const [key, value] of Object.entries(results)) {
        if (this.matchesFilters(value, filters)) {
          filteredResults[key] = value;
        }
      }
    }
    
    return filteredResults;
  }

  matchesFilters(item, filters) {
    for (const [filterKey, filterValue] of Object.entries(filters)) {
      if (typeof filterValue === 'function') {
        if (!filterValue(item[filterKey])) {
          return false;
        }
      } else if (item[filterKey] !== filterValue) {
        return false;
      }
    }
    return true;
  }

  sortResults(results, sortBy = 'name', order = 'asc') {
    if (!Array.isArray(results)) {
      return results;
    }

    return results.sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      if (order === 'desc') {
        return bValue > aValue ? 1 : -1;
      } else {
        return aValue > bValue ? 1 : -1;
      }
    });
  }

  aggregateResults(results, aggregationType = 'count') {
    if (!Array.isArray(results)) {
      return results;
    }

    const aggregated = {};
    
    for (const result of results) {
      const key = result.type || result.category || 'default';
      
      if (!aggregated[key]) {
        aggregated[key] = {
          count: 0,
          items: []
        };
      }
      
      aggregated[key].count++;
      aggregated[key].items.push(result);
      
      if (aggregationType === 'sum' && result.value) {
        aggregated[key].sum = (aggregated[key].sum || 0) + result.value;
      }
    }
    
    return aggregated;
  }

  generateSummary(analysis) {
    const summary = {
      totalItems: 0,
      categories: {},
      topItems: [],
      insights: []
    };

    if (Array.isArray(analysis)) {
      summary.totalItems = analysis.length;
      summary.topItems = analysis.slice(0, 5);
    } else if (typeof analysis === 'object') {
      summary.totalItems = Object.keys(analysis).length;
      summary.topItems = Object.entries(analysis).slice(0, 5);
    }

    summary.categories = this.categorizeItems(analysis);
    summary.insights = this.generateInsights(analysis);

    return summary;
  }

  generateInsights(analysis) {
    const insights = [];
    const metrics = this.generateMetrics(analysis);
    
    if (metrics.complexity > 10) {
      insights.push({
        type: 'complexity',
        message: 'High complexity detected',
        severity: 'warning',
        value: metrics.complexity
      });
    }
    
    if (metrics.confidence < 70) {
      insights.push({
        type: 'confidence',
        message: 'Low confidence in analysis results',
        severity: 'info',
        value: metrics.confidence
      });
    }
    
    return insights;
  }

  async performAsyncAnalysis(input, analysisFunction) {
    try {
      const startTime = Date.now();
      const result = await analysisFunction(input);
      const duration = Date.now() - startTime;
      
      logger.debug(`Analysis completed in ${duration}ms`, {
        analyzer: this.constructor.name,
        inputSize: JSON.stringify(input).length
      });
      
      return result;
    } catch (error) {
      logger.error(`Async analysis failed:`, {
        analyzer: this.constructor.name,
        error: error.message
      });
      throw error;
    }
  }
}

module.exports = { BaseAnalyzer };