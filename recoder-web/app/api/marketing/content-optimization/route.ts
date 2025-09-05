import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      content, 
      target_keywords = [], 
      optimization_type = 'comprehensive',
      language = 'en',
      target_audience = 'general'
    } = body;

    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    const optimizationResults = {
      seo_analysis: await analyzeSEO(content, target_keywords),
      readability_score: await analyzeReadability(content, language),
      sentiment_analysis: await analyzeSentiment(content),
      keyword_density: await analyzeKeywordDensity(content, target_keywords),
      content_structure: await analyzeContentStructure(content),
      suggestions: await generateOptimizationSuggestions(content, target_keywords, optimization_type),
      meta_tags: await generateMetaTags(content, target_keywords),
      schema_markup: await generateSchemaMarkup(content),
      performance_score: 0
    };

    // Calculate overall performance score
    optimizationResults.performance_score = calculatePerformanceScore(optimizationResults);

    return NextResponse.json({
      success: true,
      optimization: optimizationResults,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Content optimization error:', error);
    return NextResponse.json(
      { error: 'Content optimization failed' },
      { status: 500 }
    );
  }
}

async function analyzeSEO(content: string, keywords: string[]) {
  const wordCount = content.split(/\s+/).length;
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Title analysis
  const titleMatch = content.match(/<h1[^>]*>(.*?)<\/h1>/i) || content.match(/^#\s(.+)$/m);
  const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '') : '';
  
  // Header analysis
  const h2Count = (content.match(/<h2[^>]*>/gi) || content.match(/^##\s/gm) || []).length;
  const h3Count = (content.match(/<h3[^>]*>/gi) || content.match(/^###\s/gm) || []).length;
  
  // Image analysis
  const imageCount = (content.match(/<img[^>]*>/gi) || []).length;
  const imagesWithAlt = (content.match(/<img[^>]*alt\s*=\s*["'][^"']*["'][^>]*>/gi) || []).length;
  
  // Link analysis
  const internalLinks = (content.match(/<a[^>]*href\s*=\s*["'][^"']*["'][^>]*>/gi) || []).length;
  const externalLinks = (content.match(/<a[^>]*href\s*=\s*["']https?:\/\/[^"']*["'][^>]*>/gi) || []).length;

  return {
    word_count: wordCount,
    title_optimization: {
      has_title: !!title,
      title_length: title.length,
      title_keywords: keywords.filter(k => title.toLowerCase().includes(k.toLowerCase())).length,
      optimal_length: title.length >= 30 && title.length <= 60
    },
    header_structure: {
      h2_count: h2Count,
      h3_count: h3Count,
      proper_hierarchy: h2Count > 0 && h3Count <= h2Count * 2
    },
    content_length: {
      word_count: wordCount,
      optimal_range: wordCount >= 300 && wordCount <= 2500,
      estimated_reading_time: Math.ceil(wordCount / 200)
    },
    image_optimization: {
      total_images: imageCount,
      images_with_alt: imagesWithAlt,
      alt_coverage: imageCount > 0 ? (imagesWithAlt / imageCount) * 100 : 0
    },
    link_structure: {
      internal_links: internalLinks,
      external_links: externalLinks,
      total_links: internalLinks + externalLinks
    },
    keyword_placement: analyzeKeywordPlacement(content, keywords)
  };
}

async function analyzeReadability(content: string, language: string) {
  const text = content.replace(/<[^>]*>/g, '').trim();
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const syllables = countSyllables(text);
  
  // Flesch Reading Ease Score
  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const fleschScore = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
  
  // Flesch-Kincaid Grade Level
  const gradeLevel = (0.39 * avgSentenceLength) + (11.8 * avgSyllablesPerWord) - 15.59;
  
  // Complex words (3+ syllables)
  const complexWords = words.filter(word => countWordSyllables(word) >= 3).length;
  const complexWordRatio = (complexWords / words.length) * 100;

  return {
    flesch_reading_ease: Math.round(fleschScore),
    flesch_kincaid_grade: Math.round(gradeLevel * 10) / 10,
    reading_level: getReadingLevel(fleschScore),
    statistics: {
      sentences: sentences.length,
      words: words.length,
      syllables: syllables,
      avg_sentence_length: Math.round(avgSentenceLength * 10) / 10,
      avg_syllables_per_word: Math.round(avgSyllablesPerWord * 10) / 10,
      complex_words: complexWords,
      complex_word_ratio: Math.round(complexWordRatio * 10) / 10
    },
    recommendations: generateReadabilityRecommendations(fleschScore, avgSentenceLength, complexWordRatio)
  };
}

async function analyzeSentiment(content: string) {
  const text = content.replace(/<[^>]*>/g, '').toLowerCase();
  
  // Simple sentiment analysis using word lists
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'love', 'like', 'best', 'awesome', 'perfect', 'outstanding', 'remarkable', 'impressive', 'beneficial', 'valuable', 'effective', 'successful', 'innovative', 'superior'];
  const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'dislike', 'worst', 'horrible', 'disgusting', 'disappointing', 'frustrating', 'annoying', 'difficult', 'challenging', 'problem', 'issue', 'failure', 'error', 'mistake', 'wrong', 'poor'];
  
  const words = text.split(/\s+/);
  let positiveCount = 0;
  let negativeCount = 0;
  
  words.forEach(word => {
    if (positiveWords.some(pw => word.includes(pw))) positiveCount++;
    if (negativeWords.some(nw => word.includes(nw))) negativeCount++;
  });
  
  const totalSentimentWords = positiveCount + negativeCount;
  const sentimentScore = totalSentimentWords > 0 ? 
    ((positiveCount - negativeCount) / totalSentimentWords) : 0;
  
  let sentiment = 'neutral';
  if (sentimentScore > 0.1) sentiment = 'positive';
  else if (sentimentScore < -0.1) sentiment = 'negative';
  
  return {
    overall_sentiment: sentiment,
    sentiment_score: Math.round(sentimentScore * 100) / 100,
    positive_words: positiveCount,
    negative_words: negativeCount,
    confidence: Math.abs(sentimentScore),
    emotional_tone: getEmotionalTone(sentimentScore),
    recommendations: generateSentimentRecommendations(sentiment, sentimentScore)
  };
}

async function analyzeKeywordDensity(content: string, keywords: string[]) {
  const text = content.replace(/<[^>]*>/g, '').toLowerCase();
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const totalWords = words.length;
  
  const keywordAnalysis = keywords.map(keyword => {
    const keywordLower = keyword.toLowerCase();
    const regex = new RegExp(`\\b${keywordLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const matches = text.match(regex) || [];
    const count = matches.length;
    const density = totalWords > 0 ? (count / totalWords) * 100 : 0;
    
    return {
      keyword,
      count,
      density: Math.round(density * 100) / 100,
      optimal_range: density >= 1 && density <= 3,
      recommendation: getDensityRecommendation(density)
    };
  });
  
  // LSI Keywords (related terms)
  const lsiKeywords = generateLSIKeywords(text, keywords);
  
  return {
    target_keywords: keywordAnalysis,
    lsi_keywords: lsiKeywords,
    total_keywords_found: keywordAnalysis.reduce((sum, k) => sum + k.count, 0),
    keyword_distribution: analyzeKeywordDistribution(content, keywords)
  };
}

async function analyzeContentStructure(content: string) {
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);
  const avgParagraphLength = paragraphs.reduce((sum, p) => sum + p.split(/\s+/).length, 0) / paragraphs.length;
  
  // List detection
  const bulletLists = (content.match(/^\s*[-*+]\s/gm) || []).length;
  const numberedLists = (content.match(/^\s*\d+\.\s/gm) || []).length;
  
  return {
    paragraphs: paragraphs.length,
    avg_paragraph_length: Math.round(avgParagraphLength),
    has_introduction: paragraphs.length > 0 && paragraphs[0].split(/\s+/).length >= 50,
    has_conclusion: paragraphs.length > 1 && paragraphs[paragraphs.length - 1].split(/\s+/).length >= 30,
    bullet_lists: bulletLists,
    numbered_lists: numberedLists,
    total_lists: bulletLists + numberedLists,
    structure_score: calculateStructureScore(paragraphs.length, avgParagraphLength, bulletLists + numberedLists)
  };
}

async function generateOptimizationSuggestions(content: string, keywords: string[], optimizationType: string) {
  const suggestions: Array<{
    type: string;
    priority: string;
    suggestion: string;
    impact: string;
  }> = [];
  
  // SEO Suggestions
  if (!content.match(/<title[^>]*>/i) && !content.match(/^#\s/m)) {
    suggestions.push({
      type: 'seo',
      priority: 'high',
      suggestion: 'Add a compelling title (H1 tag) that includes your primary keyword',
      impact: 'high'
    });
  }
  
  // Readability Suggestions
  const avgSentenceLength = content.split(/[.!?]+/).filter(s => s.trim().length > 0)
    .reduce((sum, s) => sum + s.split(/\s+/).length, 0) / content.split(/[.!?]+/).length;
  
  if (avgSentenceLength > 20) {
    suggestions.push({
      type: 'readability',
      priority: 'medium',
      suggestion: 'Break down long sentences (average: ' + Math.round(avgSentenceLength) + ' words) for better readability',
      impact: 'medium'
    });
  }
  
  // Keyword Suggestions
  if (keywords.length === 0) {
    suggestions.push({
      type: 'seo',
      priority: 'high',
      suggestion: 'Add target keywords to optimize content for search engines',
      impact: 'high'
    });
  }
  
  // Structure Suggestions
  const h2Count = (content.match(/<h2[^>]*>/gi) || content.match(/^##\s/gm) || []).length;
  if (h2Count === 0 && content.split(/\s+/).length > 300) {
    suggestions.push({
      type: 'structure',
      priority: 'medium',
      suggestion: 'Add subheadings (H2 tags) to improve content structure and scannability',
      impact: 'medium'
    });
  }
  
  return suggestions.slice(0, 10); // Return top 10 suggestions
}

async function generateMetaTags(content: string, keywords: string[]) {
  const text = content.replace(/<[^>]*>/g, '');
  const title = extractTitle(content) || 'Untitled Content';
  const description = text.substring(0, 160) + (text.length > 160 ? '...' : '');
  
  return {
    title: title.substring(0, 60),
    description: description,
    keywords: keywords.join(', '),
    og_title: title.substring(0, 95),
    og_description: description,
    twitter_title: title.substring(0, 70),
    twitter_description: description.substring(0, 200),
    canonical_url: '',
    robots: 'index, follow'
  };
}

async function generateSchemaMarkup(content: string) {
  const title = extractTitle(content);
  const text = content.replace(/<[^>]*>/g, '');
  const wordCount = text.split(/\s+/).length;
  const readingTime = Math.ceil(wordCount / 200);
  
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    'headline': title,
    'wordCount': wordCount,
    'timeRequired': `PT${readingTime}M`,
    'articleBody': text.substring(0, 500),
    'publisher': {
      '@type': 'Organization',
      'name': 'Your Organization'
    },
    'author': {
      '@type': 'Person',
      'name': 'Content Author'
    },
    'datePublished': new Date().toISOString(),
    'dateModified': new Date().toISOString()
  };
}

// Helper functions
function analyzeKeywordPlacement(content: string, keywords: string[]) {
  const results = keywords.map(keyword => {
    const keywordLower = keyword.toLowerCase();
    const contentLower = content.toLowerCase();
    
    return {
      keyword,
      in_title: extractTitle(content)?.toLowerCase().includes(keywordLower) || false,
      in_first_paragraph: contentLower.split(/\n\s*\n/)[0]?.includes(keywordLower) || false,
      in_headings: (content.match(/<h[2-6][^>]*>.*?<\/h[2-6]>/gi) || [])
        .some(h => h.toLowerCase().includes(keywordLower)),
      in_meta_description: false, // Would need meta tag analysis
      placement_score: 0
    };
  });
  
  results.forEach(result => {
    let score = 0;
    if (result.in_title) score += 3;
    if (result.in_first_paragraph) score += 2;
    if (result.in_headings) score += 2;
    result.placement_score = score;
  });
  
  return results;
}

function countSyllables(text: string): number {
  const words = text.toLowerCase().match(/\b[a-z]+\b/g) || [];
  return words.reduce((total, word) => total + countWordSyllables(word), 0);
}

function countWordSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;
  
  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');
  
  const matches = word.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function getReadingLevel(score: number): string {
  if (score >= 90) return 'Very Easy';
  if (score >= 80) return 'Easy';
  if (score >= 70) return 'Fairly Easy';
  if (score >= 60) return 'Standard';
  if (score >= 50) return 'Fairly Difficult';
  if (score >= 30) return 'Difficult';
  return 'Very Difficult';
}

function generateReadabilityRecommendations(score: number, avgSentenceLength: number, complexWordRatio: number): string[] {
  const recommendations = [] as string[];
  
  if (score < 60) recommendations.push('Simplify sentence structure and use shorter sentences');
  if (avgSentenceLength > 20) recommendations.push('Break down sentences longer than 20 words');
  if (complexWordRatio > 15) recommendations.push('Replace complex words with simpler alternatives');
  if (score < 30) recommendations.push('Consider rewriting content for a broader audience');
  
  return recommendations;
}

function getEmotionalTone(score: number): string {
  if (score > 0.3) return 'very positive';
  if (score > 0.1) return 'positive';
  if (score > -0.1) return 'neutral';
  if (score > -0.3) return 'negative';
  return 'very negative';
}

function generateSentimentRecommendations(sentiment: string, score: number): string[] {
  const recommendations = [] as string[];
  
  if (sentiment === 'negative') {
    recommendations.push('Consider adding more positive language to balance the tone');
    recommendations.push('Focus on solutions and benefits rather than problems');
  } else if (sentiment === 'neutral' && Math.abs(score) < 0.05) {
    recommendations.push('Add more engaging and emotional language to connect with readers');
  }
  
  return recommendations;
}

function generateLSIKeywords(text: string, primaryKeywords: string[]): string[] {
  // Simple LSI keyword generation based on common related terms
  const lsiMap: { [key: string]: string[] } = {
    'marketing': ['advertising', 'promotion', 'branding', 'campaign', 'strategy'],
    'content': ['article', 'blog', 'writing', 'copy', 'text'],
    'seo': ['search', 'ranking', 'optimization', 'keywords', 'traffic'],
    'business': ['company', 'enterprise', 'organization', 'corporate', 'professional']
  };
  
  const lsiKeywords: string[] = [];
  primaryKeywords.forEach(keyword => {
    const related = lsiMap[keyword.toLowerCase()] || [];
    related.forEach(term => {
      if (text.toLowerCase().includes(term) && !lsiKeywords.includes(term)) {
        lsiKeywords.push(term);
      }
    });
  });
  
  return lsiKeywords.slice(0, 10);
}

function getDensityRecommendation(density: number): string {
  if (density < 0.5) return 'Consider adding more instances of this keyword';
  if (density > 3) return 'Keyword density too high, reduce usage to avoid over-optimization';
  return 'Keyword density is optimal';
}

function analyzeKeywordDistribution(content: string, keywords: string[]) {
  const sections = content.split(/\n\s*\n/);
  const distribution = sections.map((section, index) => {
    const keywordCount = keywords.reduce((count, keyword) => {
      const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      return count + (section.match(regex) || []).length;
    }, 0);
    
    return {
      section_index: index,
      keyword_count: keywordCount,
      section_length: section.split(/\s+/).length
    };
  });
  
  return distribution;
}

function calculateStructureScore(paragraphs: number, avgLength: number, lists: number): number {
  let score = 0;
  
  // Paragraph count score
  if (paragraphs >= 3 && paragraphs <= 15) score += 25;
  else if (paragraphs >= 2 && paragraphs <= 20) score += 15;
  
  // Average paragraph length score
  if (avgLength >= 40 && avgLength <= 80) score += 25;
  else if (avgLength >= 20 && avgLength <= 100) score += 15;
  
  // List usage score
  if (lists > 0) score += 25;
  
  // Structure bonus
  if (paragraphs >= 5 && lists >= 1 && avgLength >= 30 && avgLength <= 70) score += 25;
  
  return Math.min(100, score);
}

function extractTitle(content: string): string | null {
  const h1Match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match) return h1Match[1].replace(/<[^>]*>/g, '');
  
  const markdownMatch = content.match(/^#\s(.+)$/m);
  if (markdownMatch) return markdownMatch[1];
  
  return null;
}

function calculatePerformanceScore(results: any): number {
  let score = 0;
  let maxScore = 0;
  
  // SEO score (40%)
  const seo = results.seo_analysis;
  let seoScore = 0;
  if (seo.title_optimization.has_title) seoScore += 10;
  if (seo.title_optimization.optimal_length) seoScore += 10;
  if (seo.content_length.optimal_range) seoScore += 10;
  if (seo.header_structure.proper_hierarchy) seoScore += 10;
  score += seoScore;
  maxScore += 40;
  
  // Readability score (30%)
  const readability = results.readability_score.flesch_reading_ease;
  const readabilityScore = Math.min(30, Math.max(0, (readability / 100) * 30));
  score += readabilityScore;
  maxScore += 30;
  
  // Structure score (20%)
  score += (results.content_structure.structure_score / 100) * 20;
  maxScore += 20;
  
  // Sentiment bonus (10%)
  if (results.sentiment_analysis.overall_sentiment === 'positive') {
    score += 10;
  } else if (results.sentiment_analysis.overall_sentiment === 'neutral') {
    score += 5;
  }
  maxScore += 10;
  
  return Math.round((score / maxScore) * 100);
}