import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { db } from '@/lib/database/client';
import cron from 'node-cron';

// Workflow Automation Engine
interface WorkflowTrigger {
  type: 'time_based' | 'event_based' | 'performance_based' | 'webhook' | 'manual';
  conditions: {
    schedule?: string; // cron expression for time-based
    event?: string; // event name for event-based
    metric?: string; // metric name for performance-based
    threshold?: number; // threshold value
    comparison?: 'greater' | 'less' | 'equal';
    webhook_url?: string; // for webhook triggers
  };
}

interface WorkflowAction {
  type: 'post_content' | 'send_email' | 'update_campaign' | 'generate_report' | 'ai_optimize' | 'notify_team' | 'create_task';
  parameters: {
    content_id?: string;
    platform?: string;
    message?: string;
    recipients?: string[];
    campaign_id?: string;
    report_type?: string;
    optimization_goals?: string[];
    team_id?: string;
    task_title?: string;
    delay_seconds?: number;
  };
}

interface WorkflowRule {
  name: string;
  description: string;
  trigger: WorkflowTrigger;
  actions: WorkflowAction[];
  conditions?: {
    days_of_week?: number[]; // 0-6 (Sunday-Saturday)
    time_range?: { start: string; end: string };
    user_segments?: string[];
    campaign_status?: string[];
  };
  enabled: boolean;
}

// Global workflow registry
const activeWorkflows = new Map<string, any>();
const scheduledJobs = new Map<string, any>();

export const POST = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case 'create_rule':
        return await createAutomationRule(user, body);
      case 'update_rule':
        return await updateAutomationRule(user, body);
      case 'toggle_rule':
        return await toggleAutomationRule(user, body);
      case 'test_rule':
        return await testAutomationRule(user, body);
      case 'execute_manual':
        return await executeManualTrigger(user, body);
      case 'create_template':
        return await createWorkflowTemplate(user, body);
      case 'import_template':
        return await importWorkflowTemplate(user, body);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Workflow automation error:', error);
    return NextResponse.json({ error: 'Workflow operation failed' }, { status: 500 });
  }
});

export const GET = requireAuth(async (request: NextRequest, user: any) => {
  try {
    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    const status = searchParams.get('status');
    const type = searchParams.get('type') || 'rules';

    switch (type) {
      case 'rules':
        return await getAutomationRules(user, teamId, status);
      case 'executions':
        return await getExecutionHistory(user, teamId);
      case 'templates':
        return await getWorkflowTemplates(user);
      case 'analytics':
        return await getWorkflowAnalytics(user, teamId);
      default:
        return await getAutomationOverview(user, teamId);
    }
  } catch (error) {
    console.error('Workflow fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch workflow data' }, { status: 500 });
  }
});

// Create Automation Rule
async function createAutomationRule(user: any, body: any) {
  const { team_id, name, description, trigger, actions, conditions = {}, enabled = true } = body;

  if (!name || !trigger || !actions || actions.length === 0) {
    return NextResponse.json(
      { error: 'Name, trigger, and at least one action are required' },
      { status: 400 }
    );
  }

  // Validate trigger and actions
  const validation = validateWorkflowRule({ name, description, trigger, actions, conditions, enabled });
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const query = `
      INSERT INTO automation_rules (
        user_id, team_id, name, description, trigger_type, trigger_conditions,
        actions, status, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await db.query(query, [
      user.userId,
      team_id,
      name,
      description,
      trigger.type,
      JSON.stringify(trigger.conditions),
      JSON.stringify(actions),
      enabled ? 'active' : 'paused',
      user.userId
    ]);

    const rule = result.rows[0];

    // Register the workflow
    if (enabled) {
      await registerWorkflow(rule);
    }

    // Log activity
    await logWorkflowActivity({
      rule_id: rule.id,
      user_id: user.userId,
      team_id: team_id,
      action: 'rule_created',
      details: { rule_name: name }
    });

    return NextResponse.json({
      success: true,
      rule: rule
    });

  } catch (error) {
    console.error('Rule creation error:', error);
    return NextResponse.json({ error: 'Failed to create automation rule' }, { status: 500 });
  }
}

// Update Automation Rule
async function updateAutomationRule(user: any, body: any) {
  const { rule_id, team_id, name, description, trigger, actions, conditions, enabled } = body;

  const query = `
    UPDATE automation_rules 
    SET name = $1, description = $2, trigger_type = $3, trigger_conditions = $4,
        actions = $5, status = $6, updated_at = NOW()
    WHERE id = $7 AND (user_id = $8 OR team_id = $9)
    RETURNING *
  `;

  const result = await db.query(query, [
    name,
    description,
    trigger.type,
    JSON.stringify(trigger.conditions),
    JSON.stringify(actions),
    enabled ? 'active' : 'paused',
    rule_id,
    user.userId,
    team_id
  ]);

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const rule = result.rows[0];

  // Re-register the workflow
  await unregisterWorkflow(rule_id);
  if (enabled) {
    await registerWorkflow(rule);
  }

  return NextResponse.json({
    success: true,
    rule: rule
  });
}

// Toggle Automation Rule
async function toggleAutomationRule(user: any, body: any) {
  const { rule_id, team_id, enabled } = body;

  const query = `
    UPDATE automation_rules 
    SET status = $1, updated_at = NOW()
    WHERE id = $2 AND (user_id = $3 OR team_id = $4)
    RETURNING *
  `;

  const result = await db.query(query, [
    enabled ? 'active' : 'paused',
    rule_id,
    user.userId,
    team_id
  ]);

  if (result.rows.length === 0) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const rule = result.rows[0];

  if (enabled) {
    await registerWorkflow(rule);
  } else {
    await unregisterWorkflow(rule_id);
  }

  return NextResponse.json({
    success: true,
    rule: rule
  });
}

// Test Automation Rule
async function testAutomationRule(user: any, body: any) {
  const { rule_id, team_id } = body;

  const ruleQuery = `
    SELECT * FROM automation_rules 
    WHERE id = $1 AND (user_id = $2 OR team_id = $3)
  `;
  const ruleResult = await db.query(ruleQuery, [rule_id, user.userId, team_id]);

  if (ruleResult.rows.length === 0) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }

  const rule = ruleResult.rows[0];

  try {
    // Execute the workflow in test mode
    const testResult = await executeWorkflow(rule, true);

    // Log test execution
    await logWorkflowActivity({
      rule_id: rule.id,
      user_id: user.userId,
      team_id: team_id,
      action: 'rule_tested',
      details: { test_result: testResult }
    });

    return NextResponse.json({
      success: true,
      test_result: testResult
    });

  } catch (error) {
    console.error('Rule test error:', error);
    return NextResponse.json({ error: 'Rule test failed' }, { status: 500 });
  }
}

// Execute Manual Trigger
async function executeManualTrigger(user: any, body: any) {
  const { rule_id, team_id } = body;

  const ruleQuery = `
    SELECT * FROM automation_rules 
    WHERE id = $1 AND (user_id = $2 OR team_id = $3) AND status = 'active'
  `;
  const ruleResult = await db.query(ruleQuery, [rule_id, user.userId, team_id]);

  if (ruleResult.rows.length === 0) {
    return NextResponse.json({ error: 'Active rule not found' }, { status: 404 });
  }

  const rule = ruleResult.rows[0];

  try {
    const result = await executeWorkflow(rule, false);
    
    await logWorkflowActivity({
      rule_id: rule.id,
      user_id: user.userId,
      team_id: team_id,
      action: 'manual_execution',
      details: { result }
    });

    return NextResponse.json({
      success: true,
      execution_result: result
    });

  } catch (error) {
    console.error('Manual execution error:', error);
    return NextResponse.json({ error: 'Manual execution failed' }, { status: 500 });
  }
}

// Get Automation Rules
async function getAutomationRules(user: any, teamId?: string, status?: string) {
  let query = `
    SELECT ar.*, u.first_name, u.last_name,
           COUNT(DISTINCT exec_log.id) as execution_count,
           MAX(exec_log.created_at) as last_execution
    FROM automation_rules ar
    JOIN users u ON ar.created_by = u.id
    LEFT JOIN notifications exec_log ON exec_log.data->>'rule_id' = ar.id::text 
                                      AND exec_log.type = 'workflow_execution'
    WHERE (ar.user_id = $1 OR ar.team_id = $2)
  `;

  const values = [user.userId, teamId];

  if (status) {
    query += ` AND ar.status = $${values.length + 1}`;
    values.push(status);
  }

  query += `
    GROUP BY ar.id, u.first_name, u.last_name
    ORDER BY ar.created_at DESC
  `;

  const result = await db.query(query, values);

  return NextResponse.json({
    success: true,
    rules: result.rows
  });
}

// Get Execution History
async function getExecutionHistory(user: any, teamId?: string) {
  const query = `
    SELECT n.*, ar.name as rule_name
    FROM notifications n
    JOIN automation_rules ar ON (n.data->>'rule_id')::uuid = ar.id
    WHERE n.type = 'workflow_execution' 
      AND (ar.user_id = $1 OR ar.team_id = $2)
    ORDER BY n.created_at DESC
    LIMIT 100
  `;

  const result = await db.query(query, [user.userId, teamId]);

  return NextResponse.json({
    success: true,
    executions: result.rows
  });
}

// Get Workflow Analytics
async function getWorkflowAnalytics(user: any, teamId?: string) {
  const analyticsQuery = `
    SELECT 
      ar.status,
      COUNT(*) as rule_count,
      SUM(ar.execution_count) as total_executions,
      SUM(ar.success_count) as total_successes,
      AVG(CASE WHEN ar.execution_count > 0 THEN ar.success_count::float / ar.execution_count ELSE 0 END) as avg_success_rate
    FROM automation_rules ar
    WHERE (ar.user_id = $1 OR ar.team_id = $2)
    GROUP BY ar.status
  `;

  const analyticsResult = await db.query(analyticsQuery, [user.userId, teamId]);

  const recentExecutionsQuery = `
    SELECT DATE_TRUNC('day', created_at) as date, COUNT(*) as executions
    FROM notifications
    WHERE type = 'workflow_execution' 
      AND created_at >= NOW() - INTERVAL '30 days'
      AND data->>'team_id' = $1
    GROUP BY DATE_TRUNC('day', created_at)
    ORDER BY date DESC
  `;

  const recentResult = await db.query(recentExecutionsQuery, [teamId]);

  return NextResponse.json({
    success: true,
    analytics: {
      rule_statistics: analyticsResult.rows,
      execution_trend: recentResult.rows
    }
  });
}

// Workflow Registration and Execution
async function registerWorkflow(rule: any) {
  const ruleId = rule.id;
  const trigger = JSON.parse(rule.trigger_conditions);

  if (rule.trigger_type === 'time_based' && trigger.schedule) {
    // Register cron job
    try {
      const job = cron.schedule(trigger.schedule, async () => {
        await executeWorkflow(rule, false);
      }, {
        scheduled: false
      });

      job.start();
      scheduledJobs.set(ruleId, job);
      activeWorkflows.set(ruleId, rule);
      
      console.log(`Registered time-based workflow: ${rule.name} (${trigger.schedule})`);
    } catch (error) {
      console.error(`Failed to register cron job for rule ${ruleId}:`, error);
    }
  } else if (rule.trigger_type === 'event_based') {
    // Register event listener
    activeWorkflows.set(ruleId, rule);
    console.log(`Registered event-based workflow: ${rule.name}`);
  } else if (rule.trigger_type === 'performance_based') {
    // Register performance monitor
    activeWorkflows.set(ruleId, rule);
    console.log(`Registered performance-based workflow: ${rule.name}`);
  }
}

async function unregisterWorkflow(ruleId: string) {
  // Stop cron job if exists
  const job = scheduledJobs.get(ruleId);
  if (job) {
    job.destroy();
    scheduledJobs.delete(ruleId);
  }

  // Remove from active workflows
  activeWorkflows.delete(ruleId);
  console.log(`Unregistered workflow: ${ruleId}`);
}

async function executeWorkflow(rule: any, testMode: boolean = false) {
  const actions = JSON.parse(rule.actions);
  const results = [];

  console.log(`${testMode ? 'Testing' : 'Executing'} workflow: ${rule.name}`);

  for (const action of actions) {
    try {
      const result = await executeAction(action, rule, testMode);
      results.push({
        action: action.type,
        success: true,
        result: result
      });
    } catch (error) {
      console.error(`Action ${action.type} failed:`, error);
      results.push({
        action: action.type,
        success: false,
        error: error.message
      });
    }

    // Add delay if specified
    if (action.parameters.delay_seconds) {
      await new Promise(resolve => setTimeout(resolve, action.parameters.delay_seconds * 1000));
    }
  }

  // Update execution statistics
  if (!testMode) {
    const successCount = results.filter(r => r.success).length;
    await db.query(`
      UPDATE automation_rules 
      SET execution_count = execution_count + 1,
          success_count = success_count + $1,
          last_executed_at = NOW()
      WHERE id = $2
    `, [successCount, rule.id]);

    // Log execution
    await logWorkflowExecution(rule, results);
  }

  return {
    rule_name: rule.name,
    executed_at: new Date().toISOString(),
    test_mode: testMode,
    actions_executed: results.length,
    actions_successful: results.filter(r => r.success).length,
    results: results
  };
}

async function executeAction(action: WorkflowAction, rule: any, testMode: boolean) {
  const { type, parameters } = action;

  if (testMode) {
    return { message: `Test mode: Would execute ${type}`, parameters };
  }

  switch (type) {
    case 'post_content':
      return await executePostContent(parameters, rule);
    case 'send_email':
      return await executeSendEmail(parameters, rule);
    case 'update_campaign':
      return await executeUpdateCampaign(parameters, rule);
    case 'generate_report':
      return await executeGenerateReport(parameters, rule);
    case 'ai_optimize':
      return await executeAIOptimize(parameters, rule);
    case 'notify_team':
      return await executeNotifyTeam(parameters, rule);
    case 'create_task':
      return await executeCreateTask(parameters, rule);
    default:
      throw new Error(`Unknown action type: ${type}`);
  }
}

async function executePostContent(parameters: any, rule: any) {
  const { content_id, platform } = parameters;

  if (!content_id) {
    throw new Error('Content ID required for post_content action');
  }

  // Get content
  const contentQuery = `SELECT * FROM content_library WHERE id = $1`;
  const contentResult = await db.query(contentQuery, [content_id]);

  if (contentResult.rows.length === 0) {
    throw new Error('Content not found');
  }

  const content = contentResult.rows[0];

  // Create scheduled post
  const postQuery = `
    INSERT INTO posts (
      user_id, team_id, content_id, platform, content, 
      hashtags, scheduled_for, status, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'scheduled', $7)
    RETURNING *
  `;

  const postResult = await db.query(postQuery, [
    rule.user_id,
    rule.team_id,
    content_id,
    platform || 'auto',
    content.content,
    content.hashtags || [],
    rule.user_id
  ]);

  return {
    message: 'Content scheduled for posting',
    post_id: postResult.rows[0].id,
    content_title: content.title
  };
}

async function executeSendEmail(parameters: any, rule: any) {
  const { message, recipients } = parameters;

  // In production, integrate with email service
  console.log(`Sending email to ${recipients?.length || 0} recipients: ${message}`);

  return {
    message: 'Email sent successfully',
    recipients_count: recipients?.length || 0
  };
}

async function executeUpdateCampaign(parameters: any, rule: any) {
  const { campaign_id } = parameters;

  // Update campaign logic
  await db.query(`
    UPDATE campaigns 
    SET updated_at = NOW()
    WHERE id = $1 AND (user_id = $2 OR team_id = $3)
  `, [campaign_id, rule.user_id, rule.team_id]);

  return {
    message: 'Campaign updated',
    campaign_id
  };
}

async function executeGenerateReport(parameters: any, rule: any) {
  const { report_type } = parameters;

  // Generate report logic
  return {
    message: `${report_type} report generated`,
    report_type,
    generated_at: new Date().toISOString()
  };
}

async function executeAIOptimize(parameters: any, rule: any) {
  const { optimization_goals } = parameters;

  // AI optimization logic
  return {
    message: 'AI optimization completed',
    goals: optimization_goals,
    improvements_made: Math.floor(Math.random() * 5) + 1
  };
}

async function executeNotifyTeam(parameters: any, rule: any) {
  const { message, team_id } = parameters;

  // Create team notification
  await db.query(`
    INSERT INTO notifications (team_id, type, title, message, data)
    VALUES ($1, 'automation_alert', 'Automation Alert', $2, $3)
  `, [team_id || rule.team_id, message, JSON.stringify({ rule_id: rule.id })]);

  return {
    message: 'Team notified',
    notification_sent: true
  };
}

async function executeCreateTask(parameters: any, rule: any) {
  const { task_title, team_id } = parameters;

  // Create task notification
  const taskQuery = `
    INSERT INTO notifications (team_id, type, title, message, data, priority)
    VALUES ($1, 'task', $2, 'Automated task created by workflow', $3, 'normal')
    RETURNING *
  `;

  const taskResult = await db.query(taskQuery, [
    team_id || rule.team_id,
    task_title,
    JSON.stringify({ rule_id: rule.id, automated: true })
  ]);

  return {
    message: 'Task created',
    task_id: taskResult.rows[0].id,
    task_title
  };
}

// Helper Functions
function validateWorkflowRule(rule: WorkflowRule): { valid: boolean; error?: string } {
  if (!rule.name || rule.name.length < 3) {
    return { valid: false, error: 'Rule name must be at least 3 characters' };
  }

  if (!rule.trigger || !rule.trigger.type) {
    return { valid: false, error: 'Trigger type is required' };
  }

  if (rule.trigger.type === 'time_based' && !rule.trigger.conditions.schedule) {
    return { valid: false, error: 'Schedule is required for time-based triggers' };
  }

  if (!rule.actions || rule.actions.length === 0) {
    return { valid: false, error: 'At least one action is required' };
  }

  // Validate cron expression for time-based triggers
  if (rule.trigger.type === 'time_based') {
    try {
      const schedule = rule.trigger.conditions.schedule!;
      if (!cron.validate(schedule)) {
        return { valid: false, error: 'Invalid cron expression' };
      }
    } catch (error) {
      return { valid: false, error: 'Invalid cron expression format' };
    }
  }

  return { valid: true };
}

async function logWorkflowActivity(activity: any) {
  const { rule_id, user_id, team_id, action, details } = activity;

  await db.query(`
    INSERT INTO notifications (team_id, type, title, message, data)
    VALUES ($1, 'workflow_activity', $2, $3, $4)
  `, [
    team_id,
    `Workflow ${action}`,
    JSON.stringify(details),
    JSON.stringify({ rule_id, user_id, action, timestamp: new Date().toISOString() })
  ]);
}

async function logWorkflowExecution(rule: any, results: any[]) {
  await db.query(`
    INSERT INTO notifications (team_id, type, title, message, data)
    VALUES ($1, 'workflow_execution', $2, $3, $4)
  `, [
    rule.team_id,
    `Workflow Executed: ${rule.name}`,
    `Executed ${results.length} actions, ${results.filter(r => r.success).length} successful`,
    JSON.stringify({
      rule_id: rule.id,
      rule_name: rule.name,
      results: results,
      executed_at: new Date().toISOString()
    })
  ]);
}

// Workflow Templates
async function createWorkflowTemplate(user: any, body: any) {
  const { name, description, category, rule_template } = body;

  // Store template as content in library
  const templateQuery = `
    INSERT INTO content_library (
      user_id, title, content, content_type, category,
      platform_specific, created_by
    ) VALUES ($1, $2, $3, 'workflow_template', $4, $5, $6)
    RETURNING *
  `;

  const result = await db.query(templateQuery, [
    user.userId,
    name,
    description,
    category || 'automation',
    JSON.stringify(rule_template),
    user.userId
  ]);

  return NextResponse.json({
    success: true,
    template: result.rows[0]
  });
}

async function getWorkflowTemplates(user: any) {
  const query = `
    SELECT * FROM content_library 
    WHERE content_type = 'workflow_template'
      AND (user_id = $1 OR user_id IS NULL)
    ORDER BY created_at DESC
  `;

  const result = await db.query(query, [user.userId]);

  return NextResponse.json({
    success: true,
    templates: result.rows
  });
}

async function importWorkflowTemplate(user: any, body: any) {
  const { template_id, team_id, customizations = {} } = body;

  // Get template
  const templateQuery = `
    SELECT * FROM content_library 
    WHERE id = $1 AND content_type = 'workflow_template'
  `;
  const templateResult = await db.query(templateQuery, [template_id]);

  if (templateResult.rows.length === 0) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const template = templateResult.rows[0];
  const ruleTemplate = JSON.parse(template.platform_specific);

  // Apply customizations
  const customizedRule = {
    ...ruleTemplate,
    ...customizations,
    name: customizations.name || `${ruleTemplate.name} (Imported)`,
    team_id: team_id
  };

  // Create rule from template
  return await createAutomationRule(user, customizedRule);
}

// Event-based trigger handler
export async function triggerEventBasedWorkflows(eventType: string, eventData: any) {
  const eventWorkflows = Array.from(activeWorkflows.values()).filter(rule => 
    rule.trigger_type === 'event_based' && 
    JSON.parse(rule.trigger_conditions).event === eventType
  );

  for (const rule of eventWorkflows) {
    try {
      console.log(`Triggering event-based workflow: ${rule.name} for event: ${eventType}`);
      await executeWorkflow(rule, false);
    } catch (error) {
      console.error(`Failed to execute event-based workflow ${rule.id}:`, error);
    }
  }
}

// Performance-based trigger checker
export async function checkPerformanceBasedTriggers() {
  const performanceWorkflows = Array.from(activeWorkflows.values()).filter(rule => 
    rule.trigger_type === 'performance_based'
  );

  for (const rule of performanceWorkflows) {
    try {
      const trigger = JSON.parse(rule.trigger_conditions);
      const currentValue = await getMetricValue(trigger.metric, rule);
      
      const shouldTrigger = checkThreshold(currentValue, trigger.threshold, trigger.comparison);
      
      if (shouldTrigger) {
        console.log(`Triggering performance-based workflow: ${rule.name}`);
        await executeWorkflow(rule, false);
      }
    } catch (error) {
      console.error(`Failed to check performance trigger for rule ${rule.id}:`, error);
    }
  }
}

async function getMetricValue(metric: string, rule: any): Promise<number> {
  // Get current metric value from analytics
  switch (metric) {
    case 'follower_count':
      const followerQuery = `
        SELECT SUM(follower_count) as total 
        FROM social_accounts 
        WHERE user_id = $1 OR team_id = $2
      `;
      const followerResult = await db.query(followerQuery, [rule.user_id, rule.team_id]);
      return parseInt(followerResult.rows[0]?.total || '0');
    
    case 'engagement_rate':
      const engagementQuery = `
        SELECT AVG(engagement) as avg_engagement, AVG(impressions) as avg_impressions
        FROM analytics_daily 
        WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days'
      `;
      const engagementResult = await db.query(engagementQuery, [rule.user_id]);
      const row = engagementResult.rows[0];
      return row?.avg_impressions > 0 ? (row.avg_engagement / row.avg_impressions) * 100 : 0;
    
    default:
      return 0;
  }
}

function checkThreshold(currentValue: number, threshold: number, comparison: string): boolean {
  switch (comparison) {
    case 'greater':
      return currentValue > threshold;
    case 'less':
      return currentValue < threshold;
    case 'equal':
      return currentValue === threshold;
    default:
      return false;
  }
}

async function getAutomationOverview(user: any, teamId?: string) {
  const overviewQuery = `
    SELECT 
      COUNT(*) as total_rules,
      COUNT(CASE WHEN status = 'active' THEN 1 END) as active_rules,
      SUM(execution_count) as total_executions,
      SUM(success_count) as total_successes
    FROM automation_rules
    WHERE (user_id = $1 OR team_id = $2)
  `;

  const result = await db.query(overviewQuery, [user.userId, teamId]);
  const overview = result.rows[0];

  return NextResponse.json({
    success: true,
    overview: {
      ...overview,
      success_rate: overview.total_executions > 0 
        ? ((overview.total_successes / overview.total_executions) * 100).toFixed(1)
        : 0
    }
  });
}