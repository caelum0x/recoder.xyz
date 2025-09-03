import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

// 🔍 GOOGLE WORKSPACE INTEGRATION - REAL PRODUCTIVITY SUITE
// Complete Google Workspace API integration with Gmail, Drive, Calendar, Sheets, Docs

interface GoogleAction {
  action: 'send_email' | 'get_emails' | 'create_draft' | 'get_labels' | 'create_label' | 'get_threads' | 'modify_thread' | 'get_profile' | 'list_files' | 'upload_file' | 'download_file' | 'create_folder' | 'share_file' | 'delete_file' | 'copy_file' | 'move_file' | 'get_file_metadata' | 'list_events' | 'create_event' | 'update_event' | 'delete_event' | 'get_calendars' | 'create_calendar' | 'get_freebusy' | 'create_spreadsheet' | 'get_spreadsheet' | 'update_cells' | 'append_rows' | 'batch_update' | 'create_document' | 'get_document' | 'batch_update_document' | 'get_contacts' | 'create_contact' | 'update_contact' | 'delete_contact' | 'search_contacts';
  data?: any;
  access_token?: string;
  refresh_token?: string;
  file_id?: string;
  folder_id?: string;
  spreadsheet_id?: string;
  document_id?: string;
  calendar_id?: string;
  event_id?: string;
  contact_id?: string;
  label_id?: string;
  thread_id?: string;
  message_id?: string;
}

export async function POST(request: Request) {
  try {
    const body: GoogleAction = await request.json();
    const { action, data, access_token, refresh_token, file_id, folder_id, spreadsheet_id, document_id, calendar_id, event_id, contact_id, label_id, thread_id, message_id } = body;

    // Initialize OAuth2 client
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    if (access_token) {
      oauth2Client.setCredentials({
        access_token,
        refresh_token
      });
    }

    let result;

    switch (action) {
      // Gmail Actions
      case 'send_email':
        result = await sendEmail(oauth2Client, data);
        break;
        
      case 'get_emails':
        result = await getEmails(oauth2Client, data);
        break;
        
      case 'create_draft':
        result = await createDraft(oauth2Client, data);
        break;
        
      case 'get_labels':
        result = await getLabels(oauth2Client);
        break;
        
      case 'create_label':
        result = await createLabel(oauth2Client, data);
        break;
        
      case 'get_threads':
        result = await getThreads(oauth2Client, data);
        break;
        
      case 'modify_thread':
        result = await modifyThread(oauth2Client, thread_id!, data);
        break;
        
      case 'get_profile':
        result = await getProfile(oauth2Client);
        break;

      // Google Drive Actions
      case 'list_files':
        result = await listFiles(oauth2Client, data);
        break;
        
      case 'upload_file':
        result = await uploadFile(oauth2Client, data);
        break;
        
      case 'download_file':
        result = await downloadFile(oauth2Client, file_id!);
        break;
        
      case 'create_folder':
        result = await createFolder(oauth2Client, data);
        break;
        
      case 'share_file':
        result = await shareFile(oauth2Client, file_id!, data);
        break;
        
      case 'delete_file':
        result = await deleteFile(oauth2Client, file_id!);
        break;
        
      case 'copy_file':
        result = await copyFile(oauth2Client, file_id!, data);
        break;
        
      case 'move_file':
        result = await moveFile(oauth2Client, file_id!, data);
        break;
        
      case 'get_file_metadata':
        result = await getFileMetadata(oauth2Client, file_id!);
        break;

      // Google Calendar Actions
      case 'list_events':
        result = await listEvents(oauth2Client, calendar_id!, data);
        break;
        
      case 'create_event':
        result = await createEvent(oauth2Client, calendar_id!, data);
        break;
        
      case 'update_event':
        result = await updateEvent(oauth2Client, calendar_id!, event_id!, data);
        break;
        
      case 'delete_event':
        result = await deleteEvent(oauth2Client, calendar_id!, event_id!);
        break;
        
      case 'get_calendars':
        result = await getCalendars(oauth2Client);
        break;
        
      case 'create_calendar':
        result = await createCalendar(oauth2Client, data);
        break;
        
      case 'get_freebusy':
        result = await getFreeBusy(oauth2Client, data);
        break;

      // Google Sheets Actions
      case 'create_spreadsheet':
        result = await createSpreadsheet(oauth2Client, data);
        break;
        
      case 'get_spreadsheet':
        result = await getSpreadsheet(oauth2Client, spreadsheet_id!);
        break;
        
      case 'update_cells':
        result = await updateCells(oauth2Client, spreadsheet_id!, data);
        break;
        
      case 'append_rows':
        result = await appendRows(oauth2Client, spreadsheet_id!, data);
        break;
        
      case 'batch_update':
        result = await batchUpdate(oauth2Client, spreadsheet_id!, data);
        break;

      // Google Docs Actions
      case 'create_document':
        result = await createDocument(oauth2Client, data);
        break;
        
      case 'get_document':
        result = await getDocument(oauth2Client, document_id!);
        break;
        
      case 'batch_update_document':
        result = await batchUpdateDocument(oauth2Client, document_id!, data);
        break;

      // Google Contacts Actions
      case 'get_contacts':
        result = await getContacts(oauth2Client, data);
        break;
        
      case 'create_contact':
        result = await createContact(oauth2Client, data);
        break;
        
      case 'update_contact':
        result = await updateContact(oauth2Client, contact_id!, data);
        break;
        
      case 'delete_contact':
        result = await deleteContact(oauth2Client, contact_id!);
        break;
        
      case 'search_contacts':
        result = await searchContacts(oauth2Client, data);
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
    console.error('Google API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Google integration failed',
        code: error.code || 'GOOGLE_ERROR'
      },
      { status: 500 }
    );
  }
}

// Gmail Functions
async function sendEmail(oauth2Client: OAuth2Client, data: any) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const email = [
    `To: ${data.to}`,
    `Cc: ${data.cc || ''}`,
    `Bcc: ${data.bcc || ''}`,
    `Subject: ${data.subject}`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    data.body
  ].join('\n');

  const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail
    }
  });

  return {
    message_id: response.data.id,
    thread_id: response.data.threadId,
    label_ids: response.data.labelIds,
    sent: true,
    sent_at: new Date().toISOString()
  };
}

async function getEmails(oauth2Client: OAuth2Client, params: any = {}) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const response = await gmail.users.messages.list({
    userId: 'me',
    q: params.query,
    labelIds: params.labelIds,
    maxResults: params.maxResults || 10,
    pageToken: params.pageToken,
    includeSpamTrash: params.includeSpamTrash || false
  });

  const messages = [];
  if (response.data.messages) {
    for (const message of response.data.messages) {
      const messageDetails = await gmail.users.messages.get({
        userId: 'me',
        id: message.id!,
        format: 'full'
      });

      const headers = messageDetails.data.payload?.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const from = headers.find(h => h.name === 'From')?.value || '';
      const to = headers.find(h => h.name === 'To')?.value || '';
      const date = headers.find(h => h.name === 'Date')?.value || '';

      messages.push({
        id: messageDetails.data.id,
        thread_id: messageDetails.data.threadId,
        label_ids: messageDetails.data.labelIds,
        snippet: messageDetails.data.snippet,
        subject,
        from,
        to,
        date,
        internal_date: messageDetails.data.internalDate,
        size_estimate: messageDetails.data.sizeEstimate,
        body: await extractEmailBody(messageDetails.data.payload)
      });
    }
  }

  return {
    messages,
    next_page_token: response.data.nextPageToken,
    result_size_estimate: response.data.resultSizeEstimate
  };
}

async function extractEmailBody(payload: any): Promise<string> {
  let body = '';
  
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
        if (part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
          break;
        }
      }
    }
  } else if (payload.body?.data) {
    body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  
  return body;
}

async function createDraft(oauth2Client: OAuth2Client, data: any) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const email = [
    `To: ${data.to}`,
    `Cc: ${data.cc || ''}`,
    `Bcc: ${data.bcc || ''}`,
    `Subject: ${data.subject}`,
    `Content-Type: text/html; charset=utf-8`,
    '',
    data.body
  ].join('\n');

  const encodedEmail = Buffer.from(email).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: encodedEmail
      }
    }
  });

  return {
    draft_id: response.data.id,
    message: response.data.message,
    created: true,
    created_at: new Date().toISOString()
  };
}

async function getLabels(oauth2Client: OAuth2Client) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const response = await gmail.users.labels.list({
    userId: 'me'
  });

  return {
    labels: response.data.labels?.map(label => ({
      id: label.id,
      name: label.name,
      type: label.type,
      message_list_visibility: label.messageListVisibility,
      label_list_visibility: label.labelListVisibility,
      color: label.color,
      messages_total: label.messagesTotal,
      messages_unread: label.messagesUnread,
      threads_total: label.threadsTotal,
      threads_unread: label.threadsUnread
    })) || []
  };
}

async function createLabel(oauth2Client: OAuth2Client, data: any) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const response = await gmail.users.labels.create({
    userId: 'me',
    requestBody: {
      name: data.name,
      messageListVisibility: data.messageListVisibility || 'show',
      labelListVisibility: data.labelListVisibility || 'labelShow',
      color: data.color
    }
  });

  return {
    label_id: response.data.id,
    name: response.data.name,
    type: response.data.type,
    created: true,
    created_at: new Date().toISOString()
  };
}

async function getThreads(oauth2Client: OAuth2Client, params: any = {}) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const response = await gmail.users.threads.list({
    userId: 'me',
    q: params.query,
    labelIds: params.labelIds,
    maxResults: params.maxResults || 10,
    pageToken: params.pageToken,
    includeSpamTrash: params.includeSpamTrash || false
  });

  return {
    threads: response.data.threads?.map(thread => ({
      id: thread.id,
      snippet: thread.snippet,
      history_id: thread.historyId
    })) || [],
    next_page_token: response.data.nextPageToken,
    result_size_estimate: response.data.resultSizeEstimate
  };
}

async function modifyThread(oauth2Client: OAuth2Client, threadId: string, data: any) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const response = await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: {
      addLabelIds: data.addLabelIds || [],
      removeLabelIds: data.removeLabelIds || []
    }
  });

  return {
    thread_id: response.data.id,
    messages: response.data.messages?.length || 0,
    modified: true,
    modified_at: new Date().toISOString()
  };
}

async function getProfile(oauth2Client: OAuth2Client) {
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const response = await gmail.users.getProfile({
    userId: 'me'
  });

  return {
    email_address: response.data.emailAddress,
    messages_total: response.data.messagesTotal,
    threads_total: response.data.threadsTotal,
    history_id: response.data.historyId
  };
}

// Google Drive Functions
async function listFiles(oauth2Client: OAuth2Client, params: any = {}) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.files.list({
    q: params.query,
    orderBy: params.orderBy || 'modifiedTime desc',
    pageSize: params.pageSize || 10,
    pageToken: params.pageToken,
    fields: 'nextPageToken, files(id, name, parents, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink)',
    spaces: params.spaces || 'drive'
  });

  return {
    files: response.data.files?.map(file => ({
      id: file.id,
      name: file.name,
      parents: file.parents,
      mime_type: file.mimeType,
      size: file.size,
      created_time: file.createdTime,
      modified_time: file.modifiedTime,
      web_view_link: file.webViewLink,
      web_content_link: file.webContentLink,
      thumbnail_link: file.thumbnailLink
    })) || [],
    next_page_token: response.data.nextPageToken
  };
}

async function uploadFile(oauth2Client: OAuth2Client, data: any) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const fileMetadata = {
    name: data.name,
    parents: data.parents
  };

  const media = {
    mimeType: data.mimeType,
    body: data.content
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    media: media,
    fields: 'id, name, parents, mimeType, size, createdTime, webViewLink'
  });

  return {
    file_id: response.data.id,
    name: response.data.name,
    parents: response.data.parents,
    mime_type: response.data.mimeType,
    size: response.data.size,
    created_time: response.data.createdTime,
    web_view_link: response.data.webViewLink,
    uploaded: true,
    uploaded_at: new Date().toISOString()
  };
}

async function downloadFile(oauth2Client: OAuth2Client, fileId: string) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.files.get({
    fileId,
    alt: 'media'
  });

  return {
    file_id: fileId,
    content: response.data,
    downloaded: true,
    downloaded_at: new Date().toISOString()
  };
}

async function createFolder(oauth2Client: OAuth2Client, data: any) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const fileMetadata = {
    name: data.name,
    mimeType: 'application/vnd.google-apps.folder',
    parents: data.parents
  };

  const response = await drive.files.create({
    requestBody: fileMetadata,
    fields: 'id, name, parents, createdTime, webViewLink'
  });

  return {
    folder_id: response.data.id,
    name: response.data.name,
    parents: response.data.parents,
    created_time: response.data.createdTime,
    web_view_link: response.data.webViewLink,
    created: true,
    created_at: new Date().toISOString()
  };
}

async function shareFile(oauth2Client: OAuth2Client, fileId: string, data: any) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.permissions.create({
    fileId,
    requestBody: {
      role: data.role || 'reader',
      type: data.type || 'user',
      emailAddress: data.emailAddress,
      domain: data.domain,
      allowFileDiscovery: data.allowFileDiscovery || false
    },
    fields: 'id, role, type, emailAddress, domain, displayName'
  });

  return {
    permission_id: response.data.id,
    role: response.data.role,
    type: response.data.type,
    email_address: response.data.emailAddress,
    domain: response.data.domain,
    display_name: response.data.displayName,
    shared: true,
    shared_at: new Date().toISOString()
  };
}

async function deleteFile(oauth2Client: OAuth2Client, fileId: string) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  await drive.files.delete({ fileId });

  return {
    file_id: fileId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

async function copyFile(oauth2Client: OAuth2Client, fileId: string, data: any) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.files.copy({
    fileId,
    requestBody: {
      name: data.name,
      parents: data.parents
    },
    fields: 'id, name, parents, createdTime, webViewLink'
  });

  return {
    new_file_id: response.data.id,
    name: response.data.name,
    parents: response.data.parents,
    created_time: response.data.createdTime,
    web_view_link: response.data.webViewLink,
    copied: true,
    copied_at: new Date().toISOString()
  };
}

async function moveFile(oauth2Client: OAuth2Client, fileId: string, data: any) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  // Get current parents
  const file = await drive.files.get({
    fileId,
    fields: 'parents'
  });

  const previousParents = file.data.parents?.join(',') || '';

  const response = await drive.files.update({
    fileId,
    addParents: data.newParents,
    removeParents: previousParents,
    fields: 'id, parents'
  });

  return {
    file_id: response.data.id,
    new_parents: response.data.parents,
    moved: true,
    moved_at: new Date().toISOString()
  };
}

async function getFileMetadata(oauth2Client: OAuth2Client, fileId: string) {
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  const response = await drive.files.get({
    fileId,
    fields: '*'
  });

  return {
    id: response.data.id,
    name: response.data.name,
    parents: response.data.parents,
    mime_type: response.data.mimeType,
    size: response.data.size,
    created_time: response.data.createdTime,
    modified_time: response.data.modifiedTime,
    viewed_by_me: response.data.viewedByMe,
    viewed_by_me_time: response.data.viewedByMeTime,
    owners: response.data.owners,
    permissions: response.data.permissions,
    shared: response.data.shared,
    web_view_link: response.data.webViewLink,
    web_content_link: response.data.webContentLink,
    thumbnail_link: response.data.thumbnailLink,
    description: response.data.description,
    starred: response.data.starred,
    trashed: response.data.trashed,
    explicitly_trashed: response.data.explicitlyTrashed,
    folder_color_rgb: response.data.folderColorRgb
  };
}

// Google Calendar Functions
async function listEvents(oauth2Client: OAuth2Client, calendarId: string, params: any = {}) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.events.list({
    calendarId,
    timeMin: params.timeMin,
    timeMax: params.timeMax,
    maxResults: params.maxResults || 10,
    singleEvents: true,
    orderBy: 'startTime',
    q: params.q,
    pageToken: params.pageToken
  });

  return {
    events: response.data.items?.map(event => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      created: event.created,
      updated: event.updated,
      creator: event.creator,
      organizer: event.organizer,
      attendees: event.attendees,
      status: event.status,
      html_link: event.htmlLink,
      hangout_link: event.hangoutLink,
      recurrence: event.recurrence,
      reminders: event.reminders,
      attachments: event.attachments
    })) || [],
    next_page_token: response.data.nextPageToken,
    next_sync_token: response.data.nextSyncToken
  };
}

async function createEvent(oauth2Client: OAuth2Client, calendarId: string, data: any) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: data.summary,
      description: data.description,
      location: data.location,
      start: {
        dateTime: data.start.dateTime,
        timeZone: data.start.timeZone || 'UTC'
      },
      end: {
        dateTime: data.end.dateTime,
        timeZone: data.end.timeZone || 'UTC'
      },
      attendees: data.attendees,
      reminders: data.reminders,
      recurrence: data.recurrence,
      conferenceData: data.conferenceData,
      visibility: data.visibility || 'default',
      transparency: data.transparency || 'opaque'
    },
    conferenceDataVersion: data.conferenceData ? 1 : undefined,
    sendUpdates: data.sendUpdates || 'none'
  });

  return {
    event_id: response.data.id,
    summary: response.data.summary,
    start: response.data.start,
    end: response.data.end,
    html_link: response.data.htmlLink,
    hangout_link: response.data.hangoutLink,
    created: true,
    created_at: new Date().toISOString()
  };
}

async function updateEvent(oauth2Client: OAuth2Client, calendarId: string, eventId: string, data: any) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: {
      summary: data.summary,
      description: data.description,
      location: data.location,
      start: data.start ? {
        dateTime: data.start.dateTime,
        timeZone: data.start.timeZone || 'UTC'
      } : undefined,
      end: data.end ? {
        dateTime: data.end.dateTime,
        timeZone: data.end.timeZone || 'UTC'
      } : undefined,
      attendees: data.attendees,
      reminders: data.reminders,
      recurrence: data.recurrence,
      visibility: data.visibility,
      transparency: data.transparency
    },
    sendUpdates: data.sendUpdates || 'none'
  });

  return {
    event_id: response.data.id,
    summary: response.data.summary,
    updated: response.data.updated,
    updated_event: true,
    updated_at: new Date().toISOString()
  };
}

async function deleteEvent(oauth2Client: OAuth2Client, calendarId: string, eventId: string) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  await calendar.events.delete({
    calendarId,
    eventId,
    sendUpdates: 'none'
  });

  return {
    event_id: eventId,
    calendar_id: calendarId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

async function getCalendars(oauth2Client: OAuth2Client) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.calendarList.list({
    maxResults: 250
  });

  return {
    calendars: response.data.items?.map(cal => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      location: cal.location,
      time_zone: cal.timeZone,
      color_id: cal.colorId,
      background_color: cal.backgroundColor,
      foreground_color: cal.foregroundColor,
      hidden: cal.hidden,
      selected: cal.selected,
      access_role: cal.accessRole,
      default_reminders: cal.defaultReminders,
      notification_settings: cal.notificationSettings,
      primary: cal.primary,
      deleted: cal.deleted
    })) || []
  };
}

async function createCalendar(oauth2Client: OAuth2Client, data: any) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.calendars.insert({
    requestBody: {
      summary: data.summary,
      description: data.description,
      location: data.location,
      timeZone: data.timeZone || 'UTC'
    }
  });

  return {
    calendar_id: response.data.id,
    summary: response.data.summary,
    description: response.data.description,
    time_zone: response.data.timeZone,
    created: true,
    created_at: new Date().toISOString()
  };
}

async function getFreeBusy(oauth2Client: OAuth2Client, data: any) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: data.timeMin,
      timeMax: data.timeMax,
      timeZone: data.timeZone || 'UTC',
      items: data.items || [{ id: 'primary' }]
    }
  });

  return {
    time_min: response.data.timeMin,
    time_max: response.data.timeMax,
    calendars: response.data.calendars,
    groups: response.data.groups
  };
}

// Google Sheets Functions
async function createSpreadsheet(oauth2Client: OAuth2Client, data: any) {
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: data.title
      },
      sheets: data.sheets || [{
        properties: {
          title: 'Sheet1'
        }
      }]
    }
  });

  return {
    spreadsheet_id: response.data.spreadsheetId,
    spreadsheet_url: response.data.spreadsheetUrl,
    title: response.data.properties?.title,
    sheets: response.data.sheets?.map(sheet => ({
      sheet_id: sheet.properties?.sheetId,
      title: sheet.properties?.title,
      index: sheet.properties?.index
    })),
    created: true,
    created_at: new Date().toISOString()
  };
}

async function getSpreadsheet(oauth2Client: OAuth2Client, spreadsheetId: string) {
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: true
  });

  return {
    spreadsheet_id: response.data.spreadsheetId,
    properties: response.data.properties,
    sheets: response.data.sheets?.map(sheet => ({
      properties: sheet.properties,
      data: sheet.data?.map(gridData => ({
        start_row: gridData.startRow,
        start_column: gridData.startColumn,
        row_data: gridData.rowData?.map(row => ({
          values: row.values?.map(cell => ({
            formatted_value: cell.formattedValue,
            user_entered_value: cell.userEnteredValue,
            effective_value: cell.effectiveValue,
            effective_format: cell.effectiveFormat
          }))
        }))
      }))
    })),
    named_ranges: response.data.namedRanges,
    spreadsheet_url: response.data.spreadsheetUrl
  };
}

async function updateCells(oauth2Client: OAuth2Client, spreadsheetId: string, data: any) {
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const response = await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: data.range,
    valueInputOption: data.valueInputOption || 'USER_ENTERED',
    requestBody: {
      values: data.values
    }
  });

  return {
    spreadsheet_id: spreadsheetId,
    updated_range: response.data.updatedRange,
    updated_rows: response.data.updatedRows,
    updated_columns: response.data.updatedColumns,
    updated_cells: response.data.updatedCells,
    updated: true,
    updated_at: new Date().toISOString()
  };
}

async function appendRows(oauth2Client: OAuth2Client, spreadsheetId: string, data: any) {
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const response = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: data.range,
    valueInputOption: data.valueInputOption || 'USER_ENTERED',
    insertDataOption: data.insertDataOption || 'INSERT_ROWS',
    requestBody: {
      values: data.values
    }
  });

  return {
    spreadsheet_id: spreadsheetId,
    table_range: response.data.tableRange,
    updates: response.data.updates,
    appended: true,
    appended_at: new Date().toISOString()
  };
}

async function batchUpdate(oauth2Client: OAuth2Client, spreadsheetId: string, data: any) {
  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  const response = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: data.requests,
      includeSpreadsheetInResponse: data.includeSpreadsheetInResponse || false,
      responseRanges: data.responseRanges,
      responseIncludeGridData: data.responseIncludeGridData || false
    }
  });

  return {
    spreadsheet_id: response.data.spreadsheetId,
    replies: response.data.replies,
    updated_spreadsheet: response.data.updatedSpreadsheet,
    updated: true,
    updated_at: new Date().toISOString()
  };
}

// Google Docs Functions
async function createDocument(oauth2Client: OAuth2Client, data: any) {
  const docs = google.docs({ version: 'v1', auth: oauth2Client });

  const response = await docs.documents.create({
    requestBody: {
      title: data.title
    }
  });

  return {
    document_id: response.data.documentId,
    title: response.data.title,
    revision_id: response.data.revisionId,
    created: true,
    created_at: new Date().toISOString()
  };
}

async function getDocument(oauth2Client: OAuth2Client, documentId: string) {
  const docs = google.docs({ version: 'v1', auth: oauth2Client });

  const response = await docs.documents.get({
    documentId
  });

  return {
    document_id: response.data.documentId,
    title: response.data.title,
    body: response.data.body,
    headers: response.data.headers,
    footers: response.data.footers,
    document_style: response.data.documentStyle,
    named_styles: response.data.namedStyles,
    lists: response.data.lists,
    named_ranges: response.data.namedRanges,
    revision_id: response.data.revisionId,
    suggestions_view_mode: response.data.suggestionsViewMode
  };
}

async function batchUpdateDocument(oauth2Client: OAuth2Client, documentId: string, data: any) {
  const docs = google.docs({ version: 'v1', auth: oauth2Client });

  const response = await docs.documents.batchUpdate({
    documentId,
    requestBody: {
      requests: data.requests,
      writeControl: data.writeControl
    }
  });

  return {
    document_id: response.data.documentId,
    replies: response.data.replies,
    write_control: response.data.writeControl,
    updated: true,
    updated_at: new Date().toISOString()
  };
}

// Google Contacts Functions
async function getContacts(oauth2Client: OAuth2Client, params: any = {}) {
  const people = google.people({ version: 'v1', auth: oauth2Client });

  const response = await people.people.connections.list({
    resourceName: 'people/me',
    personFields: 'names,emailAddresses,phoneNumbers,addresses,photos,birthdays,organizations',
    pageSize: params.pageSize || 10,
    pageToken: params.pageToken,
    sortOrder: params.sortOrder || 'FIRST_NAME_ASCENDING'
  });

  return {
    contacts: response.data.connections?.map(person => ({
      resource_name: person.resourceName,
      etag: person.etag,
      names: person.names,
      email_addresses: person.emailAddresses,
      phone_numbers: person.phoneNumbers,
      addresses: person.addresses,
      photos: person.photos,
      birthdays: person.birthdays,
      organizations: person.organizations,
      metadata: person.metadata
    })) || [],
    next_page_token: response.data.nextPageToken,
    next_sync_token: response.data.nextSyncToken,
    total_people: response.data.totalPeople,
    total_items: response.data.totalItems
  };
}

async function createContact(oauth2Client: OAuth2Client, data: any) {
  const people = google.people({ version: 'v1', auth: oauth2Client });

  const response = await people.people.createContact({
    requestBody: {
      names: data.names,
      emailAddresses: data.emailAddresses,
      phoneNumbers: data.phoneNumbers,
      addresses: data.addresses,
      organizations: data.organizations,
      birthdays: data.birthdays
    }
  });

  return {
    resource_name: response.data.resourceName,
    etag: response.data.etag,
    names: response.data.names,
    email_addresses: response.data.emailAddresses,
    phone_numbers: response.data.phoneNumbers,
    created: true,
    created_at: new Date().toISOString()
  };
}

async function updateContact(oauth2Client: OAuth2Client, resourceName: string, data: any) {
  const people = google.people({ version: 'v1', auth: oauth2Client });

  const response = await people.people.updateContact({
    resourceName,
    updatePersonFields: data.updatePersonFields || 'names,emailAddresses,phoneNumbers',
    requestBody: {
      resourceName,
      etag: data.etag,
      names: data.names,
      emailAddresses: data.emailAddresses,
      phoneNumbers: data.phoneNumbers,
      addresses: data.addresses,
      organizations: data.organizations,
      birthdays: data.birthdays
    }
  });

  return {
    resource_name: response.data.resourceName,
    etag: response.data.etag,
    names: response.data.names,
    email_addresses: response.data.emailAddresses,
    phone_numbers: response.data.phoneNumbers,
    updated: true,
    updated_at: new Date().toISOString()
  };
}

async function deleteContact(oauth2Client: OAuth2Client, resourceName: string) {
  const people = google.people({ version: 'v1', auth: oauth2Client });

  await people.people.deleteContact({
    resourceName
  });

  return {
    resource_name: resourceName,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

async function searchContacts(oauth2Client: OAuth2Client, data: any) {
  const people = google.people({ version: 'v1', auth: oauth2Client });

  const response = await people.people.searchContacts({
    query: data.query,
    pageSize: data.pageSize || 10,
    readMask: data.readMask || 'names,emailAddresses,phoneNumbers'
  });

  return {
    results: response.data.results?.map(result => ({
      person: {
        resource_name: result.person?.resourceName,
        etag: result.person?.etag,
        names: result.person?.names,
        email_addresses: result.person?.emailAddresses,
        phone_numbers: result.person?.phoneNumbers,
        addresses: result.person?.addresses,
        photos: result.person?.photos,
        organizations: result.person?.organizations
      }
    })) || []
  };
}

export async function GET() {
  return NextResponse.json({
    service: 'Google Workspace Integration',
    status: 'operational',
    features: [
      'Gmail Management',
      'Google Drive File Operations',
      'Google Calendar Events',
      'Google Sheets Manipulation',
      'Google Docs Creation & Editing',
      'Google Contacts Management'
    ],
    endpoints: {
      gmail: ['send_email', 'get_emails', 'create_draft', 'manage_labels', 'thread_operations'],
      drive: ['file_operations', 'folder_management', 'sharing', 'permissions'],
      calendar: ['event_management', 'calendar_operations', 'freebusy_queries'],
      sheets: ['spreadsheet_operations', 'cell_updates', 'batch_operations'],
      docs: ['document_creation', 'content_manipulation', 'batch_updates'],
      contacts: ['contact_management', 'search_operations', 'bulk_operations']
    },
    oauth_scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/documents',
      'https://www.googleapis.com/auth/contacts'
    ],
    supported_operations: [
      'Email Automation',
      'File Synchronization',
      'Calendar Integration',
      'Document Collaboration',
      'Contact Management',
      'Data Import/Export',
      'Backup & Restore',
      'Workflow Automation'
    ]
  });
}