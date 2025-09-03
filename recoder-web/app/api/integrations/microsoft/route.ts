import { NextResponse } from 'next/server';
import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';

// 🏢 MICROSOFT 365 INTEGRATION - REAL OFFICE 365 & AZURE SERVICES
// Complete Microsoft Graph API integration with Outlook, Teams, SharePoint, OneDrive

class TokenAuthProvider implements AuthenticationProvider {
  constructor(private accessToken: string) {}

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}

interface MicrosoftAction {
  action: 'send_email' | 'get_emails' | 'create_calendar_event' | 'get_calendar_events' | 'upload_file' | 'get_user_profile' | 'create_teams_meeting' | 'get_sharepoint_sites' | 'search_files' | 'create_task' | 'get_contacts';
  data?: any;
  access_token?: string;
}

export async function POST(request: Request) {
  try {
    const body: MicrosoftAction = await request.json();
    const { action, data, access_token } = body;

    if (!access_token) {
      return NextResponse.json(
        { success: false, error: 'Access token required' },
        { status: 401 }
      );
    }

    const authProvider = new TokenAuthProvider(access_token);
    const graphClient = Client.initWithMiddleware({ authProvider });

    let result;

    switch (action) {
      case 'send_email':
        result = await sendEmail(graphClient, data);
        break;
        
      case 'get_emails':
        result = await getEmails(graphClient, data);
        break;
        
      case 'create_calendar_event':
        result = await createCalendarEvent(graphClient, data);
        break;
        
      case 'get_calendar_events':
        result = await getCalendarEvents(graphClient, data);
        break;
        
      case 'upload_file':
        result = await uploadFile(graphClient, data);
        break;
        
      case 'get_user_profile':
        result = await getUserProfile(graphClient, data);
        break;
        
      case 'create_teams_meeting':
        result = await createTeamsMeeting(graphClient, data);
        break;
        
      case 'get_sharepoint_sites':
        result = await getSharePointSites(graphClient, data);
        break;
        
      case 'search_files':
        result = await searchFiles(graphClient, data);
        break;
        
      case 'create_task':
        result = await createTask(graphClient, data);
        break;
        
      case 'get_contacts':
        result = await getContacts(graphClient, data);
        break;
        
      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Microsoft Graph API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Microsoft integration failed',
        code: error.code || 'MICROSOFT_ERROR'
      },
      { status: 500 }
    );
  }
}

// Send email via Outlook
async function sendEmail(graphClient: Client, data: any) {
  const email = {
    message: {
      subject: data.subject,
      body: {
        contentType: data.content_type || 'HTML',
        content: data.content
      },
      toRecipients: data.to_recipients.map((email: string) => ({
        emailAddress: {
          address: email
        }
      })),
      ccRecipients: data.cc_recipients?.map((email: string) => ({
        emailAddress: {
          address: email
        }
      })) || [],
      bccRecipients: data.bcc_recipients?.map((email: string) => ({
        emailAddress: {
          address: email
        }
      })) || [],
      attachments: data.attachments?.map((attachment: any) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: attachment.name,
        contentBytes: attachment.content_bytes
      })) || [],
      importance: data.importance || 'normal',
      isDeliveryReceiptRequested: data.delivery_receipt || false,
      isReadReceiptRequested: data.read_receipt || false
    },
    saveToSentItems: data.save_to_sent_items !== false
  };

  const response = await graphClient.api('/me/sendMail').post(email);
  
  return {
    status: 'sent',
    timestamp: new Date().toISOString()
  };
}

// Get emails from Outlook
async function getEmails(graphClient: Client, data: any = {}) {
  let query = graphClient.api('/me/messages');
  
  if (data.folder) {
    query = graphClient.api(`/me/mailFolders/${data.folder}/messages`);
  }
  
  if (data.filter) {
    query = query.filter(data.filter);
  }
  
  if (data.search) {
    query = query.search(data.search);
  }
  
  if (data.orderby) {
    query = query.orderby(data.orderby);
  }
  
  query = query.top(data.limit || 20);
  
  if (data.select) {
    query = query.select(data.select);
  }

  const messages = await query.get();

  return {
    messages: messages.value.map((message: any) => ({
      id: message.id,
      subject: message.subject,
      from: message.from?.emailAddress,
      to_recipients: message.toRecipients?.map((r: any) => r.emailAddress),
      received_datetime: message.receivedDateTime,
      created_datetime: message.createdDateTime,
      sent_datetime: message.sentDateTime,
      body_preview: message.bodyPreview,
      body: message.body,
      is_read: message.isRead,
      importance: message.importance,
      has_attachments: message.hasAttachments,
      flag: message.flag,
      categories: message.categories
    })),
    '@odata.nextLink': messages['@odata.nextLink'],
    '@odata.count': messages['@odata.count']
  };
}

// Create calendar event
async function createCalendarEvent(graphClient: Client, data: any) {
  const event = {
    subject: data.subject,
    body: {
      contentType: data.body_content_type || 'HTML',
      content: data.body_content || ''
    },
    start: {
      dateTime: data.start_datetime,
      timeZone: data.timezone || 'UTC'
    },
    end: {
      dateTime: data.end_datetime,
      timeZone: data.timezone || 'UTC'
    },
    location: {
      displayName: data.location || ''
    },
    attendees: data.attendees?.map((attendee: any) => ({
      emailAddress: {
        address: attendee.email,
        name: attendee.name
      },
      type: attendee.type || 'required'
    })) || [],
    isReminderOn: data.reminder_on !== false,
    reminderMinutesBeforeStart: data.reminder_minutes || 15,
    importance: data.importance || 'normal',
    sensitivity: data.sensitivity || 'normal',
    showAs: data.show_as || 'busy',
    isOnlineMeeting: data.online_meeting || false,
    onlineMeetingProvider: data.online_meeting_provider || 'teamsForBusiness'
  };

  const response = await graphClient.api('/me/events').post(event);

  return {
    event_id: response.id,
    subject: response.subject,
    start: response.start,
    end: response.end,
    location: response.location,
    attendees: response.attendees,
    web_link: response.webLink,
    online_meeting: response.onlineMeeting
  };
}

// Get calendar events
async function getCalendarEvents(graphClient: Client, data: any = {}) {
  let query = graphClient.api('/me/events');
  
  if (data.calendar_id) {
    query = graphClient.api(`/me/calendars/${data.calendar_id}/events`);
  }
  
  if (data.filter) {
    query = query.filter(data.filter);
  }
  
  if (data.orderby) {
    query = query.orderby(data.orderby);
  }
  
  query = query.top(data.limit || 20);

  const events = await query.get();

  return {
    events: events.value.map((event: any) => ({
      id: event.id,
      subject: event.subject,
      start: event.start,
      end: event.end,
      location: event.location,
      attendees: event.attendees,
      organizer: event.organizer,
      body: event.body,
      importance: event.importance,
      is_cancelled: event.isCancelled,
      is_organizer: event.isOrganizer,
      web_link: event.webLink,
      online_meeting: event.onlineMeeting
    })),
    '@odata.nextLink': events['@odata.nextLink']
  };
}

// Upload file to OneDrive
async function uploadFile(graphClient: Client, data: any) {
  const uploadPath = data.path || '/';
  const fileName = data.file_name;
  const fileContent = data.file_content; // base64 or buffer
  
  let response;
  
  if (data.file_size && data.file_size > 4 * 1024 * 1024) {
    // Large file upload session
    const uploadSession = await graphClient.api(`/me/drive/root:${uploadPath}${fileName}:/createUploadSession`).post({
      item: {
        '@microsoft.graph.conflictBehavior': data.conflict_behavior || 'replace',
        name: fileName
      }
    });
    
    // This would require chunked upload implementation
    response = { uploadUrl: uploadSession.uploadUrl, sessionId: uploadSession.id };
  } else {
    // Simple upload
    response = await graphClient.api(`/me/drive/root:${uploadPath}${fileName}:/content`).put(fileContent);
  }

  return {
    file_id: response.id,
    name: response.name,
    size: response.size,
    created_datetime: response.createdDateTime,
    modified_datetime: response.lastModifiedDateTime,
    download_url: response['@microsoft.graph.downloadUrl'],
    web_url: response.webUrl
  };
}

// Get user profile
async function getUserProfile(graphClient: Client, data: any = {}) {
  const user = await graphClient.api('/me').get();

  return {
    id: user.id,
    display_name: user.displayName,
    given_name: user.givenName,
    surname: user.surname,
    email: user.mail || user.userPrincipalName,
    job_title: user.jobTitle,
    office_location: user.officeLocation,
    preferred_language: user.preferredLanguage,
    mobile_phone: user.mobilePhone,
    business_phones: user.businessPhones,
    user_principal_name: user.userPrincipalName
  };
}

// Create Teams meeting
async function createTeamsMeeting(graphClient: Client, data: any) {
  const meeting = {
    subject: data.subject,
    body: {
      contentType: 'HTML',
      content: data.body_content || ''
    },
    start: {
      dateTime: data.start_datetime,
      timeZone: data.timezone || 'UTC'
    },
    end: {
      dateTime: data.end_datetime,
      timeZone: data.timezone || 'UTC'
    },
    attendees: data.attendees?.map((attendee: any) => ({
      emailAddress: {
        address: attendee.email,
        name: attendee.name
      },
      type: 'required'
    })) || [],
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness'
  };

  const response = await graphClient.api('/me/events').post(meeting);

  return {
    event_id: response.id,
    subject: response.subject,
    start: response.start,
    end: response.end,
    join_url: response.onlineMeeting?.joinUrl,
    conference_id: response.onlineMeeting?.conferenceId,
    attendees: response.attendees,
    web_link: response.webLink
  };
}

// Get SharePoint sites
async function getSharePointSites(graphClient: Client, data: any = {}) {
  let query = graphClient.api('/sites');
  
  if (data.search) {
    query = query.search(data.search);
  }
  
  query = query.top(data.limit || 20);

  const sites = await query.get();

  return {
    sites: sites.value.map((site: any) => ({
      id: site.id,
      display_name: site.displayName,
      name: site.name,
      description: site.description,
      web_url: site.webUrl,
      site_collection: site.siteCollection,
      created_datetime: site.createdDateTime,
      last_modified_datetime: site.lastModifiedDateTime
    })),
    '@odata.nextLink': sites['@odata.nextLink']
  };
}

// Search files across Microsoft 365
async function searchFiles(graphClient: Client, data: any) {
  const searchQuery = {
    requests: [
      {
        entityTypes: ['driveItem'],
        query: {
          queryString: data.query
        },
        from: data.from || 0,
        size: data.size || 25,
        fields: data.fields || ['name', 'webUrl', 'lastModifiedDateTime', 'size']
      }
    ]
  };

  const response = await graphClient.api('/search/query').post(searchQuery);

  return {
    files: response.value[0].hitsContainers[0].hits.map((hit: any) => ({
      id: hit.resource.id,
      name: hit.resource.name,
      web_url: hit.resource.webUrl,
      last_modified: hit.resource.lastModifiedDateTime,
      size: hit.resource.size,
      created_by: hit.resource.createdBy,
      summary: hit.summary
    })),
    total_hits: response.value[0].hitsContainers[0].total
  };
}

// Create task in Microsoft To Do
async function createTask(graphClient: Client, data: any) {
  const task = {
    title: data.title,
    body: {
      content: data.description || '',
      contentType: 'text'
    },
    dueDateTime: data.due_datetime ? {
      dateTime: data.due_datetime,
      timeZone: data.timezone || 'UTC'
    } : undefined,
    importance: data.importance || 'normal',
    isReminderOn: data.reminder_on || false,
    reminderDateTime: data.reminder_datetime ? {
      dateTime: data.reminder_datetime,
      timeZone: data.timezone || 'UTC'
    } : undefined,
    categories: data.categories || []
  };

  const listId = data.list_id || 'tasks'; // Default tasks list
  const response = await graphClient.api(`/me/todo/lists/${listId}/tasks`).post(task);

  return {
    task_id: response.id,
    title: response.title,
    status: response.status,
    importance: response.importance,
    created_datetime: response.createdDateTime,
    due_datetime: response.dueDateTime,
    web_url: response.webUrl
  };
}

// Get contacts
async function getContacts(graphClient: Client, data: any = {}) {
  let query = graphClient.api('/me/contacts');
  
  if (data.filter) {
    query = query.filter(data.filter);
  }
  
  if (data.search) {
    query = query.search(data.search);
  }
  
  if (data.orderby) {
    query = query.orderby(data.orderby);
  }
  
  query = query.top(data.limit || 20);

  const contacts = await query.get();

  return {
    contacts: contacts.value.map((contact: any) => ({
      id: contact.id,
      display_name: contact.displayName,
      given_name: contact.givenName,
      surname: contact.surname,
      email_addresses: contact.emailAddresses,
      phone_numbers: contact.phoneNumbers,
      business_address: contact.businessAddress,
      home_address: contact.homeAddress,
      company_name: contact.companyName,
      job_title: contact.jobTitle,
      birthday: contact.birthday,
      created_datetime: contact.createdDateTime,
      last_modified_datetime: contact.lastModifiedDateTime
    })),
    '@odata.nextLink': contacts['@odata.nextLink']
  };
}

export async function GET() {
  return NextResponse.json({
    service: 'Microsoft 365 Integration',
    status: 'operational',
    features: [
      'Outlook Email Management',
      'Calendar & Events',
      'OneDrive File Storage',
      'Teams Meetings',
      'SharePoint Sites',
      'Microsoft To Do Tasks',
      'Contacts Management',
      'Search Across M365'
    ],
    endpoints: {
      email: ['send_email', 'get_emails'],
      calendar: ['create_calendar_event', 'get_calendar_events'],
      files: ['upload_file', 'search_files'],
      meetings: ['create_teams_meeting'],
      sites: ['get_sharepoint_sites'],
      tasks: ['create_task'],
      contacts: ['get_contacts'],
      profile: ['get_user_profile']
    },
    authentication: {
      type: 'OAuth 2.0',
      scopes: [
        'Mail.ReadWrite',
        'Calendars.ReadWrite',
        'Files.ReadWrite.All',
        'Sites.Read.All',
        'Tasks.ReadWrite',
        'Contacts.ReadWrite',
        'User.Read',
        'OnlineMeetings.ReadWrite'
      ]
    }
  });
}