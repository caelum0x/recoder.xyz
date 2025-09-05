import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, JWTPayload } from '@/lib/auth/jwt';

// 📧 SENDGRID EMAIL INTEGRATION API - Production Ready
// Transactional emails, templates, contacts, and analytics

interface SendGridConfig {
  apiKey: string;
  fromEmail?: string;
  fromName?: string;
}

interface EmailRecipient {
  email: string;
  name?: string;
}

interface SendGridAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

class SendGridClient {
  private baseURL = 'https://api.sendgrid.com/v3';
  private apiKey: string;
  private fromEmail: string;
  private fromName: string;

  constructor(config: SendGridConfig) {
    this.apiKey = config.apiKey;
    this.fromEmail = config.fromEmail || 'noreply@recoder.xyz';
    this.fromName = config.fromName || 'Recoder';
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid API error: ${response.status} - ${errorText}`);
      }

      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (error) {
      throw new Error(`Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async sendEmail(to: EmailRecipient[], subject: string, content: string, isHtml = false) {
    const payload = {
      personalizations: [{
        to: to.map(recipient => ({
          email: recipient.email,
          name: recipient.name
        }))
      }],
      from: {
        email: this.fromEmail,
        name: this.fromName
      },
      subject,
      content: [{
        type: isHtml ? 'text/html' : 'text/plain',
        value: content
      }]
    };

    return this.makeRequest('/mail/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async sendTemplateEmail(templateId: string, to: EmailRecipient[], dynamicData: any = {}) {
    const payload = {
      personalizations: [{
        to: to.map(recipient => ({
          email: recipient.email,
          name: recipient.name
        })),
        dynamic_template_data: dynamicData
      }],
      from: {
        email: this.fromEmail,
        name: this.fromName
      },
      template_id: templateId
    };

    return this.makeRequest('/mail/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getTemplates() {
    return this.makeRequest('/templates?generations=dynamic&page_size=200');
  }

  async getTemplate(templateId: string) {
    return this.makeRequest(`/templates/${templateId}`);
  }

  async createTemplate(name: string, subject: string) {
    return this.makeRequest('/templates', {
      method: 'POST',
      body: JSON.stringify({
        name,
        generation: 'dynamic',
      }),
    });
  }

  async getContacts(limit = 50) {
    return this.makeRequest(`/marketing/contacts?page_size=${limit}`);
  }

  async addContacts(contacts: Array<{ email: string; first_name?: string; last_name?: string }>) {
    return this.makeRequest('/marketing/contacts', {
      method: 'PUT',
      body: JSON.stringify({ contacts }),
    });
  }

  async getEmailStats(startDate: string, endDate?: string) {
    const params = new URLSearchParams({
      start_date: startDate,
      ...(endDate && { end_date: endDate }),
      aggregated_by: 'day',
    });

    return this.makeRequest(`/stats?${params}`);
  }

  async getSuppressions() {
    return this.makeRequest('/asm/suppressions');
  }

  async addSuppression(email: string) {
    return this.makeRequest('/asm/suppressions', {
      method: 'POST',
      body: JSON.stringify({
        recipient_emails: [email]
      }),
    });
  }

  async removeSuppression(email: string) {
    return this.makeRequest(`/asm/suppressions/${email}`, {
      method: 'DELETE',
    });
  }
}

// GET /api/integrations/sendgrid
export const GET = requireAuth(async (request: NextRequest, user: JWTPayload): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const apiKey = searchParams.get('api_key');

    if (!apiKey) {
      return NextResponse.json<SendGridAPIResponse>({ 
        success: false, 
        error: 'SendGrid API key required' 
      }, { status: 400 });
    }

    const client = new SendGridClient({ apiKey });

    switch (action) {
      case 'templates': {
        const templates = await client.getTemplates();
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: templates });
      }

      case 'template': {
        const templateId = searchParams.get('template_id');
        if (!templateId) {
          return NextResponse.json<SendGridAPIResponse>({ 
            success: false, 
            error: 'Template ID required' 
          }, { status: 400 });
        }
        const template = await client.getTemplate(templateId);
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: template });
      }

      case 'contacts': {
        const limit = parseInt(searchParams.get('limit') || '50');
        const contacts = await client.getContacts(limit);
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: contacts });
      }

      case 'stats': {
        const startDate = searchParams.get('start_date');
        if (!startDate) {
          return NextResponse.json<SendGridAPIResponse>({ 
            success: false, 
            error: 'Start date required' 
          }, { status: 400 });
        }
        const endDate = searchParams.get('end_date');
        const stats = await client.getEmailStats(startDate, endDate || undefined);
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: stats });
      }

      case 'suppressions': {
        const suppressions = await client.getSuppressions();
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: suppressions });
      }

      default:
        return NextResponse.json<SendGridAPIResponse>({ 
          success: false, 
          error: 'Invalid action' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('SendGrid API error:', error);
    return NextResponse.json<SendGridAPIResponse>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
});

// POST /api/integrations/sendgrid
export const POST = requireAuth(async (request: NextRequest, user: JWTPayload): Promise<NextResponse> => {
  try {
    const body = await request.json();
    const { action, api_key, ...params } = body;

    if (!api_key) {
      return NextResponse.json<SendGridAPIResponse>({ 
        success: false, 
        error: 'SendGrid API key required' 
      }, { status: 400 });
    }

    const client = new SendGridClient({ 
      apiKey: api_key,
      fromEmail: params.from_email,
      fromName: params.from_name 
    });

    switch (action) {
      case 'send_email': {
        const { to, subject, content, content_type } = params;
        
        if (!to || !subject || !content) {
          return NextResponse.json<SendGridAPIResponse>({ 
            success: false, 
            error: 'Missing required email fields' 
          }, { status: 400 });
        }

        const recipients = Array.isArray(to) ? to : [{ email: to }];
        const isHtml = content_type === 'html';
        const result = await client.sendEmail(recipients, subject, content, isHtml);
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: result });
      }

      case 'send_template_email': {
        const { template_id, to, dynamic_template_data } = params;
        
        if (!template_id || !to) {
          return NextResponse.json<SendGridAPIResponse>({ 
            success: false, 
            error: 'Template ID and recipient required' 
          }, { status: 400 });
        }

        const recipients = Array.isArray(to) ? to : [{ email: to }];
        const result = await client.sendTemplateEmail(template_id, recipients, dynamic_template_data || {});
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: result });
      }

      case 'create_template': {
        const { name, subject } = params;
        
        if (!name || !subject) {
          return NextResponse.json<SendGridAPIResponse>({ 
            success: false, 
            error: 'Template name and subject required' 
          }, { status: 400 });
        }

        const result = await client.createTemplate(name, subject);
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: result });
      }

      case 'add_contacts': {
        const { contacts } = params;
        
        if (!contacts || !Array.isArray(contacts)) {
          return NextResponse.json<SendGridAPIResponse>({ 
            success: false, 
            error: 'Contacts array required' 
          }, { status: 400 });
        }

        const result = await client.addContacts(contacts);
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: result });
      }

      case 'add_suppression': {
        const { email } = params;
        
        if (!email) {
          return NextResponse.json<SendGridAPIResponse>({ 
            success: false, 
            error: 'Email address required' 
          }, { status: 400 });
        }

        const result = await client.addSuppression(email);
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: result });
      }

      default:
        return NextResponse.json<SendGridAPIResponse>({ 
          success: false, 
          error: 'Invalid action' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('SendGrid API error:', error);
    return NextResponse.json<SendGridAPIResponse>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
});

// DELETE /api/integrations/sendgrid
export const DELETE = requireAuth(async (request: NextRequest, user: JWTPayload): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const apiKey = searchParams.get('api_key');

    if (!apiKey) {
      return NextResponse.json<SendGridAPIResponse>({ 
        success: false, 
        error: 'SendGrid API key required' 
      }, { status: 400 });
    }

    const client = new SendGridClient({ apiKey });

    switch (action) {
      case 'remove_suppression': {
        const email = searchParams.get('email');
        
        if (!email) {
          return NextResponse.json<SendGridAPIResponse>({ 
            success: false, 
            error: 'Email address required' 
          }, { status: 400 });
        }

        const result = await client.removeSuppression(email);
        return NextResponse.json<SendGridAPIResponse>({ success: true, data: result });
      }

      default:
        return NextResponse.json<SendGridAPIResponse>({ 
          success: false, 
          error: 'Invalid action' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('SendGrid API error:', error);
    return NextResponse.json<SendGridAPIResponse>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
});