import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, JWTPayload } from '@/lib/auth/jwt';

// 🔗 GOOGLE INTEGRATION - Clean Implementation
// Gmail, Drive, Calendar, Analytics integration with proper TypeScript

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: string;
  sizeEstimate: number;
  payload?: {
    partId?: string;
    mimeType?: string;
    filename?: string;
    headers?: Array<{ name: string; value: string }>;
    body?: {
      attachmentId?: string;
      size?: number;
      data?: string;
    };
  };
}

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  webContentLink?: string;
  parents?: string[];
}

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  attendees?: Array<{
    email: string;
    displayName?: string;
    responseStatus?: string;
  }>;
  location?: string;
  status?: string;
}

class GoogleAPIClient {
  private baseURL = 'https://www.googleapis.com';
  private tokens: GoogleTokens;

  constructor(tokens: GoogleTokens) {
    this.tokens = tokens;
  }

  private async makeRequest(endpoint: string, options: RequestInit = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.tokens.access_token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  // Gmail methods
  async getMessages(query?: string, maxResults = 10): Promise<{ messages: GmailMessage[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
      ...(query && { q: query }),
    });

    return this.makeRequest(`/gmail/v1/users/me/messages?${params}`);
  }

  async getMessage(messageId: string): Promise<GmailMessage> {
    return this.makeRequest(`/gmail/v1/users/me/messages/${messageId}`);
  }

  async sendEmail(to: string, subject: string, body: string) {
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      body
    ].join('\n');

    const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    return this.makeRequest('/gmail/v1/users/me/messages/send', {
      method: 'POST',
      body: JSON.stringify({
        raw: encodedEmail
      }),
    });
  }

  // Drive methods
  async getDriveFiles(pageSize = 10): Promise<{ files: GoogleDriveFile[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      pageSize: pageSize.toString(),
      fields: 'files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,webContentLink,parents)',
    });

    return this.makeRequest(`/drive/v3/files?${params}`);
  }

  async getDriveFile(fileId: string): Promise<GoogleDriveFile> {
    return this.makeRequest(`/drive/v3/files/${fileId}?fields=*`);
  }

  async createDriveFile(name: string, content: string, mimeType = 'text/plain') {
    const metadata = {
      name,
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', new Blob([content], { type: mimeType }));

    const response = await fetch(`${this.baseURL}/upload/drive/v3/files?uploadType=multipart`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.tokens.access_token}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`Drive upload error: ${response.status}`);
    }

    return response.json();
  }

  // Calendar methods
  async getCalendars() {
    return this.makeRequest('/calendar/v3/users/me/calendarList');
  }

  async getEvents(calendarId = 'primary', maxResults = 10): Promise<{ items: CalendarEvent[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      maxResults: maxResults.toString(),
      singleEvents: 'true',
      orderBy: 'startTime',
    });

    return this.makeRequest(`/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
  }

  async createEvent(calendarId = 'primary', event: Partial<CalendarEvent>): Promise<CalendarEvent> {
    return this.makeRequest(`/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      body: JSON.stringify(event),
    });
  }
}

// GET /api/integrations/google
export const GET = requireAuth(async (request: NextRequest, user: JWTPayload) => {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const accessToken = searchParams.get('access_token');

    if (!accessToken) {
      return NextResponse.json({ error: 'Access token required' }, { status: 400 });
    }

    const client = new GoogleAPIClient({ access_token: accessToken });

    switch (action) {
      case 'gmail_messages': {
        const query = searchParams.get('query') || undefined;
        const maxResults = parseInt(searchParams.get('maxResults') || '10');
        const messages = await client.getMessages(query, maxResults);
        return NextResponse.json({ success: true, data: messages });
      }

      case 'drive_files': {
        const pageSize = parseInt(searchParams.get('pageSize') || '10');
        const files = await client.getDriveFiles(pageSize);
        return NextResponse.json({ success: true, data: files });
      }

      case 'calendar_events': {
        const calendarId = searchParams.get('calendarId') || 'primary';
        const maxResults = parseInt(searchParams.get('maxResults') || '10');
        const events = await client.getEvents(calendarId, maxResults);
        return NextResponse.json({ success: true, data: events });
      }

      case 'calendars': {
        const calendars = await client.getCalendars();
        return NextResponse.json({ success: true, data: calendars });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Google API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
});

// POST /api/integrations/google
export const POST = requireAuth(async (request: NextRequest, user: JWTPayload) => {
  try {
    const body = await request.json();
    const { action, access_token, ...params } = body;

    if (!access_token) {
      return NextResponse.json({ error: 'Access token required' }, { status: 400 });
    }

    const client = new GoogleAPIClient({ access_token });

    switch (action) {
      case 'send_email': {
        const { to, subject, body: emailBody } = params;
        if (!to || !subject || !emailBody) {
          return NextResponse.json({ error: 'Missing required email fields' }, { status: 400 });
        }
        const result = await client.sendEmail(to, subject, emailBody);
        return NextResponse.json({ success: true, data: result });
      }

      case 'create_drive_file': {
        const { name, content, mimeType } = params;
        if (!name || !content) {
          return NextResponse.json({ error: 'Missing required file fields' }, { status: 400 });
        }
        const result = await client.createDriveFile(name, content, mimeType);
        return NextResponse.json({ success: true, data: result });
      }

      case 'create_calendar_event': {
        const { calendarId = 'primary', event } = params;
        if (!event || !event.summary) {
          return NextResponse.json({ error: 'Missing required event fields' }, { status: 400 });
        }
        const result = await client.createEvent(calendarId, event);
        return NextResponse.json({ success: true, data: result });
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Google API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
});

// PUT /api/integrations/google  
export const PUT = requireAuth(async (request: NextRequest, user: JWTPayload) => {
  try {
    const body = await request.json();
    const { action, access_token, ...params } = body;

    if (!access_token) {
      return NextResponse.json({ error: 'Access token required' }, { status: 400 });
    }

    // For future update operations
    return NextResponse.json({ 
      success: true, 
      message: 'Update operations not implemented yet' 
    });
  } catch (error) {
    console.error('Google API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
});