import * as ContactService from '../services/contactService.js';

export const submitContactForm = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: name, email, subject, and message are required' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid email format' 
      });
    }

    // Send contact email
    const result = await ContactService.sendContactEmail({
      name,
      email,
      phone: phone || '',
      subject,
      message
    });

    if (result.success) {
      res.status(200).json({ 
        success: true, 
        message: 'Your message has been sent successfully. We\'ll get back to you soon!' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        message: result.message || 'Failed to send message. Please try again later.' 
      });
    }
  } catch (error) {
    console.error('Error submitting contact form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'An error occurred while processing your request. Please try again later.' 
    });
  }
};

