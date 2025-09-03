import { NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import sgClient from '@sendgrid/client';

// 📧 SENDGRID INTEGRATION - REAL EMAIL AUTOMATION
// Complete SendGrid API integration with transactional emails, marketing campaigns, and analytics

sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');
sgClient.setApiKey(process.env.SENDGRID_API_KEY || '');

interface SendGridAction {
  action: 'send_email' | 'send_bulk_email' | 'create_template' | 'update_template' | 'delete_template' | 'get_templates' | 'add_contact' | 'update_contact' | 'delete_contact' | 'get_contacts' | 'create_list' | 'update_list' | 'delete_list' | 'get_lists' | 'add_contact_to_list' | 'remove_contact_from_list' | 'create_campaign' | 'update_campaign' | 'send_campaign' | 'get_campaigns' | 'get_email_stats' | 'create_sender' | 'verify_sender' | 'get_senders' | 'create_webhook' | 'get_webhooks' | 'delete_webhook' | 'get_bounces' | 'delete_bounce' | 'get_blocks' | 'delete_block' | 'get_invalid_emails' | 'delete_invalid_email' | 'get_spam_reports' | 'delete_spam_report' | 'create_subuser' | 'get_subusers' | 'update_subuser';
  data?: any;
  template_id?: string;
  contact_id?: string;
  list_id?: string;
  campaign_id?: string;
  sender_id?: string;
  webhook_id?: string;
  email?: string;
  subuser_name?: string;
}

export async function POST(request: Request) {
  try {
    const body: SendGridAction = await request.json();
    const { action, data, template_id, contact_id, list_id, campaign_id, sender_id, webhook_id, email, subuser_name } = body;

    let result;

    switch (action) {
      case 'send_email':
        result = await sendEmail(data);
        break;
        
      case 'send_bulk_email':
        result = await sendBulkEmail(data);
        break;
        
      case 'create_template':
        result = await createTemplate(data);
        break;
        
      case 'update_template':
        result = await updateTemplate(template_id!, data);
        break;
        
      case 'delete_template':
        result = await deleteTemplate(template_id!);
        break;
        
      case 'get_templates':
        result = await getTemplates(data);
        break;
        
      case 'add_contact':
        result = await addContact(data);
        break;
        
      case 'update_contact':
        result = await updateContact(contact_id!, data);
        break;
        
      case 'delete_contact':
        result = await deleteContact(contact_id!);
        break;
        
      case 'get_contacts':
        result = await getContacts(data);
        break;
        
      case 'create_list':
        result = await createList(data);
        break;
        
      case 'update_list':
        result = await updateList(list_id!, data);
        break;
        
      case 'delete_list':
        result = await deleteList(list_id!);
        break;
        
      case 'get_lists':
        result = await getLists(data);
        break;
        
      case 'add_contact_to_list':
        result = await addContactToList(list_id!, data);
        break;
        
      case 'remove_contact_from_list':
        result = await removeContactFromList(list_id!, data);
        break;
        
      case 'create_campaign':
        result = await createCampaign(data);
        break;
        
      case 'update_campaign':
        result = await updateCampaign(campaign_id!, data);
        break;
        
      case 'send_campaign':
        result = await sendCampaign(campaign_id!);
        break;
        
      case 'get_campaigns':
        result = await getCampaigns(data);
        break;
        
      case 'get_email_stats':
        result = await getEmailStats(data);
        break;
        
      case 'create_sender':
        result = await createSender(data);
        break;
        
      case 'verify_sender':
        result = await verifySender(sender_id!);
        break;
        
      case 'get_senders':
        result = await getSenders();
        break;
        
      case 'create_webhook':
        result = await createWebhook(data);
        break;
        
      case 'get_webhooks':
        result = await getWebhooks();
        break;
        
      case 'delete_webhook':
        result = await deleteWebhook(webhook_id!);
        break;
        
      case 'get_bounces':
        result = await getBounces(data);
        break;
        
      case 'delete_bounce':
        result = await deleteBounce(email!);
        break;
        
      case 'get_blocks':
        result = await getBlocks(data);
        break;
        
      case 'delete_block':
        result = await deleteBlock(email!);
        break;
        
      case 'get_invalid_emails':
        result = await getInvalidEmails(data);
        break;
        
      case 'delete_invalid_email':
        result = await deleteInvalidEmail(email!);
        break;
        
      case 'get_spam_reports':
        result = await getSpamReports(data);
        break;
        
      case 'delete_spam_report':
        result = await deleteSpamReport(email!);
        break;
        
      case 'create_subuser':
        result = await createSubuser(data);
        break;
        
      case 'get_subusers':
        result = await getSubusers();
        break;
        
      case 'update_subuser':
        result = await updateSubuser(subuser_name!, data);
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
    console.error('SendGrid API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'SendGrid integration failed',
        code: error.code || 'SENDGRID_ERROR'
      },
      { status: 500 }
    );
  }
}

// Send single email with advanced features
async function sendEmail(data: any) {
  const msg = {
    to: data.to,
    from: {
      email: data.from_email || process.env.SENDGRID_FROM_EMAIL || '',
      name: data.from_name || 'Recoder Platform'
    },
    subject: data.subject,
    text: data.text,
    html: data.html,
    templateId: data.template_id,
    dynamicTemplateData: data.dynamic_template_data,
    personalizations: data.personalizations,
    attachments: data.attachments,
    categories: data.categories || [],
    customArgs: data.custom_args || {},
    sendAt: data.send_at,
    batchId: data.batch_id,
    asm: data.asm,
    trackingSettings: {
      clickTracking: { enable: data.click_tracking !== false },
      openTracking: { enable: data.open_tracking !== false },
      subscriptionTracking: { enable: data.subscription_tracking !== false },
      ganalytics: data.google_analytics
    },
    mailSettings: {
      sandboxMode: { enable: data.sandbox_mode || false },
      bypassListManagement: { enable: data.bypass_list_management || false },
      footer: data.footer,
      spamCheck: data.spam_check
    },
    replyTo: data.reply_to,
    headers: data.headers || {}
  };

  const result = await sgMail.send(msg);
  
  return {
    message_id: result[0].headers['x-message-id'],
    status: 'sent',
    to: data.to,
    from: msg.from.email,
    subject: data.subject,
    sent_at: new Date().toISOString()
  };
}

// Send bulk emails with personalization
async function sendBulkEmail(data: any) {
  const personalizations = data.personalizations.map((p: any) => ({
    to: Array.isArray(p.to) ? p.to : [p.to],
    cc: p.cc,
    bcc: p.bcc,
    subject: p.subject || data.subject,
    dynamicTemplateData: p.dynamic_template_data || {},
    customArgs: p.custom_args || {},
    sendAt: p.send_at
  }));

  const msg = {
    personalizations,
    from: {
      email: data.from_email || process.env.SENDGRID_FROM_EMAIL || '',
      name: data.from_name || 'Recoder Platform'
    },
    subject: data.subject,
    text: data.text,
    html: data.html,
    templateId: data.template_id,
    attachments: data.attachments,
    categories: data.categories || [],
    customArgs: data.custom_args || {},
    batchId: data.batch_id,
    asm: data.asm,
    trackingSettings: {
      clickTracking: { enable: data.click_tracking !== false },
      openTracking: { enable: data.open_tracking !== false },
      subscriptionTracking: { enable: data.subscription_tracking !== false },
      ganalytics: data.google_analytics
    }
  };

  const result = await sgMail.send(msg);
  
  return {
    message_ids: result.map((r: any) => r.headers['x-message-id']),
    status: 'sent',
    recipients: personalizations.length,
    sent_at: new Date().toISOString()
  };
}

// Create email template
async function createTemplate(data: any) {
  const [response] = await sgClient.request({
    method: 'POST',
    url: '/v3/templates',
    body: {
      name: data.name,
      generation: data.generation || 'dynamic'
    }
  });

  const template = response.body;

  // Create version for the template
  if (data.subject || data.html_content || data.plain_content) {
    const [versionResponse] = await sgClient.request({
      method: 'POST',
      url: `/v3/templates/${template.id}/versions`,
      body: {
        template_id: template.id,
        active: data.active !== false,
        name: data.version_name || `${data.name} Version 1`,
        subject: data.subject || '{{subject}}',
        html_content: data.html_content || '',
        plain_content: data.plain_content || '',
        generate_plain_content: data.generate_plain_content !== false,
        editor: data.editor || 'code'
      }
    });

    return {
      template_id: template.id,
      version_id: versionResponse.body.id,
      name: template.name,
      generation: template.generation,
      created_at: template.updated_at,
      active: versionResponse.body.active
    };
  }

  return {
    template_id: template.id,
    name: template.name,
    generation: template.generation,
    created_at: template.updated_at
  };
}

// Update email template
async function updateTemplate(templateId: string, data: any) {
  // Update template metadata
  const [response] = await sgClient.request({
    method: 'PATCH',
    url: `/v3/templates/${templateId}`,
    body: {
      name: data.name
    }
  });

  // Update active version if content provided
  if (data.subject || data.html_content || data.plain_content) {
    const [versionsResponse] = await sgClient.request({
      method: 'GET',
      url: `/v3/templates/${templateId}/versions`
    });

    const activeVersion = versionsResponse.body.versions.find((v: any) => v.active);
    
    if (activeVersion) {
      await sgClient.request({
        method: 'PATCH',
        url: `/v3/templates/${templateId}/versions/${activeVersion.id}`,
        body: {
          name: data.version_name || activeVersion.name,
          subject: data.subject || activeVersion.subject,
          html_content: data.html_content || activeVersion.html_content,
          plain_content: data.plain_content || activeVersion.plain_content,
          active: data.active !== false
        }
      });
    }
  }

  return {
    template_id: templateId,
    name: data.name,
    updated_at: new Date().toISOString()
  };
}

// Delete email template
async function deleteTemplate(templateId: string) {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/templates/${templateId}`
  });

  return {
    template_id: templateId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Get email templates
async function getTemplates(params: any = {}) {
  const queryParams = new URLSearchParams();
  if (params.generations) queryParams.append('generations', params.generations);
  if (params.page_size) queryParams.append('page_size', params.page_size.toString());
  if (params.page_token) queryParams.append('page_token', params.page_token);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/templates?${queryParams.toString()}`
  });

  const templates = response.body;

  return {
    templates: templates.result?.map((template: any) => ({
      id: template.id,
      name: template.name,
      generation: template.generation,
      updated_at: template.updated_at,
      versions: template.versions?.map((version: any) => ({
        id: version.id,
        name: version.name,
        subject: version.subject,
        active: version.active,
        updated_at: version.updated_at
      }))
    })) || [],
    metadata: templates.metadata
  };
}

// Add contact to marketing lists
async function addContact(data: any) {
  const [response] = await sgClient.request({
    method: 'PUT',
    url: '/v3/marketing/contacts',
    body: {
      contacts: [{
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        phone_number: data.phone_number,
        address_line_1: data.address_line_1,
        address_line_2: data.address_line_2,
        city: data.city,
        state_province_region: data.state_province_region,
        postal_code: data.postal_code,
        country: data.country,
        custom_fields: data.custom_fields || {}
      }],
      list_ids: data.list_ids || []
    }
  });

  return {
    contact_id: response.body.job_id,
    email: data.email,
    status: 'processing',
    created_at: new Date().toISOString()
  };
}

// Update contact
async function updateContact(contactId: string, data: any) {
  const [response] = await sgClient.request({
    method: 'PUT',
    url: '/v3/marketing/contacts',
    body: {
      contacts: [{
        id: contactId,
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        phone_number: data.phone_number,
        custom_fields: data.custom_fields || {}
      }],
      list_ids: data.list_ids || []
    }
  });

  return {
    contact_id: contactId,
    job_id: response.body.job_id,
    updated_at: new Date().toISOString()
  };
}

// Delete contact
async function deleteContact(contactId: string) {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/marketing/contacts?ids=${contactId}`
  });

  return {
    contact_id: contactId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Get contacts
async function getContacts(params: any = {}) {
  const queryParams = new URLSearchParams();
  if (params.page_size) queryParams.append('page_size', params.page_size.toString());
  if (params.page_token) queryParams.append('page_token', params.page_token);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/marketing/contacts?${queryParams.toString()}`
  });

  return response.body;
}

// Create marketing list
async function createList(data: any) {
  const [response] = await sgClient.request({
    method: 'POST',
    url: '/v3/marketing/lists',
    body: {
      name: data.name
    }
  });

  return {
    list_id: response.body.id,
    name: response.body.name,
    contact_count: response.body.contact_count,
    created_at: new Date().toISOString()
  };
}

// Update marketing list
async function updateList(listId: string, data: any) {
  const [response] = await sgClient.request({
    method: 'PATCH',
    url: `/v3/marketing/lists/${listId}`,
    body: {
      name: data.name
    }
  });

  return {
    list_id: listId,
    name: response.body.name,
    updated_at: new Date().toISOString()
  };
}

// Delete marketing list
async function deleteList(listId: string) {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/marketing/lists/${listId}`
  });

  return {
    list_id: listId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Get marketing lists
async function getLists(params: any = {}) {
  const queryParams = new URLSearchParams();
  if (params.page_size) queryParams.append('page_size', params.page_size.toString());
  if (params.page_token) queryParams.append('page_token', params.page_token);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/marketing/lists?${queryParams.toString()}`
  });

  return response.body;
}

// Add contact to list
async function addContactToList(listId: string, data: any) {
  await sgClient.request({
    method: 'PUT',
    url: `/v3/marketing/lists/${listId}/contacts`,
    body: {
      contact_ids: Array.isArray(data.contact_ids) ? data.contact_ids : [data.contact_id]
    }
  });

  return {
    list_id: listId,
    contacts_added: Array.isArray(data.contact_ids) ? data.contact_ids : [data.contact_id],
    added_at: new Date().toISOString()
  };
}

// Remove contact from list
async function removeContactFromList(listId: string, data: any) {
  const contactIds = Array.isArray(data.contact_ids) ? data.contact_ids : [data.contact_id];
  
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/marketing/lists/${listId}/contacts?contact_ids=${contactIds.join(',')}`
  });

  return {
    list_id: listId,
    contacts_removed: contactIds,
    removed_at: new Date().toISOString()
  };
}

// Create marketing campaign
async function createCampaign(data: any) {
  const [response] = await sgClient.request({
    method: 'POST',
    url: '/v3/marketing/singlesends',
    body: {
      name: data.name,
      categories: data.categories || [],
      send_to: {
        list_ids: data.list_ids || [],
        segment_ids: data.segment_ids || [],
        all: data.send_to_all || false
      },
      email_config: {
        subject: data.subject,
        html_content: data.html_content,
        plain_content: data.plain_content,
        generate_plain_content: data.generate_plain_content !== false,
        sender_id: data.sender_id,
        suppression_group_id: data.suppression_group_id,
        custom_unsubscribe_url: data.custom_unsubscribe_url,
        ip_pool: data.ip_pool
      }
    }
  });

  return {
    campaign_id: response.body.id,
    name: response.body.name,
    status: response.body.status,
    created_at: response.body.created_at
  };
}

// Update marketing campaign
async function updateCampaign(campaignId: string, data: any) {
  const [response] = await sgClient.request({
    method: 'PATCH',
    url: `/v3/marketing/singlesends/${campaignId}`,
    body: {
      name: data.name,
      categories: data.categories,
      send_to: data.send_to ? {
        list_ids: data.send_to.list_ids,
        segment_ids: data.send_to.segment_ids,
        all: data.send_to.all
      } : undefined,
      email_config: data.email_config ? {
        subject: data.email_config.subject,
        html_content: data.email_config.html_content,
        plain_content: data.email_config.plain_content,
        sender_id: data.email_config.sender_id
      } : undefined
    }
  });

  return {
    campaign_id: campaignId,
    name: response.body.name,
    status: response.body.status,
    updated_at: response.body.updated_at
  };
}

// Send marketing campaign
async function sendCampaign(campaignId: string) {
  const [response] = await sgClient.request({
    method: 'PUT',
    url: `/v3/marketing/singlesends/${campaignId}/schedule`,
    body: {
      send_at: 'now'
    }
  });

  return {
    campaign_id: campaignId,
    status: 'scheduled',
    scheduled_at: new Date().toISOString()
  };
}

// Get marketing campaigns
async function getCampaigns(params: any = {}) {
  const queryParams = new URLSearchParams();
  if (params.page_size) queryParams.append('page_size', params.page_size.toString());
  if (params.page_token) queryParams.append('page_token', params.page_token);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/marketing/singlesends?${queryParams.toString()}`
  });

  return response.body;
}

// Get email statistics
async function getEmailStats(params: any = {}) {
  const queryParams = new URLSearchParams();
  queryParams.append('start_date', params.start_date || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  queryParams.append('end_date', params.end_date || new Date().toISOString().split('T')[0]);
  if (params.aggregated_by) queryParams.append('aggregated_by', params.aggregated_by);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/stats?${queryParams.toString()}`
  });

  return response.body;
}

// Create verified sender
async function createSender(data: any) {
  const [response] = await sgClient.request({
    method: 'POST',
    url: '/v3/verified_senders',
    body: {
      nickname: data.nickname,
      from_email: data.from_email,
      from_name: data.from_name,
      reply_to: data.reply_to || data.from_email,
      reply_to_name: data.reply_to_name || data.from_name,
      address: data.address,
      address2: data.address2,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country
    }
  });

  return {
    sender_id: response.body.id,
    nickname: response.body.nickname,
    from_email: response.body.from_email,
    verification: response.body.verification,
    created_at: new Date().toISOString()
  };
}

// Verify sender
async function verifySender(senderId: string) {
  const [response] = await sgClient.request({
    method: 'POST',
    url: `/v3/verified_senders/${senderId}/resend`
  });

  return {
    sender_id: senderId,
    verification_requested: true,
    requested_at: new Date().toISOString()
  };
}

// Get verified senders
async function getSenders() {
  const [response] = await sgClient.request({
    method: 'GET',
    url: '/v3/verified_senders'
  });

  return {
    senders: response.body.results?.map((sender: any) => ({
      id: sender.id,
      nickname: sender.nickname,
      from_email: sender.from_email,
      from_name: sender.from_name,
      verified: sender.verification?.verified || false,
      created_at: sender.created_at,
      updated_at: sender.updated_at
    })) || []
  };
}

// Create webhook
async function createWebhook(data: any) {
  const [response] = await sgClient.request({
    method: 'POST',
    url: '/v3/user/webhooks/event/settings',
    body: {
      enabled: data.enabled !== false,
      url: data.url,
      group_resubscribe: data.group_resubscribe || false,
      delivered: data.delivered || false,
      group_unsubscribe: data.group_unsubscribe || false,
      spam_report: data.spam_report || false,
      bounce: data.bounce || false,
      deferred: data.deferred || false,
      unsubscribe: data.unsubscribe || false,
      processed: data.processed || false,
      open: data.open || false,
      click: data.click || false,
      dropped: data.dropped || false
    }
  });

  return {
    webhook_id: 'event_webhook',
    url: response.body.url,
    enabled: response.body.enabled,
    events: Object.keys(response.body).filter(key => 
      key !== 'enabled' && key !== 'url' && response.body[key] === true
    ),
    created_at: new Date().toISOString()
  };
}

// Get webhooks
async function getWebhooks() {
  const [response] = await sgClient.request({
    method: 'GET',
    url: '/v3/user/webhooks/event/settings'
  });

  return {
    webhook: {
      enabled: response.body.enabled,
      url: response.body.url,
      events: Object.keys(response.body).filter(key => 
        key !== 'enabled' && key !== 'url' && response.body[key] === true
      )
    }
  };
}

// Delete webhook
async function deleteWebhook(webhookId: string) {
  await sgClient.request({
    method: 'PATCH',
    url: '/v3/user/webhooks/event/settings',
    body: {
      enabled: false
    }
  });

  return {
    webhook_id: webhookId,
    deleted: true,
    deleted_at: new Date().toISOString()
  };
}

// Get bounces
async function getBounces(params: any = {}) {
  const queryParams = new URLSearchParams();
  if (params.start_time) queryParams.append('start_time', params.start_time);
  if (params.end_time) queryParams.append('end_time', params.end_time);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/suppression/bounces?${queryParams.toString()}`
  });

  return response.body;
}

// Delete bounce
async function deleteBounce(email: string) {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/suppression/bounces/${email}`
  });

  return {
    email: email,
    removed_from_bounces: true,
    removed_at: new Date().toISOString()
  };
}

// Get blocks
async function getBlocks(params: any = {}) {
  const queryParams = new URLSearchParams();
  if (params.start_time) queryParams.append('start_time', params.start_time);
  if (params.end_time) queryParams.append('end_time', params.end_time);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/suppression/blocks?${queryParams.toString()}`
  });

  return response.body;
}

// Delete block
async function deleteBlock(email: string) {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/suppression/blocks/${email}`
  });

  return {
    email: email,
    removed_from_blocks: true,
    removed_at: new Date().toISOString()
  };
}

// Get invalid emails
async function getInvalidEmails(params: any = {}) {
  const queryParams = new URLSearchParams();
  if (params.start_time) queryParams.append('start_time', params.start_time);
  if (params.end_time) queryParams.append('end_time', params.end_time);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/suppression/invalid_emails?${queryParams.toString()}`
  });

  return response.body;
}

// Delete invalid email
async function deleteInvalidEmail(email: string) {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/suppression/invalid_emails/${email}`
  });

  return {
    email: email,
    removed_from_invalid: true,
    removed_at: new Date().toISOString()
  };
}

// Get spam reports
async function getSpamReports(params: any = {}) {
  const queryParams = new URLSearchParams();
  if (params.start_time) queryParams.append('start_time', params.start_time);
  if (params.end_time) queryParams.append('end_time', params.end_time);

  const [response] = await sgClient.request({
    method: 'GET',
    url: `/v3/suppression/spam_reports?${queryParams.toString()}`
  });

  return response.body;
}

// Delete spam report
async function deleteSpamReport(email: string) {
  await sgClient.request({
    method: 'DELETE',
    url: `/v3/suppression/spam_reports/${email}`
  });

  return {
    email: email,
    removed_from_spam_reports: true,
    removed_at: new Date().toISOString()
  };
}

// Create subuser
async function createSubuser(data: any) {
  const [response] = await sgClient.request({
    method: 'POST',
    url: '/v3/subusers',
    body: {
      username: data.username,
      email: data.email,
      password: data.password,
      ips: data.ips || []
    }
  });

  return {
    subuser_id: response.body.user_id,
    username: response.body.username,
    email: response.body.email,
    created_at: new Date().toISOString()
  };
}

// Get subusers
async function getSubusers() {
  const [response] = await sgClient.request({
    method: 'GET',
    url: '/v3/subusers'
  });

  return {
    subusers: response.body.map((subuser: any) => ({
      id: subuser.id,
      username: subuser.username,
      email: subuser.email,
      disabled: subuser.disabled
    }))
  };
}

// Update subuser
async function updateSubuser(subuserName: string, data: any) {
  const [response] = await sgClient.request({
    method: 'PATCH',
    url: `/v3/subusers/${subuserName}`,
    body: {
      disabled: data.disabled
    }
  });

  return {
    username: subuserName,
    disabled: response.body.disabled,
    updated_at: new Date().toISOString()
  };
}

export async function GET() {
  return NextResponse.json({
    service: 'SendGrid Integration',
    status: 'operational',
    features: [
      'Transactional Emails',
      'Marketing Campaigns',
      'Email Templates',
      'Contact Management',
      'List Management',
      'Email Analytics',
      'Webhook Integration',
      'Sender Verification',
      'Suppression Management',
      'Subuser Management'
    ],
    endpoints: {
      email: ['send_single', 'send_bulk', 'templates', 'analytics'],
      marketing: ['contacts', 'lists', 'campaigns', 'segments'],
      senders: ['create', 'verify', 'manage'],
      webhooks: ['event_webhooks', 'inbound_parse'],
      suppressions: ['bounces', 'blocks', 'spam_reports', 'invalid_emails'],
      subusers: ['create', 'manage', 'monitor']
    },
    tracking_features: [
      'Open Tracking',
      'Click Tracking',
      'Subscription Tracking',
      'Google Analytics Integration',
      'Custom Arguments',
      'Categories and Tags'
    ],
    deliverability_tools: [
      'Reputation Monitoring',
      'IP Warm-up',
      'Domain Authentication',
      'Dedicated IP',
      'Inbox Placement Testing'
    ]
  });
}