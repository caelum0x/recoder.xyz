import { NextResponse } from 'next/server';
import twilio from 'twilio';

// 📱 TWILIO INTEGRATION - REAL SMS/VOICE/VIDEO COMMUNICATION
// Complete Twilio API integration with SMS, voice calls, video, and messaging

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

interface TwilioAction {
  action: 'send_sms' | 'make_call' | 'send_whatsapp' | 'create_video_room' | 'send_email' | 'create_verification' | 'check_verification' | 'lookup_phone' | 'create_conference' | 'list_messages';
  data?: any;
}

export async function POST(request: Request) {
  try {
    const body: TwilioAction = await request.json();
    const { action, data } = body;

    let result;

    switch (action) {
      case 'send_sms':
        result = await sendSMS(data);
        break;
        
      case 'make_call':
        result = await makeCall(data);
        break;
        
      case 'send_whatsapp':
        result = await sendWhatsApp(data);
        break;
        
      case 'create_video_room':
        result = await createVideoRoom(data);
        break;
        
      case 'send_email':
        result = await sendEmail(data);
        break;
        
      case 'create_verification':
        result = await createVerification(data);
        break;
        
      case 'check_verification':
        result = await checkVerification(data);
        break;
        
      case 'lookup_phone':
        result = await lookupPhone(data);
        break;
        
      case 'create_conference':
        result = await createConference(data);
        break;
        
      case 'list_messages':
        result = await listMessages(data);
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
    console.error('Twilio API Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Twilio integration failed',
        code: error.code || 'TWILIO_ERROR'
      },
      { status: 500 }
    );
  }
}

// Send SMS with advanced features
async function sendSMS(data: any) {
  const message = await client.messages.create({
    body: data.message,
    from: data.from || process.env.TWILIO_PHONE_NUMBER,
    to: data.to,
    mediaUrl: data.media_url,
    statusCallback: data.status_callback,
    maxPrice: data.max_price,
    validityPeriod: data.validity_period,
    // forceDelivery: data.force_delivery,  // Deprecated
    // provideFeedback: data.provide_feedback,  // Deprecated
    // attemptLimit: data.attempt_limit,  // Not supported in current API
    shortenUrls: data.shorten_urls
  });

  return {
    message_sid: message.sid,
    status: message.status,
    direction: message.direction,
    from: message.from,
    to: message.to,
    date_created: message.dateCreated,
    price: message.price,
    price_unit: message.priceUnit,
    num_segments: message.numSegments
  };
}

// Make voice call with TwiML
async function makeCall(data: any) {
  const call = await client.calls.create({
    twiml: data.twiml || `<Response><Say>${data.message || 'Hello from Recoder'}</Say></Response>`,
    from: data.from || process.env.TWILIO_PHONE_NUMBER,
    to: data.to,
    url: data.url,
    method: data.method || 'POST',
    statusCallback: data.status_callback,
    statusCallbackEvent: data.status_callback_event,
    statusCallbackMethod: data.status_callback_method,
    timeout: data.timeout || 60,
    record: data.record || false,
    machineDetection: data.machine_detection,
    machineDetectionTimeout: data.machine_detection_timeout,
    recordingChannels: data.recording_channels,
    recordingStatusCallback: data.recording_status_callback
  });

  return {
    call_sid: call.sid,
    status: call.status,
    direction: call.direction,
    from: call.from,
    to: call.to,
    date_created: call.dateCreated,
    duration: call.duration,
    price: call.price,
    price_unit: call.priceUnit
  };
}

// Send WhatsApp message
async function sendWhatsApp(data: any) {
  const message = await client.messages.create({
    body: data.message,
    from: `whatsapp:${data.from || process.env.TWILIO_WHATSAPP_NUMBER}`,
    to: `whatsapp:${data.to}`,
    mediaUrl: data.media_url,
    statusCallback: data.status_callback,
    contentSid: data.content_sid,
    contentVariables: data.content_variables
  });

  return {
    message_sid: message.sid,
    status: message.status,
    from: message.from,
    to: message.to,
    date_created: message.dateCreated,
    price: message.price
  };
}

// Create video room for conferencing
async function createVideoRoom(data: any) {
  const room = await client.video.rooms.create({
    uniqueName: data.unique_name || `room-${Date.now()}`,
    type: data.type || 'group',
    recordParticipantsOnConnect: data.record_participants || false,
    statusCallback: data.status_callback,
    statusCallbackMethod: data.status_callback_method,
    maxParticipants: data.max_participants || 50,
    videoCodecs: data.video_codecs || ['VP8'],
    mediaRegion: data.media_region,
    recordingRules: data.recording_rules
  });

  return {
    room_sid: room.sid,
    unique_name: room.uniqueName,
    status: room.status,
    type: room.type,
    max_participants: room.maxParticipants,
    date_created: room.dateCreated,
    url: room.url
  };
}

// Send email via Twilio SendGrid
async function sendEmail(data: any) {
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const msg = {
    to: data.to,
    from: data.from || process.env.SENDGRID_FROM_EMAIL,
    subject: data.subject,
    text: data.text,
    html: data.html,
    templateId: data.template_id,
    dynamicTemplateData: data.dynamic_template_data,
    attachments: data.attachments,
    categories: data.categories,
    customArgs: data.custom_args,
    sendAt: data.send_at,
    batchId: data.batch_id,
    asm: data.asm,
    trackingSettings: data.tracking_settings,
    mailSettings: data.mail_settings,
    replyTo: data.reply_to
  };

  const response = await sgMail.send(msg);

  return {
    message_id: response[0].headers['x-message-id'],
    status_code: response[0].statusCode,
    headers: response[0].headers
  };
}

// Create verification for 2FA
async function createVerification(data: any) {
  const verification = await client.verify.v2.services(
    process.env.TWILIO_VERIFY_SERVICE_SID || 'default'
  ).verifications.create({
    to: data.to,
    channel: data.channel || 'sms',
    customFriendlyName: data.custom_friendly_name,
    customMessage: data.custom_message,
    sendDigits: data.send_digits,
    locale: data.locale,
    customCode: data.custom_code,
    amount: data.amount,
    payee: data.payee,
    rateLimits: data.rate_limits,
    channelConfiguration: data.channel_configuration
  });

  return {
    sid: verification.sid,
    service_sid: verification.serviceSid,
    account_sid: verification.accountSid,
    to: verification.to,
    channel: verification.channel,
    status: verification.status,
    valid: verification.valid,
    date_created: verification.dateCreated,
    date_updated: verification.dateUpdated
  };
}

// Check verification code
async function checkVerification(data: any) {
  const verificationCheck = await client.verify.v2.services(
    process.env.TWILIO_VERIFY_SERVICE_SID || 'default'
  ).verificationChecks.create({
    to: data.to,
    code: data.code,
    amount: data.amount,
    payee: data.payee
  });

  return {
    sid: verificationCheck.sid,
    service_sid: verificationCheck.serviceSid,
    account_sid: verificationCheck.accountSid,
    to: verificationCheck.to,
    channel: verificationCheck.channel,
    status: verificationCheck.status,
    valid: verificationCheck.valid,
    date_created: verificationCheck.dateCreated,
    date_updated: verificationCheck.dateUpdated
  };
}

// Lookup phone number information
async function lookupPhone(data: any) {
  const phoneNumber = await client.lookups.v1.phoneNumbers(data.phone_number).fetch({
    type: data.type || ['carrier', 'caller-name'],
    countryCode: data.country_code,
    addOns: data.add_ons,
    addOnsData: data.add_ons_data
  });

  return {
    phone_number: phoneNumber.phoneNumber,
    national_format: phoneNumber.nationalFormat,
    country_code: phoneNumber.countryCode,
    valid: (phoneNumber as any).valid,
    validation_errors: (phoneNumber as any).validationErrors,
    caller_name: phoneNumber.callerName,
    carrier: phoneNumber.carrier,
    add_ons: phoneNumber.addOns
  };
}

// Create conference call
async function createConference(data: any) {
  const conference = await (client.conferences as any).create({
    friendlyName: data.friendly_name || `Conference-${Date.now()}`,
    statusCallback: data.status_callback,
    statusCallbackMethod: data.status_callback_method,
    statusCallbackEvent: data.status_callback_event,
    recordingChannels: data.recording_channels,
    recordingStatusCallback: data.recording_status_callback,
    recordingStatusCallbackMethod: data.recording_status_callback_method,
    recordingStatusCallbackEvent: data.recording_status_callback_event
  });

  return {
    sid: conference.sid,
    account_sid: conference.accountSid,
    friendly_name: conference.friendlyName,
    status: conference.status,
    date_created: conference.dateCreated,
    date_updated: conference.dateUpdated,
    api_version: conference.apiVersion,
    uri: conference.uri
  };
}

// List messages with filtering
async function listMessages(data: any = {}) {
  const messages = await client.messages.list({
    to: data.to,
    from: data.from,
    dateSent: data.date_sent,
    dateSentBefore: data.date_sent_before,
    dateSentAfter: data.date_sent_after,
    limit: data.limit || 20,
    pageSize: data.page_size || 50
  });

  return {
    messages: messages.map(message => ({
      sid: message.sid,
      account_sid: message.accountSid,
      service_sid: (message as any).serviceSid,
      from: message.from,
      to: message.to,
      body: message.body,
      status: message.status,
      direction: message.direction,
      date_created: message.dateCreated,
      date_sent: message.dateSent,
      date_updated: message.dateUpdated,
      price: message.price,
      price_unit: message.priceUnit,
      num_segments: message.numSegments,
      num_media: message.numMedia,
      error_code: message.errorCode,
      error_message: message.errorMessage
    })),
    total_count: messages.length
  };
}

export async function GET() {
  return NextResponse.json({
    service: 'Twilio Integration',
    status: 'operational',
    features: [
      'SMS Messaging',
      'Voice Calls',
      'WhatsApp Business API',
      'Video Conferencing',
      'Email via SendGrid',
      'Phone Verification',
      'Phone Number Lookup',
      'Conference Calls',
      'Message History'
    ],
    endpoints: {
      messaging: ['send_sms', 'send_whatsapp', 'list_messages'],
      voice: ['make_call', 'create_conference'],
      video: ['create_video_room'],
      verify: ['create_verification', 'check_verification'],
      lookup: ['lookup_phone'],
      email: ['send_email']
    },
    supported_channels: [
      'SMS',
      'Voice',
      'WhatsApp',
      'Video',
      'Email',
      'Verify'
    ]
  });
}