const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

// The Resend API key is expected to be provided in the .env file.
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key');

// The sender email should ideally be configured via env, fallback to onboarding@resend.dev
const FROM_EMAIL = process.env.EMAIL_FROM || 'Afterglow Cosmetic <onboarding@resend.dev>';

class EmailService {
    /**
     * Send a welcome email to a newly registered user
     * @param {string} email - User's email
     * @param {string} name - User's name
     */
    async sendWelcomeEmail(email, name) {
        if (!process.env.RESEND_API_KEY) {
            console.warn('⚠️ RESEND_API_KEY is not set. Skipping welcome email.');
            return;
        }

        try {
            const templatePath = path.join(__dirname, '../templates/welcome.html');
            let htmlContent = fs.readFileSync(templatePath, 'utf8');
            htmlContent = htmlContent.replace(/{{name}}/g, name);

            const { data, error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: email, // If using free Resend tier without domain verification, this must be your verified email address.
                subject: 'Welcome to Afterglow Luxury Cosmetics!',
                html: htmlContent
            });

            if (error) {
                console.error('[EmailService] Error sending welcome email:', error);
            } else {
                console.log(`[EmailService] Welcome email sent successfully to ${email}. ID: ${data.id}`);
            }
        } catch (err) {
            console.error('[EmailService] Exception sending welcome email:', err);
        }
    }

    /**
     * Send an order confirmation email
     * @param {string} email - Customer's email
     * @param {Object} order - Order object containing details
     */
    async sendOrderConfirmation(email, order) {
        if (!process.env.RESEND_API_KEY) {
            console.warn('⚠️ RESEND_API_KEY is not set. Skipping order confirmation email.');
            return;
        }

        try {
            const templatePath = path.join(__dirname, '../templates/orderConfirmation.html');
            let htmlContent = fs.readFileSync(templatePath, 'utf8');

            // Generate order items HTML
            const itemsHtml = (order.items || []).map(item => `
                <tr>
                    <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: left;">Sản phẩm ID: ${item.productId || 'Unknown Item'}</td>
                    <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
                    <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: right; color: #003580; font-weight: 600;">$${item.priceAtPurchase || item.price || 0}</td>
                </tr>
            `).join('');

            htmlContent = htmlContent.replace(/{{orderId}}/g, order._id || 'Pending')
                                     .replace(/{{customerName}}/g, order.customerName || 'Guest')
                                     .replace(/{{paymentMethod}}/g, order.paymentMethod ? order.paymentMethod.toUpperCase() : 'Standard')
                                     .replace(/{{itemsHtml}}/g, itemsHtml)
                                     .replace(/{{totalAmount}}/g, order.totalAmount || 0);

            const { data, error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: email, // If using free Resend tier without domain verification, this must be your verified email address.
                subject: `Order Confirmation #${order._id} - Afterglow`,
                html: htmlContent
            });

            if (error) {
                console.error('[EmailService] Error sending order confirmation email:', error);
            } else {
                console.log(`[EmailService] Order confirmation email sent successfully to ${email}. ID: ${data.id}`);
            }
        } catch (err) {
            console.error('[EmailService] Exception sending order confirmation email:', err);
        }
    }
}

module.exports = new EmailService();
