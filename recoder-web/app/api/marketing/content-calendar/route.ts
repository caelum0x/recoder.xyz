import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date') || new Date().toISOString().split('T')[0];
    const endDate = searchParams.get('end_date') || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const platform = searchParams.get('platform') || 'all';
    const status = searchParams.get('status') || 'all';

    // Mock calendar data - in real implementation, this would come from database
    const calendarEntries = await getCalendarEntries(startDate, endDate, platform, status);

    return NextResponse.json({
      success: true,
      calendar: {
        entries: calendarEntries,
        summary: generateCalendarSummary(calendarEntries),
        analytics: generateCalendarAnalytics(calendarEntries),
        upcoming_deadlines: getUpcomingDeadlines(calendarEntries)
      },
      date_range: { start_date: startDate, end_date: endDate },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Calendar fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      action,
      entry_data,
      bulk_data,
      template_id,
      auto_schedule_params
    } = body;

    let result;

    switch (action) {
      case 'create_entry':
        result = await createCalendarEntry(entry_data);
        break;
      case 'update_entry':
        result = await updateCalendarEntry(entry_data.id, entry_data);
        break;
      case 'delete_entry':
        result = await deleteCalendarEntry(entry_data.id);
        break;
      case 'bulk_create':
        result = await bulkCreateEntries(bulk_data);
        break;
      case 'auto_schedule':
        result = await autoScheduleContent(auto_schedule_params);
        break;
      case 'reschedule':
        result = await rescheduleEntry(entry_data.id, entry_data.new_date);
        break;
      case 'duplicate':
        result = await duplicateEntry(entry_data.id, entry_data.modifications);
        break;
      case 'create_from_template':
        result = await createFromTemplate(template_id, entry_data);
        break;
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Calendar operation error:', error);
    return NextResponse.json(
      { error: 'Calendar operation failed' },
      { status: 500 }
    );
  }
}

async function getCalendarEntries(startDate: string, endDate: string, platform: string, status: string) {
  // Mock calendar entries - would be database queries in real implementation
  const mockEntries = [
    {
      id: '1',
      title: 'Product Launch Blog Post',
      description: 'Announce the new AI features in our platform',
      content_type: 'blog_post',
      platform: 'website',
      scheduled_date: '2024-01-15T10:00:00Z',
      status: 'scheduled',
      author: 'Marketing Team',
      tags: ['product launch', 'AI', 'features'],
      priority: 'high',
      estimated_time: 120,
      approval_status: 'approved',
      content_preview: 'Exciting news! We\'re launching new AI-powered features...',
      target_audience: 'existing_customers',
      campaign_id: 'launch_2024_q1',
      seo_keywords: ['AI features', 'product launch', 'automation'],
      social_promotion: {
        twitter: { scheduled: true, time: '2024-01-15T11:00:00Z' },
        linkedin: { scheduled: true, time: '2024-01-15T14:00:00Z' },
        facebook: { scheduled: false }
      }
    },
    {
      id: '2',
      title: 'Weekly Newsletter',
      description: 'Industry insights and company updates',
      content_type: 'newsletter',
      platform: 'email',
      scheduled_date: '2024-01-16T09:00:00Z',
      status: 'draft',
      author: 'Content Team',
      tags: ['newsletter', 'weekly', 'insights'],
      priority: 'medium',
      estimated_time: 60,
      approval_status: 'pending',
      content_preview: 'This week in AI: major developments in...',
      target_audience: 'subscribers',
      campaign_id: 'weekly_newsletter',
      subscriber_segments: ['active_users', 'trial_users'],
      ab_test: {
        enabled: true,
        variants: ['subject_a', 'subject_b'],
        test_percentage: 20
      }
    },
    {
      id: '3',
      title: 'Tutorial Video: Getting Started',
      description: 'Onboarding video for new users',
      content_type: 'video',
      platform: 'youtube',
      scheduled_date: '2024-01-18T16:00:00Z',
      status: 'in_production',
      author: 'Video Team',
      tags: ['tutorial', 'onboarding', 'beginners'],
      priority: 'high',
      estimated_time: 300,
      approval_status: 'in_review',
      content_preview: '5-minute tutorial covering basic setup...',
      target_audience: 'new_users',
      campaign_id: 'user_onboarding',
      video_details: {
        duration: '5:30',
        thumbnail_ready: true,
        captions: 'auto_generated',
        chapters: ['Introduction', 'Setup', 'First Steps', 'Conclusion']
      }
    },
    {
      id: '4',
      title: 'Social Media: Feature Highlight',
      description: 'Instagram carousel showcasing key features',
      content_type: 'social_post',
      platform: 'instagram',
      scheduled_date: '2024-01-19T13:00:00Z',
      status: 'scheduled',
      author: 'Social Team',
      tags: ['features', 'carousel', 'visual'],
      priority: 'medium',
      estimated_time: 45,
      approval_status: 'approved',
      content_preview: '🚀 Discover how our AI can transform your workflow...',
      target_audience: 'prospects',
      campaign_id: 'feature_awareness',
      social_details: {
        post_type: 'carousel',
        image_count: 5,
        hashtags: ['#AI', '#Automation', '#Productivity'],
        call_to_action: 'Learn More'
      }
    },
    {
      id: '5',
      title: 'Case Study: Enterprise Success',
      description: 'Customer success story with ROI metrics',
      content_type: 'case_study',
      platform: 'website',
      scheduled_date: '2024-01-22T11:00:00Z',
      status: 'draft',
      author: 'Success Team',
      tags: ['case study', 'enterprise', 'ROI'],
      priority: 'high',
      estimated_time: 180,
      approval_status: 'pending',
      content_preview: 'How TechCorp saved 40% on development costs...',
      target_audience: 'enterprise_prospects',
      campaign_id: 'social_proof',
      case_study_details: {
        customer: 'TechCorp Inc.',
        roi_metrics: ['40% cost reduction', '60% faster delivery'],
        testimonial_ready: true,
        data_verified: false
      }
    }
  ];

  // Filter based on parameters
  let filteredEntries = mockEntries.filter(entry => {
    const entryDate = new Date(entry.scheduled_date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (entryDate < start || entryDate > end) return false;
    if (platform !== 'all' && entry.platform !== platform) return false;
    if (status !== 'all' && entry.status !== status) return false;
    
    return true;
  });

  return filteredEntries;
}

async function createCalendarEntry(entryData: any) {
  // Validate required fields
  const requiredFields = ['title', 'content_type', 'platform', 'scheduled_date'];
  const missingFields = requiredFields.filter(field => !entryData[field]);
  
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Generate entry ID and set defaults
  const entry = {
    id: generateId(),
    ...entryData,
    status: entryData.status || 'draft',
    created_date: new Date().toISOString(),
    updated_date: new Date().toISOString(),
    author: entryData.author || 'Current User',
    priority: entryData.priority || 'medium',
    approval_status: 'pending',
    tags: entryData.tags || [],
    estimated_time: entryData.estimated_time || 60
  };

  // Auto-generate SEO recommendations if content provided
  if (entryData.content_preview) {
    entry.seo_suggestions = await generateSEOSuggestions(entryData.content_preview, entryData.seo_keywords || []);
  }

  // Auto-schedule social promotion if applicable
  if (entryData.auto_social_promotion) {
    entry.social_promotion = generateSocialPromotionSchedule(entry.scheduled_date, entry.content_type);
  }

  return entry;
}

async function updateCalendarEntry(id: string, updateData: any) {
  // In real implementation, would update database record
  const updatedEntry = {
    ...updateData,
    id,
    updated_date: new Date().toISOString()
  };

  // Log the change for audit purposes
  const changeLog = {
    entry_id: id,
    changes: updateData,
    updated_by: 'Current User',
    updated_at: new Date().toISOString()
  };

  return { entry: updatedEntry, change_log: changeLog };
}

async function deleteCalendarEntry(id: string) {
  // In real implementation, would soft delete or archive
  return {
    deleted_entry_id: id,
    deleted_at: new Date().toISOString(),
    deleted_by: 'Current User'
  };
}

async function bulkCreateEntries(bulkData: any[]) {
  const results = await Promise.all(
    bulkData.map(async (entry, index) => {
      try {
        const createdEntry = await createCalendarEntry(entry);
        return { success: true, entry: createdEntry, index };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error', index };
      }
    })
  );

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  return {
    total: bulkData.length,
    successful,
    failed,
    results
  };
}

async function autoScheduleContent(params: any) {
  const {
    content_pieces,
    date_range,
    platform_preferences,
    optimal_times,
    content_spacing,
    avoid_conflicts
  } = params;

  const scheduledContent: any[] = [];
  const startDate = new Date(date_range.start);
  const endDate = new Date(date_range.end);
  
  // Optimal posting times by platform (mock data)
  const optimalTimes = {
    twitter: ['09:00', '12:00', '17:00'],
    linkedin: ['08:00', '12:00', '17:00'],
    instagram: ['11:00', '14:00', '19:00'],
    facebook: ['13:00', '15:00', '19:00'],
    email: ['09:00', '14:00'],
    website: ['10:00', '14:00']
  };

  for (const content of content_pieces) {
    const platform = content.platform;
    const preferredTimes = optimalTimes[platform as keyof typeof optimalTimes] || ['12:00'];
    
    // Find optimal slot within date range
    let currentDate = new Date(startDate);
    let scheduled = false;
    
    while (currentDate <= endDate && !scheduled) {
      for (const time of preferredTimes) {
        const scheduledDateTime = new Date(currentDate);
        const [hours, minutes] = time.split(':').map(Number);
        scheduledDateTime.setHours(hours, minutes, 0, 0);
        
        // Check for conflicts if required
        if (avoid_conflicts) {
          const hasConflict = await checkScheduleConflict(scheduledDateTime, platform, content_spacing);
          if (hasConflict) continue;
        }
        
        scheduledContent.push({
          ...content,
          scheduled_date: scheduledDateTime.toISOString(),
          auto_scheduled: true,
          optimal_time_used: time
        });
        
        scheduled = true;
        break;
      }
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return {
    scheduled_count: scheduledContent.length,
    failed_count: content_pieces.length - scheduledContent.length,
    scheduled_content: scheduledContent,
    date_range_used: { start: startDate.toISOString(), end: endDate.toISOString() }
  };
}

async function rescheduleEntry(id: string, newDate: string) {
  const conflicts = await checkScheduleConflict(new Date(newDate), 'all', 60);
  
  return {
    entry_id: id,
    old_date: 'previous_date', // would be fetched from database
    new_date: newDate,
    has_conflicts: conflicts,
    rescheduled_at: new Date().toISOString()
  };
}

async function duplicateEntry(id: string, modifications: any) {
  // In real implementation, would fetch original entry from database
  const newEntry = {
    ...modifications,
    id: generateId(),
    title: `${modifications.title || 'Original Title'} (Copy)`,
    status: 'draft',
    created_date: new Date().toISOString(),
    duplicated_from: id
  };

  return newEntry;
}

async function createFromTemplate(templateId: string, customData: any) {
  // Mock templates - would be stored in database
  const templates = {
    'blog_template': {
      content_type: 'blog_post',
      platform: 'website',
      tags: ['blog'],
      estimated_time: 120,
      seo_keywords: []
    },
    'newsletter_template': {
      content_type: 'newsletter',
      platform: 'email',
      tags: ['newsletter'],
      estimated_time: 60,
      subscriber_segments: ['all_subscribers']
    },
    'social_template': {
      content_type: 'social_post',
      platform: 'twitter',
      tags: ['social'],
      estimated_time: 15,
      hashtags: []
    }
  };

  const template = templates[templateId as keyof typeof templates];
  if (!template) {
    throw new Error('Template not found');
  }

  return await createCalendarEntry({
    ...template,
    ...customData,
    created_from_template: templateId
  });
}

// Helper functions
function generateCalendarSummary(entries: any[]) {
  const statusCounts = entries.reduce((acc, entry) => {
    acc[entry.status] = (acc[entry.status] || 0) + 1;
    return acc;
  }, {});

  const platformCounts = entries.reduce((acc, entry) => {
    acc[entry.platform] = (acc[entry.platform] || 0) + 1;
    return acc;
  }, {});

  return {
    total_entries: entries.length,
    status_breakdown: statusCounts,
    platform_breakdown: platformCounts,
    upcoming_this_week: entries.filter(entry => {
      const entryDate = new Date(entry.scheduled_date);
      const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      return entryDate <= weekFromNow;
    }).length,
    overdue: entries.filter(entry => {
      const entryDate = new Date(entry.scheduled_date);
      return entryDate < new Date() && entry.status === 'draft';
    }).length
  };
}

function generateCalendarAnalytics(entries: any[]) {
  const totalEstimatedTime = entries.reduce((total, entry) => total + (entry.estimated_time || 0), 0);
  const avgTimePerEntry = totalEstimatedTime / entries.length || 0;
  
  const contentTypes = entries.reduce((acc, entry) => {
    acc[entry.content_type] = (acc[entry.content_type] || 0) + 1;
    return acc;
  }, {});

  const priorities = entries.reduce((acc, entry) => {
    acc[entry.priority] = (acc[entry.priority] || 0) + 1;
    return acc;
  }, {});

  return {
    total_estimated_time: totalEstimatedTime,
    avg_time_per_entry: Math.round(avgTimePerEntry),
    content_type_distribution: contentTypes,
    priority_distribution: priorities,
    completion_rate: calculateCompletionRate(entries),
    productivity_score: calculateProductivityScore(entries)
  };
}

function getUpcomingDeadlines(entries: any[]) {
  const now = new Date();
  const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  
  return entries
    .filter(entry => {
      const entryDate = new Date(entry.scheduled_date);
      return entryDate > now && entryDate <= threeDaysFromNow && entry.status !== 'published';
    })
    .sort((a, b) => new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime())
    .slice(0, 10)
    .map(entry => ({
      id: entry.id,
      title: entry.title,
      scheduled_date: entry.scheduled_date,
      status: entry.status,
      priority: entry.priority,
      days_until_deadline: Math.ceil((new Date(entry.scheduled_date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    }));
}

async function generateSEOSuggestions(content: string, keywords: string[]) {
  // Mock SEO analysis - would integrate with actual SEO tools
  return {
    recommended_keywords: ['AI automation', 'productivity tools', 'workflow optimization'],
    title_suggestions: [
      'Boost Productivity with AI Automation',
      'Transform Your Workflow with Smart Tools'
    ],
    meta_description: content.substring(0, 155) + '...',
    readability_score: 75,
    word_count_recommendation: '800-1200 words for optimal SEO'
  };
}

function generateSocialPromotionSchedule(publishDate: string, contentType: string) {
  const publishTime = new Date(publishDate);
  const promotions: any = {};

  if (contentType === 'blog_post' || contentType === 'case_study') {
    // Schedule Twitter post 1 hour after publish
    promotions.twitter = {
      scheduled: true,
      time: new Date(publishTime.getTime() + 60 * 60 * 1000).toISOString()
    };
    
    // Schedule LinkedIn post 3 hours after publish
    promotions.linkedin = {
      scheduled: true,
      time: new Date(publishTime.getTime() + 3 * 60 * 60 * 1000).toISOString()
    };
  }

  return promotions;
}

async function checkScheduleConflict(dateTime: Date, platform: string, spacingMinutes: number) {
  // Mock conflict checking - would query database for nearby entries
  const conflicts = [];
  
  // Check for entries within spacing window
  const startWindow = new Date(dateTime.getTime() - spacingMinutes * 60 * 1000);
  const endWindow = new Date(dateTime.getTime() + spacingMinutes * 60 * 1000);
  
  // Mock existing entries check
  const hasConflict = Math.random() < 0.1; // 10% chance of conflict
  
  return hasConflict;
}

function calculateCompletionRate(entries: any[]): number {
  const publishedCount = entries.filter(entry => entry.status === 'published').length;
  return entries.length > 0 ? Math.round((publishedCount / entries.length) * 100) : 0;
}

function calculateProductivityScore(entries: any[]): number {
  // Mock productivity calculation based on various factors
  let score = 0;
  
  // On-time delivery score
  const onTimeEntries = entries.filter(entry => {
    if (entry.status !== 'published') return true;
    // Mock: assume 90% are on time
    return Math.random() < 0.9;
  }).length;
  score += (onTimeEntries / entries.length) * 40;
  
  // Quality score (based on approval status)
  const approvedEntries = entries.filter(entry => entry.approval_status === 'approved').length;
  score += (approvedEntries / entries.length) * 30;
  
  // Efficiency score (time management)
  score += 30; // Mock efficiency score
  
  return Math.round(score);
}

function generateId(): string {
  return 'cal_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}