import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Helper function to generate order items HTML
const generateOrderItemsHTML = (orderItems) => {
  if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
    return '<p style="color: #6b7280; font-size: 14px;">No items in this order.</p>';
  }

  return orderItems.map(item => {
    const menuItem = item.menuItem || {};
    const imageUrl = menuItem.imageUrl || null;
    const emoji = menuItem.emoji || '🍽️';
    const name = menuItem.name || 'Unknown Item';
    const quantity = item.quantity || 1;
    const price = item.price || 0;
    const itemTotal = price * quantity;

    return `
      <div class="order-item" style="display: flex; gap: 12px; padding: 12px; background: #ffffff; border-radius: 8px; margin-bottom: 12px; border: 1px solid #e5e7eb;">
        ${imageUrl
        ? `<div style="flex-shrink: 0; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; background: #f3f4f6;">
              <img src="${imageUrl}" alt="${name}" style="width: 100%; height: 100%; object-fit: cover;" />
            </div>`
        : `<div style="flex-shrink: 0; width: 80px; height: 80px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; font-size: 32px;">
              ${emoji}
            </div>`
      }
        <div style="flex: 1; min-width: 0;">
          <div style="font-weight: 600; font-size: 15px; color: #111827; margin-bottom: 4px;">${name}</div>
          <div style="font-size: 13px; color: #6b7280; margin-bottom: 8px;">Quantity: ${quantity}</div>
          <div style="font-weight: 600; font-size: 15px; color: #111827;">₦${Number(itemTotal).toFixed(2)}</div>
        </div>
      </div>
    `;
  }).join('');
};

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

// Email templates
const emailTemplates = {
  preparing: (order) => ({
    subject: `🍳 Your order #${String(order._id).slice(-8).toUpperCase()} is being prepared!`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Order Being Prepared</title>
          <style>
            /* Reset styles */
            body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
            
            /* Base styles */
            body {
              margin: 0 !important;
              padding: 0 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333333;
              background-color: #f3f4f6;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            
            /* Container */
            .email-wrapper {
              width: 100%;
              background-color: #f3f4f6;
              padding: 20px 0;
            }
            
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            /* Header */
            .email-header {
              background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
              color: #ffffff;
              padding: 30px 20px;
              text-align: center;
            }
            
            .email-header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              line-height: 1.3;
            }
            
            /* Content */
            .email-content {
              padding: 30px 20px;
              background-color: #ffffff;
            }
            
            .email-content p {
              margin: 0 0 16px 0;
              font-size: 16px;
              line-height: 1.6;
              color: #374151;
            }
            
            /* Order Info Card */
            .order-card {
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 20px;
              margin: 24px 0;
            }
            
            .order-card h2 {
              margin: 0 0 16px 0;
              font-size: 18px;
              font-weight: 600;
              color: #111827;
            }
            
            .order-detail {
              margin: 12px 0;
              font-size: 15px;
              line-height: 1.5;
              color: #374151;
            }
            
            .order-detail strong {
              color: #111827;
              font-weight: 600;
              display: inline-block;
              min-width: 120px;
            }
            
            .status-badge {
              display: inline-block;
              background-color: #f59e0b;
              color: #ffffff;
              padding: 6px 14px;
              border-radius: 20px;
              font-size: 13px;
              font-weight: 600;
              margin-left: 4px;
            }
            
            /* Order Items Card */
            .items-card {
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 20px;
              margin: 24px 0;
            }
            
            .items-card h2 {
              margin: 0 0 16px 0;
              font-size: 18px;
              font-weight: 600;
              color: #111827;
            }
            
            /* Footer */
            .email-footer {
              text-align: center;
              padding: 24px 20px;
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
            }
            
            .email-footer p {
              margin: 4px 0;
              font-size: 13px;
              color: #6b7280;
            }
            
            /* Mobile Responsive */
            @media only screen and (max-width: 600px) {
              .email-wrapper {
                padding: 10px 0;
              }
              
              .email-container {
                border-radius: 0;
                margin: 0;
              }
              
              .email-header {
                padding: 24px 16px;
              }
              
              .email-header h1 {
                font-size: 20px;
              }
              
              .email-content {
                padding: 24px 16px;
              }
              
              .email-content p {
                font-size: 15px;
              }
              
              .order-card {
                padding: 16px;
                margin: 20px 0;
              }
              
              .order-card h2 {
                font-size: 16px;
              }
              
              .order-detail {
                font-size: 14px;
                margin: 10px 0;
              }
              
              .order-detail strong {
                display: block;
                margin-bottom: 4px;
                min-width: auto;
              }
              
              .status-badge {
                display: block;
                margin: 8px 0 0 0;
                text-align: center;
              }
              
              .items-card {
                padding: 16px;
                margin: 20px 0;
              }
              
              .items-card h2 {
                font-size: 16px;
              }
              
              .order-item {
                flex-direction: column !important;
                align-items: flex-start !important;
              }
              
              .order-item > div:first-child {
                width: 100% !important;
                height: 200px !important;
                margin-bottom: 12px;
              }
              
              .email-footer {
                padding: 20px 16px;
              }
              
              .email-footer p {
                font-size: 12px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="email-container">
              <div class="email-header">
                <h1>🍳 Your Order is Being Prepared!</h1>
              </div>
              <div class="email-content">
                <p>Hello ${order.customerName},</p>
                <p>Great news! We've received your order and our kitchen team has started preparing your delicious meal.</p>
                
                <div class="order-card">
                  <h2>Order Details</h2>
                  <div class="order-detail">
                    <strong>Order ID:</strong> #${String(order._id).slice(-8).toUpperCase()}
                  </div>
                  <div class="order-detail">
                    <strong>Status:</strong> <span class="status-badge">Preparing</span>
                  </div>
                  ${order.table ? `<div class="order-detail"><strong>Table:</strong> ${order.table}</div>` : ''}
                  <div class="order-detail">
                    <strong>Total Amount:</strong> ₦${Number(order.totalAmount).toFixed(2)}
                  </div>
                  <div class="order-detail">
                    <strong>Payment Method:</strong> ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
                  </div>
                </div>

                <div class="items-card">
                  <h2>Order Items</h2>
                  ${generateOrderItemsHTML(order.orderItems)}
                </div>

                <p>We'll send you another email when your order is ready! 🎉</p>
              </div>
              <div class="email-footer">
                <p>Thank you for choosing NectarV!</p>
                <p>If you have any questions, please contact us.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Your Order is Being Prepared!
      
      Hello ${order.customerName},
      
      Great news! We've received your order and our kitchen team has started preparing your delicious meal.
      
      Order Details:
      - Order ID: #${String(order._id).slice(-8).toUpperCase()}
      - Status: Preparing
      ${order.table ? `- Table: ${order.table}` : ''}
      - Total Amount: ₦${Number(order.totalAmount).toFixed(2)}
      - Payment Method: ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
      
      We'll send you another email when your order is ready!
      
      Thank you for choosing NectarV!
    `,
  }),

  onTheWay: (order) => ({
    subject: `🚚 Your order #${String(order._id).slice(-8).toUpperCase()} is on its way!`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Order On The Way</title>
          <style>
            /* Reset styles */
            body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
            
            /* Base styles */
            body {
              margin: 0 !important;
              padding: 0 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333333;
              background-color: #f3f4f6;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            
            /* Container */
            .email-wrapper {
              width: 100%;
              background-color: #f3f4f6;
              padding: 20px 0;
            }
            
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            /* Header */
            .email-header {
              background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
              color: #ffffff;
              padding: 30px 20px;
              text-align: center;
            }
            
            .email-header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              line-height: 1.3;
            }
            
            /* Content */
            .email-content {
              padding: 30px 20px;
              background-color: #ffffff;
            }
            
            .email-content p {
              margin: 0 0 16px 0;
              font-size: 16px;
              line-height: 1.6;
              color: #374151;
            }
            
            .highlight-message {
              background-color: #ede9fe;
              border-left: 4px solid #8b5cf6;
              padding: 16px;
              margin: 20px 0;
              border-radius: 6px;
            }
            
            .highlight-message p {
              margin: 0;
              font-weight: 600;
              color: #5b21b6;
              font-size: 16px;
            }
            
            /* Order Info Card */
            .order-card {
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 20px;
              margin: 24px 0;
            }
            
            .order-card h2 {
              margin: 0 0 16px 0;
              font-size: 18px;
              font-weight: 600;
              color: #111827;
            }
            
            .order-detail {
              margin: 12px 0;
              font-size: 15px;
              line-height: 1.5;
              color: #374151;
            }
            
            .order-detail strong {
              color: #111827;
              font-weight: 600;
              display: inline-block;
              min-width: 120px;
            }
            
            .status-badge {
              display: inline-block;
              background-color: #8b5cf6;
              color: #ffffff;
              padding: 6px 14px;
              border-radius: 20px;
              font-size: 13px;
              font-weight: 600;
              margin-left: 4px;
            }
            
            /* Footer */
            .email-footer {
              text-align: center;
              padding: 24px 20px;
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
            }
            
            .email-footer p {
              margin: 4px 0;
              font-size: 13px;
              color: #6b7280;
            }
            
            /* Mobile Responsive */
            @media only screen and (max-width: 600px) {
              .email-wrapper {
                padding: 10px 0;
              }
              
              .email-container {
                border-radius: 0;
                margin: 0;
              }
              
              .email-header {
                padding: 24px 16px;
              }
              
              .email-header h1 {
                font-size: 20px;
              }
              
              .email-content {
                padding: 24px 16px;
              }
              
              .email-content p {
                font-size: 15px;
              }
              
              .highlight-message {
                padding: 14px;
                margin: 16px 0;
              }
              
              .highlight-message p {
                font-size: 15px;
              }
              
              .order-card {
                padding: 16px;
                margin: 20px 0;
              }
              
              .order-card h2 {
                font-size: 16px;
              }
              
              .order-detail {
                font-size: 14px;
                margin: 10px 0;
              }
              
              .order-detail strong {
                display: block;
                margin-bottom: 4px;
                min-width: auto;
              }
              
              .status-badge {
                display: block;
                margin: 8px 0 0 0;
                text-align: center;
              }
              
              .email-footer {
                padding: 20px 16px;
              }
              
              .email-footer p {
                font-size: 12px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="email-container">
              <div class="email-header">
                <h1>🚚 Your Order is On The Way!</h1>
              </div>
              <div class="email-content">
                <p>Hello ${order.customerName},</p>
                <p>Great news! A dispatch rider has been assigned and your order is now on its way to you! 🛵</p>
                
                <div class="order-card">
                  <h2>Order Details</h2>
                  <div class="order-detail">
                    <strong>Order ID:</strong> #${String(order._id).slice(-8).toUpperCase()}
                  </div>
                  <div class="order-detail">
                    <strong>Status:</strong> <span class="status-badge">On The Way</span>
                  </div>
                  ${order.table ? `<div class="order-detail"><strong>Table:</strong> ${order.table}</div>` : ''}
                  <div class="order-detail">
                    <strong>Total Amount:</strong> ₦${Number(order.totalAmount).toFixed(2)}
                  </div>
                  <div class="order-detail">
                    <strong>Payment Method:</strong> ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
                  </div>
                </div>

                <div class="items-card">
                  <h2>Order Items</h2>
                  ${generateOrderItemsHTML(order.orderItems)}
                </div>

                <div class="highlight-message">
                  <p>🚚 Your order is on its way! Our dispatch rider is bringing your delicious meal to you. Please ensure someone is available to receive the order.</p>
                </div>
                
                <p>We'll notify you once your order has been delivered. Thank you for choosing NectarV! 🍽️</p>
              </div>
              <div class="email-footer">
                <p>Thank you for choosing NectarV!</p>
                <p>If you have any questions, please contact us.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Your Order is On The Way!
      
      Hello ${order.customerName},
      
      Great news! A dispatch rider has been assigned and your order is now on its way to you!
      
      Order Details:
      - Order ID: #${String(order._id).slice(-8).toUpperCase()}
      - Status: On The Way
      ${order.table ? `- Table: ${order.table}` : ''}
      - Total Amount: ₦${Number(order.totalAmount).toFixed(2)}
      - Payment Method: ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
      
      🚚 Your order is on its way! Our dispatch rider is bringing your delicious meal to you. Please ensure someone is available to receive the order.
      
      We'll notify you once your order has been delivered. Thank you for choosing NectarV!
    `,
  }),

  ready: (order) => ({
    subject: `✅ Your order #${String(order._id).slice(-8).toUpperCase()} is ready!`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Order Ready</title>
          <style>
            /* Reset styles */
            body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
            
            /* Base styles */
            body {
              margin: 0 !important;
              padding: 0 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333333;
              background-color: #f3f4f6;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            
            /* Container */
            .email-wrapper {
              width: 100%;
              background-color: #f3f4f6;
              padding: 20px 0;
            }
            
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            /* Header */
            .email-header {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: #ffffff;
              padding: 30px 20px;
              text-align: center;
            }
            
            .email-header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              line-height: 1.3;
            }
            
            /* Content */
            .email-content {
              padding: 30px 20px;
              background-color: #ffffff;
            }
            
            .email-content p {
              margin: 0 0 16px 0;
              font-size: 16px;
              line-height: 1.6;
              color: #374151;
            }
            
            .highlight-message {
              background-color: #d1fae5;
              border-left: 4px solid #10b981;
              padding: 16px;
              margin: 20px 0;
              border-radius: 6px;
            }
            
            .highlight-message p {
              margin: 0;
              font-weight: 600;
              color: #065f46;
              font-size: 16px;
            }
            
            /* Order Info Card */
            .order-card {
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 20px;
              margin: 24px 0;
            }
            
            .order-card h2 {
              margin: 0 0 16px 0;
              font-size: 18px;
              font-weight: 600;
              color: #111827;
            }
            
            .order-detail {
              margin: 12px 0;
              font-size: 15px;
              line-height: 1.5;
              color: #374151;
            }
            
            .order-detail strong {
              color: #111827;
              font-weight: 600;
              display: inline-block;
              min-width: 120px;
            }
            
            .status-badge {
              display: inline-block;
              background-color: #10b981;
              color: #ffffff;
              padding: 6px 14px;
              border-radius: 20px;
              font-size: 13px;
              font-weight: 600;
              margin-left: 4px;
            }
            
            /* Order Items Card */
            .items-card {
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 20px;
              margin: 24px 0;
            }
            
            .items-card h2 {
              margin: 0 0 16px 0;
              font-size: 18px;
              font-weight: 600;
              color: #111827;
            }
            
            /* Footer */
            .email-footer {
              text-align: center;
              padding: 24px 20px;
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
            }
            
            .email-footer p {
              margin: 4px 0;
              font-size: 13px;
              color: #6b7280;
            }
            
            /* Mobile Responsive */
            @media only screen and (max-width: 600px) {
              .email-wrapper {
                padding: 10px 0;
              }
              
              .email-container {
                border-radius: 0;
                margin: 0;
              }
              
              .email-header {
                padding: 24px 16px;
              }
              
              .email-header h1 {
                font-size: 20px;
              }
              
              .email-content {
                padding: 24px 16px;
              }
              
              .email-content p {
                font-size: 15px;
              }
              
              .highlight-message {
                padding: 14px;
                margin: 16px 0;
              }
              
              .highlight-message p {
                font-size: 15px;
              }
              
              .order-card {
                padding: 16px;
                margin: 20px 0;
              }
              
              .order-card h2 {
                font-size: 16px;
              }
              
              .order-detail {
                font-size: 14px;
                margin: 10px 0;
              }
              
              .order-detail strong {
                display: block;
                margin-bottom: 4px;
                min-width: auto;
              }
              
              .status-badge {
                display: block;
                margin: 8px 0 0 0;
                text-align: center;
              }
              
              .items-card {
                padding: 16px;
                margin: 20px 0;
              }
              
              .items-card h2 {
                font-size: 16px;
              }
              
              .order-item {
                flex-direction: column !important;
                align-items: flex-start !important;
              }
              
              .order-item > div:first-child {
                width: 100% !important;
                height: 200px !important;
                margin-bottom: 12px;
              }
              
              .email-footer {
                padding: 20px 16px;
              }
              
              .email-footer p {
                font-size: 12px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="email-container">
              <div class="email-header">
                <h1>✅ Your Order is Ready!</h1>
              </div>
              <div class="email-content">
                <p>Hello ${order.customerName},</p>
                <p>Excellent news! Your order has been prepared and is now ready for ${order.table ? 'pickup at your table' : 'delivery'}!</p>
                
                <div class="order-card">
                  <h2>Order Details</h2>
                  <div class="order-detail">
                    <strong>Order ID:</strong> #${String(order._id).slice(-8).toUpperCase()}
                  </div>
                  <div class="order-detail">
                    <strong>Status:</strong> <span class="status-badge">Ready</span>
                  </div>
                  ${order.table ? `<div class="order-detail"><strong>Table:</strong> ${order.table}</div>` : ''}
                  <div class="order-detail">
                    <strong>Total Amount:</strong> ₦${Number(order.totalAmount).toFixed(2)}
                  </div>
                  <div class="order-detail">
                    <strong>Payment Method:</strong> ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
                  </div>
                </div>

                <div class="items-card">
                  <h2>Order Items</h2>
                  ${generateOrderItemsHTML(order.orderItems)}
                </div>

                <div class="highlight-message">
                  <p>📍 ${order.table
        ? 'Your meal is coming right away! Our server will bring it to your table in just a moment. 🚀'
        : 'Your order is ready! We are currently looking for a dispatch rider to deliver your order. You will receive another notification once your order is on its way. 🛵'
      }</p>
                </div>
                
                <p>${order.table ? 'Thank you for dining with us! We hope you enjoy your meal! 🍽️' : 'Thank you for your patience. We will notify you as soon as your order is dispatched! 🍽️'}</p>
              </div>
              <div class="email-footer">
                <p>Thank you for choosing NectarV!</p>
                <p>If you have any questions, please contact us.</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Your Order is Ready!
      
      Hello ${order.customerName},
      
      Excellent news! Your order has been prepared and is now ready for ${order.table ? 'pickup at your table' : 'delivery'}!
      
      Order Details:
      - Order ID: #${String(order._id).slice(-8).toUpperCase()}
      - Status: Ready
      ${order.table ? `- Table: ${order.table}` : ''}
      - Total Amount: ₦${Number(order.totalAmount).toFixed(2)}
      - Payment Method: ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
      
      ${order.table
        ? '📍 Your meal is coming right away! Our server will bring it to your table in just a moment. 🚀'
        : '📍 Your order is ready! We are currently looking for a dispatch rider to deliver your order. You will receive another notification once your order is on its way. 🛵'
      }
      
      Thank you for your patience. We hope you enjoy your meal!
      
      Thank you for choosing NectarV!
    `,
  }),

  completed: (order) => ({
    subject: `🎉 Order #${String(order._id).slice(-8).toUpperCase()} completed - Thank you!`,
    html: `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>Order Completed</title>
          <style>
            /* Reset styles */
            body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
            table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
            img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
            
            /* Base styles */
            body {
              margin: 0 !important;
              padding: 0 !important;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333333;
              background-color: #f3f4f6;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            
            /* Container */
            .email-wrapper {
              width: 100%;
              background-color: #f3f4f6;
              padding: 20px 0;
            }
            
            .email-container {
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            
            /* Header */
            .email-header {
              background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
              color: #ffffff;
              padding: 30px 20px;
              text-align: center;
            }
            
            .email-header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 700;
              line-height: 1.3;
            }
            
            /* Content */
            .email-content {
              padding: 30px 20px;
              background-color: #ffffff;
            }
            
            .email-content p {
              margin: 0 0 16px 0;
              font-size: 16px;
              line-height: 1.6;
              color: #374151;
            }
            
            /* Order Info Card */
            .order-card {
              background-color: #f9fafb;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 20px;
              margin: 24px 0;
            }
            
            .order-card h2 {
              margin: 0 0 16px 0;
              font-size: 18px;
              font-weight: 600;
              color: #111827;
            }
            
            .order-detail {
              margin: 12px 0;
              font-size: 15px;
              line-height: 1.5;
              color: #374151;
            }
            
            .order-detail strong {
              color: #111827;
              font-weight: 600;
              display: inline-block;
              min-width: 120px;
            }
            
            .status-badge {
              display: inline-block;
              background-color: #3b82f6;
              color: #ffffff;
              padding: 6px 14px;
              border-radius: 20px;
              font-size: 13px;
              font-weight: 600;
              margin-left: 4px;
            }
            
            /* Footer */
            .email-footer {
              text-align: center;
              padding: 24px 20px;
              background-color: #f9fafb;
              border-top: 1px solid #e5e7eb;
            }
            
            .email-footer p {
              margin: 4px 0;
              font-size: 13px;
              color: #6b7280;
            }
            
            /* Mobile Responsive */
            @media only screen and (max-width: 600px) {
              .email-wrapper {
                padding: 10px 0;
              }
              
              .email-container {
                border-radius: 0;
                margin: 0;
              }
              
              .email-header {
                padding: 24px 16px;
              }
              
              .email-header h1 {
                font-size: 20px;
              }
              
              .email-content {
                padding: 24px 16px;
              }
              
              .email-content p {
                font-size: 15px;
              }
              
              .order-card {
                padding: 16px;
                margin: 20px 0;
              }
              
              .order-card h2 {
                font-size: 16px;
              }
              
              .order-detail {
                font-size: 14px;
                margin: 10px 0;
              }
              
              .order-detail strong {
                display: block;
                margin-bottom: 4px;
                min-width: auto;
              }
              
              .status-badge {
                display: block;
                margin: 8px 0 0 0;
                text-align: center;
              }
              
              .items-card {
                padding: 16px;
                margin: 20px 0;
              }
              
              .items-card h2 {
                font-size: 16px;
              }
              
              .order-item {
                flex-direction: column !important;
                align-items: flex-start !important;
              }
              
              .order-item > div:first-child {
                width: 100% !important;
                height: 200px !important;
                margin-bottom: 12px;
              }
              
              .email-footer {
                padding: 20px 16px;
              }
              
              .email-footer p {
                font-size: 12px;
              }
            }
          </style>
        </head>
        <body>
          <div class="email-wrapper">
            <div class="email-container">
              <div class="email-header">
                <h1>🎉 Order Completed!</h1>
              </div>
              <div class="email-content">
                <p>Hello ${order.customerName},</p>
                <p>Thank you for your order! We hope you enjoyed your meal. 🍽️</p>
                
                <div class="order-card">
                  <h2>Order Summary</h2>
                  <div class="order-detail">
                    <strong>Order ID:</strong> #${String(order._id).slice(-8).toUpperCase()}
                  </div>
                  <div class="order-detail">
                    <strong>Status:</strong> <span class="status-badge">Completed</span>
                  </div>
                  ${order.table ? `<div class="order-detail"><strong>Table:</strong> ${order.table}</div>` : ''}
                  <div class="order-detail">
                    <strong>Total Amount:</strong> ₦${Number(order.totalAmount).toFixed(2)}
                  </div>
                  <div class="order-detail">
                    <strong>Payment Method:</strong> ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
                  </div>
                </div>

                <div class="items-card">
                  <h2>Order Items</h2>
                  ${generateOrderItemsHTML(order.orderItems)}
                </div>

                <p>We'd love to hear about your experience! Your feedback helps us serve you better.</p>
                
                <p>Thank you for choosing NectarV! We look forward to serving you again. 🙏</p>
              </div>
              <div class="email-footer">
                <p>Thank you for choosing NectarV!</p>
                <p>Visit us again soon!</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
      Order Completed - Thank you!
      
      Hello ${order.customerName},
      
      Thank you for your order! We hope you enjoyed your meal.
      
      Order Summary:
      - Order ID: #${String(order._id).slice(-8).toUpperCase()}
      - Status: Completed
      ${order.table ? `- Table: ${order.table}` : ''}
      - Total Amount: ₦${Number(order.totalAmount).toFixed(2)}
      - Payment Method: ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
      
      We'd love to hear about your experience! Your feedback helps us serve you better.
      
      Thank you for choosing NectarV! We look forward to serving you again.
    `,
  }),
};

/**
 * Send email notification for order status update
 * @param {Object} order - Order object with populated data
 * @param {String} status - New order status
 */
export const sendOrderStatusEmail = async (order, status) => {
  // Only send emails if customer email is provided
  if (!order.customerEmail) {
    console.log('[EmailService] No customer email provided, skipping email notification');
    return { success: false, message: 'No customer email provided' };
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(order.customerEmail)) {
    console.log('[EmailService] Invalid email format:', order.customerEmail);
    return { success: false, message: 'Invalid email format' };
  }

  // Check if Gmail credentials are configured
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[EmailService] Gmail credentials not configured. Skipping email notification.');
    return { success: false, message: 'Email service not configured' };
  }

  try {
    // Determine which email template to use based on status
    let template;
    if (status === 'preparing') {
      template = emailTemplates.preparing(order);
    } else if (status === 'ready') {
      template = emailTemplates.ready(order);
    } else if (status === 'on-the-way') {
      template = emailTemplates.onTheWay(order);
    } else if (status === 'completed') {
      template = emailTemplates.completed(order);
    } else {
      // Don't send email for other statuses
      return { success: false, message: 'No email template for this status' };
    }

    // Create transporter
    const transporter = createTransporter();

    // Send email
    const mailOptions = {
      from: `"NectarV Restaurant" <${process.env.GMAIL_USER}>`,
      to: order.customerEmail,
      subject: template.subject,
      text: template.text,
      html: template.html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[EmailService] Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Error sending email:', error);
    return { success: false, message: error.message };
  }
};

/**
 * Send order confirmation email when order is created
 */
export const sendOrderConfirmationEmail = async (order) => {
  if (!order.customerEmail) {
    return { success: false, message: 'No customer email provided' };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(order.customerEmail)) {
    return { success: false, message: 'Invalid email format' };
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.warn('[EmailService] Gmail credentials not configured. Skipping email notification.');
    return { success: false, message: 'Email service not configured' };
  }

  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"NectarV Restaurant" <${process.env.GMAIL_USER}>`,
      to: order.customerEmail,
      subject: `📦 Order Confirmation #${String(order._id).slice(-8).toUpperCase()}`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 20px; border-radius: 10px 10px 0 0; }
              .content { background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; }
              .order-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .items-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
              .order-item { display: flex; gap: 12px; padding: 12px; background: #f9fafb; border-radius: 8px; margin-bottom: 12px; }
              .order-item img { width: 80px; height: 80px; object-fit: cover; border-radius: 8px; }
              .order-item-emoji { width: 80px; height: 80px; border-radius: 8px; background: #f3f4f6; display: flex; align-items: center; justify-content: center; font-size: 32px; }
              .order-item-details { flex: 1; }
              .order-item-name { font-weight: 600; font-size: 15px; color: #111827; margin-bottom: 4px; }
              .order-item-quantity { font-size: 13px; color: #6b7280; margin-bottom: 8px; }
              .order-item-price { font-weight: 600; font-size: 15px; color: #111827; }
              .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 12px; }
              @media only screen and (max-width: 600px) {
                .container { padding: 10px; }
                .order-item { flex-direction: column; }
                .order-item img, .order-item-emoji { width: 100%; height: 200px; }
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>📦 Order Confirmed!</h1>
              </div>
              <div class="content">
                <p>Hello ${order.customerName},</p>
                <p>Thank you for your order! We've received it and will start preparing it shortly.</p>
                
                <div class="order-info">
                  <h2>Order Details</h2>
                  <p><strong>Order ID:</strong> #${String(order._id).slice(-8).toUpperCase()}</p>
                  <p><strong>Status:</strong> Pending</p>
                  ${order.table ? `<p><strong>Table:</strong> ${order.table}</p>` : ''}
                  <p><strong>Total Amount:</strong> ₦${Number(order.totalAmount).toFixed(2)}</p>
                  <p><strong>Payment Method:</strong> ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}</p>
                </div>

                <div class="items-card">
                  <h2>Order Items</h2>
                  ${generateOrderItemsHTML(order.orderItems)}
                </div>

                <p>We'll keep you updated on your order status via email!</p>
                
                <div class="footer">
                  <p>Thank you for choosing NectarV!</p>
                </div>
              </div>
            </div>
          </body>
        </html>
      `,
      text: `
        Order Confirmation
        
        Hello ${order.customerName},
        
        Thank you for your order! We've received it and will start preparing it shortly.
        
        Order Details:
        - Order ID: #${String(order._id).slice(-8).toUpperCase()}
        - Status: Pending
        ${order.table ? `- Table: ${order.table}` : ''}
        - Total Amount: ₦${Number(order.totalAmount).toFixed(2)}
        - Payment Method: ${order.paymentMethod.charAt(0).toUpperCase() + order.paymentMethod.slice(1)}
        
        We'll keep you updated on your order status via email!
        
        Thank you for choosing NectarV!
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[EmailService] Order confirmation email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Error sending confirmation email:', error);
    return { success: false, message: error.message };
  }
};

// Default template settings
const DEFAULT_TEMPLATE = {
  brandName: 'NECTARV',
  tagline: 'Premium Nigerian Cuisine',
  ctaText: 'ORDER NOW',
  ctaUrl: 'https://nectar.ng',
  primaryColor: '#10b981',
  headerColor: '#059669',
  footerColor: '#065f46',
  footerText: 'Thank you for choosing NectarV! 💚',
  footerSubtext: 'Delicious Nigerian meals, delivered fresh.',
  features: [
    { icon: '🚀', label: 'Fast Delivery' },
    { icon: '🍳', label: 'Fresh Meals' },
    { icon: '⭐', label: 'Premium Quality' },
  ],
};

// Send custom/promotional email to customers
export const sendCustomEmail = async ({ to, subject, message, customerName, template = {} }) => {
  try {
    const transporter = createTransporter();
    const t = { ...DEFAULT_TEMPLATE, ...template };

    // Generate features HTML
    const featuresHtml = t.features.map((f, i) => `
      <td width="33.33%" style="padding: 20px 10px; text-align: center;${i < t.features.length - 1 ? ' border-right: 1px solid rgba(255,255,255,0.2);' : ''}">
        <div style="font-size: 24px; margin-bottom: 4px;">${f.icon}</div>
        <div style="font-size: 12px; font-weight: 600; color: #ffffff; text-transform: uppercase; letter-spacing: 0.5px;">${f.label}</div>
      </td>
    `).join('');

    const mailOptions = {
      from: `"${t.brandName}" <${process.env.GMAIL_USER}>`,
      to: to,
      subject: subject,
      html: `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="X-UA-Compatible" content="IE=edge">
            <title>${subject}</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f3f4f6;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f3f4f6;">
              <tr>
                <td align="center" style="padding: 40px 20px;">
                  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);">
                    
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(135deg, ${t.headerColor} 0%, ${t.primaryColor} 50%, #34d399 100%); padding: 50px 40px; text-align: center;">
                        <div style="width: 70px; height: 70px; background-color: rgba(255,255,255,0.2); border-radius: 20px; margin: 0 auto 20px; line-height: 70px; font-size: 36px;">🍽️</div>
                        <h1 style="margin: 0; font-size: 32px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; text-transform: uppercase;">${t.brandName}</h1>
                        <p style="margin: 8px 0 0 0; font-size: 14px; color: rgba(255,255,255,0.85); font-weight: 500; letter-spacing: 2px; text-transform: uppercase;">${t.tagline}</p>
                      </td>
                    </tr>
                    
                    <!-- Subject Banner -->
                    <tr>
                      <td style="background-color: ${t.footerColor}; padding: 20px 40px; text-align: center;">
                        <h2 style="margin: 0; font-size: 22px; font-weight: 700; color: #ffffff;">${subject}</h2>
                      </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px;">
                        <p style="margin: 0 0 20px 0; font-size: 20px; font-weight: 600; color: #1f2937;">Hey ${customerName || 'Valued Customer'},</p>
                        <div style="background-color: #f0fdf4; border-left: 4px solid ${t.primaryColor}; border-radius: 0 12px 12px 0; padding: 24px; margin: 24px 0;">
                          <p style="margin: 0; font-size: 16px; line-height: 1.8; color: #374151; white-space: pre-wrap;">${message.replace(/\n/g, '<br>')}</p>
                        </div>
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-top: 32px;">
                          <tr>
                            <td align="center">
                              <a href="${t.ctaUrl}" style="display: inline-block; background: linear-gradient(135deg, ${t.headerColor} 0%, ${t.primaryColor} 100%); color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 16px 40px; border-radius: 50px; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);">${t.ctaText}</a>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Features Bar -->
                    <tr>
                      <td style="background-color: ${t.primaryColor}; padding: 0;">
                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                          <tr>${featuresHtml}</tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="background-color: ${t.footerColor}; padding: 32px 40px; text-align: center;">
                        <p style="margin: 0 0 12px 0; font-size: 16px; font-weight: 600; color: #ffffff;">${t.footerText}</p>
                        <p style="margin: 0 0 20px 0; font-size: 14px; color: rgba(255,255,255,0.8);">${t.footerSubtext}</p>
                        <p style="margin: 20px 0 0 0; font-size: 12px; color: rgba(255,255,255,0.6);">© ${new Date().getFullYear()} ${t.brandName}. All rights reserved.</p>
                      </td>
                    </tr>
                    
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
      text: `Hey ${customerName || 'Valued Customer'},\n\n${message}\n\n---\n\n${t.ctaText}: ${t.ctaUrl}\n\n${t.footerText}\n${t.footerSubtext}\n\n© ${new Date().getFullYear()} ${t.brandName}. All rights reserved.`,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[EmailService] Custom email sent to:', to, 'MessageId:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[EmailService] Error sending custom email:', error);
    return { success: false, message: error.message };
  }
};

// Send bulk email to multiple customers
export const sendBulkEmail = async ({ recipients, subject, message, template }) => {
  const results = [];

  for (const recipient of recipients) {
    const result = await sendCustomEmail({
      to: recipient.email,
      subject,
      message,
      customerName: recipient.name,
      template,
    });
    results.push({
      email: recipient.email,
      name: recipient.name,
      ...result,
    });

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;

  return {
    success: failureCount === 0,
    totalSent: successCount,
    totalFailed: failureCount,
    results,
  };
};
