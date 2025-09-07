import { Router, Request, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { authenticate } from '../middleware/auth';
import * as cron from 'node-cron';

const router = Router();

// Export format types
type ExportFormat = 'pdf' | 'excel' | 'csv' | 'json';

// Schedule frequency enum
enum ScheduleFrequency {
  HOURLY = 'hourly',
  DAILY = 'daily', 
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  CUSTOM = 'custom'
}

// Delivery method enum
enum DeliveryMethod {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  S3 = 's3',
  FTP = 'ftp'
}

interface ScheduleConfig {
  frequency: ScheduleFrequency;
  cronExpression?: string;
  time: string;
  timezone: string;
  startDate?: string;
  endDate?: string;
  enabled: boolean;
}

interface DeliveryConfig {
  method: DeliveryMethod;
  recipients: string[];
  subject?: string;
  message?: string;
  webhookUrl?: string;
  slackChannel?: string;
  slackWebhookUrl?: string;
  s3Bucket?: string;
  s3Key?: string;
  ftpHost?: string;
  ftpPath?: string;
  credentials?: Record<string, string>;
}

// Store active cron jobs
const activeCronJobs = new Map<string, cron.ScheduledTask>();

/**
 * POST /api/analytics/reports/:reportId/schedule
 * Create a scheduled report delivery
 */
router.post('/reports/:reportId/schedule', [
  authenticate,
  body('name').isLength({ min: 1, max: 100 }),
  body('description').optional().isLength({ max: 500 }),
  body('schedule').isObject(),
  body('delivery').isArray().isLength({ min: 1, max: 10 }),
  body('exportOptions').isObject(),
], async (req: Request, res: Response) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { reportId } = req.params;
    const { 
      name, 
      description, 
      schedule, 
      delivery, 
      exportOptions 
    }: {
      name: string;
      description?: string;
      schedule: ScheduleConfig;
      delivery: DeliveryConfig[];
      exportOptions: any;
    } = req.body;

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Mock implementation for now
    const mockSchedule = {
      id: `schedule-${Date.now()}`,
      reportId,
      userId,
      name,
      description,
      schedule,
      delivery,
      exportOptions,
      isActive: true,
      createdAt: new Date(),
      runCount: 0,
      failureCount: 0
    };

    // Set up cron job
    const cronExpression = generateCronExpression(schedule);
    if (cronExpression) {
      const task = cron.schedule(cronExpression, async () => {
        await executeScheduledReport(mockSchedule.id);
      }, {
        timezone: schedule.timezone
      });
      
      if (schedule.enabled) {
        task.start();
      } else {
        task.stop();
      }
      
      activeCronJobs.set(mockSchedule.id, task);
    }

    console.log(`Schedule created: ${mockSchedule.id} for report ${reportId}`);

    res.status(201).json({
      success: true,
      schedule: mockSchedule,
      message: 'Report schedule created successfully'
    });

  } catch (error) {
    console.error('Schedule creation error:', error);
    res.status(500).json({ error: 'Failed to create report schedule' });
  }
});

/**
 * GET /api/analytics/reports/:reportId/schedules
 * Get schedules for a report
 */
router.get('/reports/:reportId/schedules', [
  authenticate,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
], async (req: Request, res: Response) => {
  try {
    const { reportId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const userId = req.user?.id;

    // Mock implementation
    const mockSchedules = Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: `schedule-${i + 1}`,
      reportId,
      userId,
      name: `Schedule ${i + 1}`,
      description: `Mock schedule ${i + 1}`,
      schedule: {
        frequency: ScheduleFrequency.DAILY,
        time: '09:00',
        timezone: 'UTC',
        enabled: true
      },
      delivery: [{
        method: DeliveryMethod.EMAIL,
        recipients: ['user@example.com'],
        subject: 'Scheduled Report'
      }],
      exportOptions: {
        formats: ['pdf'],
        includeCharts: true,
        includeRawData: true,
        compression: false
      },
      isActive: true,
      createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
      runCount: Math.floor(Math.random() * 10),
      failureCount: 0
    }));

    res.json({
      schedules: mockSchedules,
      pagination: {
        page,
        limit,
        total: mockSchedules.length,
        totalPages: 1,
        hasNext: false,
        hasPrevious: false
      }
    });

  } catch (error) {
    console.error('Schedule fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch schedules' });
  }
});

// Helper functions
function generateCronExpression(schedule: ScheduleConfig): string | null {
  if (schedule.frequency === ScheduleFrequency.CUSTOM && schedule.cronExpression) {
    return schedule.cronExpression;
  }

  const [hour, minute] = schedule.time.split(':').map(Number);
  
  switch (schedule.frequency) {
    case ScheduleFrequency.HOURLY:
      return `${minute} * * * *`;
    case ScheduleFrequency.DAILY:
      return `${minute} ${hour} * * *`;
    case ScheduleFrequency.WEEKLY:
      return `${minute} ${hour} * * 1`; // Monday
    case ScheduleFrequency.MONTHLY:
      return `${minute} ${hour} 1 * *`; // First day of month
    case ScheduleFrequency.QUARTERLY:
      return `${minute} ${hour} 1 */3 *`; // First day of quarter
    default:
      return null;
  }
}

async function executeScheduledReport(scheduleId: string): Promise<void> {
  console.log(`Executing scheduled report: ${scheduleId}`);
  // Mock implementation - would generate and deliver report
}

function validateScheduleConfig(schedule: ScheduleConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!schedule.frequency) {
    errors.push('Frequency is required');
  }

  if (!schedule.time || !/^\d{2}:\d{2}$/.test(schedule.time)) {
    errors.push('Time must be in HH:mm format');
  }

  if (!schedule.timezone) {
    errors.push('Timezone is required');
  }

  if (schedule.frequency === ScheduleFrequency.CUSTOM && !schedule.cronExpression) {
    errors.push('Cron expression is required for custom frequency');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

async function validateDeliveryConfigs(delivery: DeliveryConfig[], userId: string): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  for (const config of delivery) {
    if (!config.method) {
      errors.push('Delivery method is required');
    }

    if (!config.recipients || config.recipients.length === 0) {
      errors.push('At least one recipient is required');
    }

    // Validate based on method
    switch (config.method) {
      case DeliveryMethod.EMAIL:
        if (!config.recipients.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
          errors.push('Invalid email addresses');
        }
        break;
      case DeliveryMethod.WEBHOOK:
        if (!config.webhookUrl || !/^https?:\/\//.test(config.webhookUrl)) {
          errors.push('Valid webhook URL is required');
        }
        break;
      case DeliveryMethod.SLACK:
        if (!config.slackWebhookUrl && !config.slackChannel) {
          errors.push('Slack webhook URL or channel is required');
        }
        break;
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default router;
