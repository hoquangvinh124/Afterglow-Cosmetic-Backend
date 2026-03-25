const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const Order   = require('../models/Order');
const vnpayService = require('../services/vnpayService');

const MOMO_SECRET_KEY = process.env.MOMO_SECRET_KEY || 'K951B6PE1waDMi640xX08PD3vg6EkVlz';

// ── POST /api/payment/momo/notify ──────────────────────────
// MoMo IPN (Instant Payment Notification) — called by MoMo server
router.post('/momo/notify', async (req, res) => {
    try {
        const {
            partnerCode, orderId, requestId, amount, orderInfo,
            orderType, transId, resultCode, message,
            payType, responseTime, extraData, signature,
        } = req.body;

        // 1. Verify signature from MoMo
        const rawSignature =
            `accessKey=${process.env.MOMO_ACCESS_KEY || 'F8BBA842ECF85'}` +
            `&amount=${amount}` +
            `&extraData=${extraData}` +
            `&message=${message}` +
            `&orderId=${orderId}` +
            `&orderInfo=${orderInfo}` +
            `&orderType=${orderType}` +
            `&partnerCode=${partnerCode}` +
            `&payType=${payType}` +
            `&requestId=${requestId}` +
            `&responseTime=${responseTime}` +
            `&resultCode=${resultCode}` +
            `&transId=${transId}`;

        const expectedSignature = crypto
            .createHmac('sha256', MOMO_SECRET_KEY)
            .update(rawSignature)
            .digest('hex');

        if (signature !== expectedSignature) {
            console.warn('[MoMo IPN] Invalid signature');
            return res.status(400).json({ success: false, message: 'Invalid signature' });
        }

        // 2. Find order by momoOrderId
        const order = await Order.findOne({ momoOrderId: orderId });
        if (!order) {
            console.warn('[MoMo IPN] Order not found for momoOrderId:', orderId);
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        // 3. resultCode === 0 means success
        const paid = resultCode === 0;
        const updatedOrder = await Order.findByIdAndUpdate(order._id, {
            paymentStatus: paid ? 'Paid' : 'Failed',
            status:        paid ? 'Processing' : 'Pending',
        }, { new: true });

        console.log(`[MoMo IPN] Order ${order._id} payment ${paid ? 'SUCCESS' : 'FAILED'}`);

        if (paid) {
            const emailService = require('../services/emailService');
            emailService.sendOrderConfirmation(updatedOrder.email || updatedOrder.customerEmail || 'guest@afterglow.com', updatedOrder);
        }

        // MoMo requires HTTP 204 on success acknowledgement
        return res.status(204).send();
    } catch (err) {
        console.error('[MoMo IPN] Error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

// ── GET /api/payment/vnpay/return ──────────────────────────
// VNPAY Return URL — called by browser after payment completion
router.get('/vnpay/return', async (req, res) => {
    try {
        const vnp_Params = req.query;
        const isValid = vnpayService.verifyResponse({ ...vnp_Params });

        const orderId = vnp_Params['vnp_TxnRef'];
        const responseCode = vnp_Params['vnp_ResponseCode'];

        const frontendUrl = (process.env.FRONTEND_URL || 'https://afterglow-cosmetic.vercel.app').replace(/\/$/, '');
        
        if (isValid) {
            if (responseCode === '00') {
                // Success
                const order = await Order.findById(orderId);
                if (order && order.paymentStatus === 'Pending') {
                    const updatedOrder = await Order.findByIdAndUpdate(orderId, {
                        paymentStatus: 'Paid',
                        status: 'Processing'
                    }, { new: true });
                    
                    // Send email if first time success
                    try {
                        const emailService = require('../services/emailService');
                        const targetEmail = updatedOrder.email || updatedOrder.customerEmail || 'guest@afterglow.com';
                        emailService.sendOrderConfirmation(targetEmail, updatedOrder);
                    } catch (emailErr) {
                        console.error('[VNPAY Return] Email error:', emailErr.message);
                    }
                }
                return res.redirect(`${frontendUrl}/order-success?orderId=${orderId}&method=vnpay&status=success`);
            } else {
                // Failed
                await Order.findByIdAndUpdate(orderId, {
                    paymentStatus: 'Failed'
                });
                return res.redirect(`${frontendUrl}/order-success?orderId=${orderId}&method=vnpay&status=failed&code=${responseCode}`);
            }
        } else {
            console.warn('[VNPAY Return] Invalid signature');
            return res.redirect(`${frontendUrl}/order-success?orderId=${orderId}&method=vnpay&status=error&message=Invalid+Signature`);
        }
    } catch (err) {
        console.error('[VNPAY Return] Error:', err.message);
        res.status(500).send('Internal Server Error');
    }
});

// ── GET /api/payment/vnpay/ipn ─────────────────────────────
// VNPAY IPN (Instant Payment Notification) — called by VNPAY server
router.get('/vnpay/ipn', async (req, res) => {
    try {
        const vnp_Params = req.query;
        const isValid = vnpayService.verifyResponse({ ...vnp_Params });

        if (isValid) {
            const orderId = vnp_Params['vnp_TxnRef'];
            const responseCode = vnp_Params['vnp_ResponseCode'];
            const amountVnd = vnp_Params['vnp_Amount'] / 100;

            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(200).json({ RspCode: '01', Message: 'Order not found' });
            }

            // Verify amount (accounting for USD to VND conversion)
            const expectedVnd = Math.round(order.totalAmount * 25000); 
            if (Math.abs(expectedVnd - amountVnd) > 100) { // Allow small rounding diff
                return res.status(200).json({ RspCode: '04', Message: 'Invalid amount' });
            }

            if (order.paymentStatus !== 'Pending') {
                return res.status(200).json({ RspCode: '02', Message: 'Order already confirmed' });
            }

            const paid = responseCode === '00';
            const updatedOrder = await Order.findByIdAndUpdate(orderId, {
                paymentStatus: paid ? 'Paid' : 'Failed',
                status: paid ? 'Processing' : 'Pending'
            }, { new: true });

            if (paid) {
                try {
                    const emailService = require('../services/emailService');
                    const targetEmail = updatedOrder.email || updatedOrder.customerEmail || 'guest@afterglow.com';
                    emailService.sendOrderConfirmation(targetEmail, updatedOrder);
                } catch (emailErr) {
                    console.error('[VNPAY IPN] Email error:', emailErr.message);
                }
            }

            return res.status(200).json({ RspCode: '00', Message: 'Success' });
        } else {
            return res.status(200).json({ RspCode: '97', Message: 'Invalid signature' });
        }
    } catch (err) {
        console.error('[VNPAY IPN] Error:', err.message);
        return res.status(200).json({ RspCode: '99', Message: 'Unknown error' });
    }
});

module.exports = router;
