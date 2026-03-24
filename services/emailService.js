const { Resend } = require('resend');
const Product = require('../models/Product');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const WELCOME_TEMPLATE_ALIAS = 'welcome';
const ORDER_TEMPLATE_ALIAS = 'order-confirmation-2';
const OTP_TEMPLATE_ALIAS = 'otp-verification';
const FRONTEND_URL = (process.env.FRONTEND_URL || '').replace(/\/$/, '');

const templateIdCache = new Map();

function getResendClient() {
    if (!RESEND_API_KEY) return null;
    return new Resend(RESEND_API_KEY);
}

function toAbsoluteImageUrl(imagePath) {
    if (!imagePath) return '';
    if (/^https?:\/\//i.test(imagePath)) return imagePath;
    if (!FRONTEND_URL) return imagePath;
    return imagePath.startsWith('/') ? `${FRONTEND_URL}${imagePath}` : `${FRONTEND_URL}/${imagePath}`;
}

async function buildOrderItemsHtml(order) {
    const rows = await Promise.all((order.items || []).map(async (item) => {
        const quantity = Number(item.quantity || 0);
        const price = Number(item.priceAtPurchase || item.price || 0);

        let productName = item.productId || 'Unknown Item';
        let imageUrl = '';

        // If populated product exists on the order item, prefer it first.
        if (item.product && typeof item.product === 'object') {
            productName = item.product.name || productName;
            imageUrl = toAbsoluteImageUrl(item.product.image || '');
        }

        // Otherwise resolve from DB using ObjectId ref or productId.
        if (!imageUrl) {
            const candidateId =
                (item.product && typeof item.product === 'string' ? item.product : null) ||
                item.productId ||
                null;

            if (candidateId) {
                try {
                    const product = await Product.findById(candidateId).select('name image').lean();
                    if (product) {
                        productName = product.name || productName;
                        imageUrl = toAbsoluteImageUrl(product.image || '');
                    }
                } catch {
                    // Ignore invalid ObjectId and keep fallback product text.
                }
            }
        }

        const productCell = imageUrl
            ? `<img src="${imageUrl}" alt="${productName}" width="56" height="56" style="width:56px;height:56px;object-fit:cover;border-radius:8px;vertical-align:middle;margin-right:10px;"/> ${productName}`
            : productName;

        return `
            <tr>
                <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: left;">${productCell}</td>
                <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center;">${quantity}</td>
                <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: right; color: #003580; font-weight: 600;">$${price}</td>
            </tr>
        `;
    }));

    return rows.join('');
}

async function resolveTemplateIdByAlias(alias) {
    if (!alias) return null;
    if (templateIdCache.has(alias)) return templateIdCache.get(alias);

    const resend = getResendClient();
    if (!resend) {
        console.error('[EmailService] RESEND_API_KEY is required.');
        return null;
    }

    try {
        const listResult = await resend.templates.list({ limit: 100 });
        const templates = listResult?.data?.data || [];
        const found = templates.find((t) => t?.alias === alias || t?.id === alias);

        if (!found) {
            console.error(`[EmailService] Resend template alias not found: ${alias}`);
            return null;
        }

        templateIdCache.set(alias, found.id);
        return found.id;
    } catch (err) {
        console.error('[EmailService] Failed to resolve template alias:', alias, err?.message || err);
        return null;
    }
}

class EmailService {
    /**
     * Send a welcome email to a newly registered user
     * @param {string} email - User's email
     * @param {string} name - User's name
     */
    async sendWelcomeEmail(email, name) {
        if (!RESEND_API_KEY) {
            console.warn('⚠️ RESEND_API_KEY is required. Skipping welcome email.');
            return;
        }

        try {
            const resend = getResendClient();
            const templateId = await resolveTemplateIdByAlias(WELCOME_TEMPLATE_ALIAS);
            if (!templateId) {
                console.error('[EmailService] Welcome email skipped because template alias could not be resolved.');
                return;
            }

            const { data, error } = await resend.emails.send({
                to: email,
                subject: 'Welcome to Afterglow Luxury Cosmetics!',
                template: {
                    id: templateId,
                    variables: {
                        name: name || ''
                    }
                }
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
        if (!RESEND_API_KEY) {
            console.warn('⚠️ RESEND_API_KEY is required. Skipping order confirmation email.');
            return;
        }

        try {
            const resend = getResendClient();
            const templateId = await resolveTemplateIdByAlias(ORDER_TEMPLATE_ALIAS);
            if (!templateId) {
                console.error('[EmailService] Order confirmation email skipped because template alias could not be resolved.');
                return;
            }

            const itemsHtml = await buildOrderItemsHtml(order);
            const itemsSummary = (order.items || [])
                .map((item) => `${item.productId || 'Unknown Item'} x${item.quantity || 0} - $${item.priceAtPurchase || item.price || 0}`)
                .join('\n');

            const { data, error } = await resend.emails.send({
                to: email,
                subject: `Order Confirmation #${order._id} - Afterglow`,
                template: {
                    id: templateId,
                    variables: {
                        orderId: String(order._id || ''),
                        customerName: order.customerName || '',
                        paymentMethod: order.paymentMethod ? String(order.paymentMethod).toUpperCase() : '',
                        totalAmount: Number(order.totalAmount || 0),
                        itemsHtml,
                        itemsSummary,
                        itemCount: Number((order.items || []).length)
                    }
                }
            });

            if (error) {
                console.error('[EmailService] Error sending order confirmation email:', error);
                if (String(error?.message || '').toLowerCase().includes('verify')) {
                    console.error('[EmailService] Resend likely blocked this recipient. On free tier, recipient usually must be verified.');
                }
            } else {
                console.log(`[EmailService] Order confirmation email sent successfully to ${email}. ID: ${data.id}`);
            }
        } catch (err) {
            console.error('[EmailService] Exception sending order confirmation email:', err);
        }
    }

    /**
     * Send OTP verification code email
     * @param {string} email - User's email
     * @param {string} name - User's name
     * @param {string} otp - 6-digit OTP code
     * @param {string} purpose - 'forgot-password' or 'change-password'
     */
    async sendOTPEmail(email, name, otp, purpose) {
        if (!RESEND_API_KEY) {
            console.warn('⚠️ RESEND_API_KEY is required. Skipping OTP email.');
            return;
        }

        try {
            const resend = getResendClient();
            const templateId = await resolveTemplateIdByAlias(OTP_TEMPLATE_ALIAS);
            if (!templateId) {
                console.error('[EmailService] OTP email skipped because template alias could not be resolved.');
                return;
            }

            const purposeText = purpose === 'forgot-password'
                ? 'reset your password'
                : 'verify your password change';

            const { data, error } = await resend.emails.send({
                to: email,
                subject: 'Your Afterglow Verification Code',
                template: {
                    id: templateId,
                    variables: {
                        name: name || '',
                        otp: otp,
                        purpose: purposeText,
                        expiresInMinutes: '10'
                    }
                }
            });

            if (error) {
                console.error('[EmailService] Error sending OTP email:', error);
                if (String(error?.message || '').toLowerCase().includes('verify')) {
                    console.error('[EmailService] Resend likely blocked this recipient. On free tier, recipient usually must be verified.');
                }
            } else {
                console.log(`[EmailService] OTP email sent successfully to ${email}. ID: ${data.id}`);
            }
        } catch (err) {
            console.error('[EmailService] Exception sending OTP email:', err);
        }
    }
}

module.exports = new EmailService();
