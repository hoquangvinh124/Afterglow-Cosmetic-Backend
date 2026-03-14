const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const Order   = require('../models/Order');

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
        await Order.findByIdAndUpdate(order._id, {
            paymentStatus: paid ? 'Paid' : 'Failed',
            status:        paid ? 'Processing' : 'Pending',
        });

        console.log(`[MoMo IPN] Order ${order._id} payment ${paid ? 'SUCCESS' : 'FAILED'}`);

        // MoMo requires HTTP 204 on success acknowledgement
        return res.status(204).send();
    } catch (err) {
        console.error('[MoMo IPN] Error:', err.message);
        return res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
