/**
 * AWS Lambda Function: Email Forwarder
 *
 * This function forwards emails received by AWS SES to your Gmail.
 *
 * Setup Instructions:
 * 1. Create Lambda function in AWS Console
 * 2. Copy this code into the Lambda function
 * 3. Update FORWARD_TO_EMAIL with your Gmail address
 * 4. Add SES rule to trigger this Lambda when email arrives
 * 5. Grant Lambda permission to send emails via SES
 */

const AWS = require('aws-sdk');
const ses = new AWS.SES({ region: 'us-east-1' });

// 🔧 CONFIGURE THIS:
const FORWARD_TO_EMAIL = 'YOUR_GMAIL@gmail.com'; // ⚠️ Replace with your Gmail
const FROM_EMAIL = 'noreply@recoder.xyz';

exports.handler = async (event) => {
  console.log('Received email event:', JSON.stringify(event, null, 2));

  try {
    const sesNotification = event.Records[0].ses;
    const messageId = sesNotification.mail.messageId;
    const receipt = sesNotification.receipt;
    const originalRecipient = receipt.recipients[0];
    const originalSender = sesNotification.mail.commonHeaders.from[0];
    const subject = sesNotification.mail.commonHeaders.subject;

    // Get the original email from S3
    const s3 = new AWS.S3();
    const emailData = await s3.getObject({
      Bucket: process.env.S3_BUCKET_NAME || 'recoder-emails',
      Key: messageId
    }).promise();

    const emailContent = emailData.Body.toString('utf-8');

    // Forward the email
    const params = {
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [FORWARD_TO_EMAIL]
      },
      Message: {
        Subject: {
          Data: `[Forwarded from ${originalRecipient}] ${subject}`
        },
        Body: {
          Text: {
            Data: `
Originally sent to: ${originalRecipient}
From: ${originalSender}
Subject: ${subject}

---Original Message---

${emailContent}
            `
          }
        }
      }
    };

    const result = await ses.sendEmail(params).promise();
    console.log('Email forwarded successfully:', result.MessageId);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Email forwarded', messageId: result.MessageId })
    };

  } catch (error) {
    console.error('Error forwarding email:', error);
    throw error;
  }
};
