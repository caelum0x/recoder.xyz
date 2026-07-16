/**
 * Email Service Test
 * Run: node test-email.js your-email@example.com
 */

require('dotenv').config();

async function testEmail() {
  const testEmail = process.argv[2];

  if (!testEmail) {
    console.error('❌ Please provide an email address: node test-email.js your-email@example.com');
    process.exit(1);
  }

  console.log('🔧 Testing email service...\n');
  console.log('Configuration:');
  console.log('- RESEND_API_KEY:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('- EMAIL_FROM:', process.env.EMAIL_FROM || 'noreply@recoder.xyz');
  console.log('- Test email:', testEmail);
  console.log('');

  if (!process.env.RESEND_API_KEY) {
    console.error('❌ RESEND_API_KEY not found in environment');
    process.exit(1);
  }

  // Test Resend API
  try {
    console.log('📤 Sending test email via Resend...');

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `Recoder.xyz <${process.env.EMAIL_FROM || 'noreply@recoder.xyz'}>`,
        to: [testEmail],
        subject: 'Test Email from Recoder.xyz',
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
                .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>✅ Email Service Working!</h1>
                </div>
                <div class="content">
                  <h2>Test Successful</h2>
                  <p>Your Recoder.xyz email service is properly configured with Resend.</p>
                  <p><strong>Configuration Details:</strong></p>
                  <ul>
                    <li>Provider: Resend</li>
                    <li>From: ${process.env.EMAIL_FROM || 'noreply@recoder.xyz'}</li>
                    <li>Status: ✅ Active</li>
                  </ul>
                  <p>Users will now receive:</p>
                  <ul>
                    <li>Welcome emails on signup</li>
                    <li>Email verification links</li>
                    <li>Password reset emails</li>
                    <li>Temporary password emails</li>
                  </ul>
                </div>
              </div>
            </body>
          </html>
        `,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('❌ Resend API Error:');
      console.error(JSON.stringify(error, null, 2));

      if (error.message && error.message.includes('domain')) {
        console.log('\n⚠️  Domain not verified in Resend!');
        console.log('📝 Next steps:');
        console.log('1. Go to https://resend.com/domains');
        console.log('2. Add domain: recoder.xyz');
        console.log('3. Add DNS records provided by Resend');
        console.log('4. Verify domain');
        console.log('\n💡 For testing: Use your verified Resend email address');
      }

      process.exit(1);
    }

    const data = await response.json();
    console.log('✅ Email sent successfully!');
    console.log('📧 Message ID:', data.id);
    console.log(`\n✉️  Check your inbox at ${testEmail}`);
    console.log('\n🎉 Email service is working perfectly!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testEmail();
