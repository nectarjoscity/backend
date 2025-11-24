import nodemailer from 'nodemailer';

// Create reusable transporter using Gmail SMTP
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD, // Use App Password, not regular password
    },
  });
};

/**
 * Send contact form email to restaurant
 */
export const sendContactEmail = async ({ name, email, phone, subject, message }) => {
  // Check if Gmail credentials are configured
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[ContactService] Gmail credentials not configured. Skipping email notification.');
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const transporter = createTransporter();

    // Format the email content
    const emailContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; 
              line-height: 1.6; 
              color: #333; 
              margin: 0; 
              padding: 0; 
            }
            .container { 
              max-width: 600px; 
              margin: 0 auto; 
              padding: 20px; 
            }
            .header { 
              background: linear-gradient(135deg, #f59e0b, #d97706); 
              color: white; 
              padding: 20px; 
              border-radius: 10px 10px 0 0; 
            }
            .content { 
              background: #f9fafb; 
              padding: 30px; 
              border-radius: 0 0 10px 10px; 
            }
            .info-card { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              margin: 20px 0; 
            }
            .info-row { 
              padding: 10px 0; 
              border-bottom: 1px solid #e5e7eb; 
            }
            .info-row:last-child { 
              border-bottom: none; 
            }
            .info-label { 
              font-weight: 600; 
              color: #6b7280; 
              font-size: 14px; 
              margin-bottom: 4px; 
            }
            .info-value { 
              color: #111827; 
              font-size: 16px; 
            }
            .message-box { 
              background: white; 
              padding: 20px; 
              border-radius: 8px; 
              margin: 20px 0; 
              border-left: 4px solid #f59e0b; 
            }
            .message-text { 
              color: #111827; 
              font-size: 15px; 
              line-height: 1.8; 
              white-space: pre-wrap; 
            }
            .footer { 
              text-align: center; 
              margin-top: 30px; 
              color: #6b7280; 
              font-size: 12px; 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📧 New Contact Form Submission</h1>
            </div>
            <div class="content">
              <div class="info-card">
                <div class="info-row">
                  <div class="info-label">Name</div>
                  <div class="info-value">${name}</div>
                </div>
                <div class="info-row">
                  <div class="info-label">Email</div>
                  <div class="info-value"><a href="mailto:${email}">${email}</a></div>
                </div>
                ${phone ? `
                <div class="info-row">
                  <div class="info-label">Phone</div>
                  <div class="info-value"><a href="tel:${phone}">${phone}</a></div>
                </div>
                ` : ''}
                <div class="info-row">
                  <div class="info-label">Subject</div>
                  <div class="info-value">${subject}</div>
                </div>
              </div>
              
              <div class="message-box">
                <div class="info-label">Message</div>
                <div class="message-text">${message.replace(/\n/g, '<br>')}</div>
              </div>
              
              <div class="footer">
                <p>This message was sent from the NectarV Restaurant contact form.</p>
                <p>You can reply directly to this email to respond to ${name}.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;

    const mailOptions = {
      from: `"NectarV Restaurant Contact Form" <${process.env.GMAIL_USER}>`,
      to: 'nectarjoscity@gmail.com',
      replyTo: email, // Allow replying directly to the customer
      subject: `📧 Contact Form: ${subject}`,
      html: emailContent,
      text: `
New Contact Form Submission

Name: ${name}
Email: ${email}
${phone ? `Phone: ${phone}` : ''}
Subject: ${subject}

Message:
${message}

---
This message was sent from the NectarV Restaurant contact form.
You can reply directly to this email to respond to ${name}.
      `.trim()
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[ContactService] Contact email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[ContactService] Error sending contact email:', error);
    return { success: false, message: error.message };
  }
};

