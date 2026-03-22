const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const mongoose = require('mongoose');
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const Customer = require('../models/Customer');
const Review   = require('../models/Review');

// ─── MoMo Helper ────────────────────────────────────────────
const MOMO_PARTNER_CODE = process.env.MOMO_PARTNER_CODE || 'MOMO';
const MOMO_ACCESS_KEY   = process.env.MOMO_ACCESS_KEY   || 'F8BBA842ECF85';
const MOMO_SECRET_KEY   = process.env.MOMO_SECRET_KEY   || 'K951B6PE1waDMi640xX08PD3vg6EkVlz';
const MOMO_ENDPOINT     = 'https://test-payment.momo.vn/v2/gateway/api/create';

async function createMoMoPayment({ orderId, amount, orderInfo, returnUrl, notifyUrl }) {
    const requestId   = MOMO_PARTNER_CODE + Date.now();
    const requestType = 'captureWallet';
    const extraData   = '';
    const lang        = 'vi';

    // Signature string — keys alphabetically
    const rawSignature =
        `accessKey=${MOMO_ACCESS_KEY}` +
        `&amount=${amount}` +
        `&extraData=${extraData}` +
        `&ipnUrl=${notifyUrl}` +
        `&orderId=${orderId}` +
        `&orderInfo=${orderInfo}` +
        `&partnerCode=${MOMO_PARTNER_CODE}` +
        `&redirectUrl=${returnUrl}` +
        `&requestId=${requestId}` +
        `&requestType=${requestType}`;

    const signature = crypto
        .createHmac('sha256', MOMO_SECRET_KEY)
        .update(rawSignature)
        .digest('hex');

    const body = {
        partnerCode: MOMO_PARTNER_CODE,
        accessKey:   MOMO_ACCESS_KEY,
        requestId,
        amount:      String(amount),
        orderId,
        orderInfo,
        redirectUrl: returnUrl,
        ipnUrl:      notifyUrl,
        lang,
        extraData,
        requestType,
        signature,
    };

    const response = await fetch(MOMO_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
    });

    if (!response.ok) {
        throw new Error(`MoMo API error: ${response.status}`);
    }
    return await response.json(); // contains { payUrl, orderId, ... }
}

// ==========================================
// 📊 DASHBOARD STATS
// ==========================================
router.get('/dashboard/stats', async (req, res) => {
    try {
        const totalProducts  = await Product.countDocuments();
        const totalOrders    = await Order.countDocuments();
        const totalCustomers = await Customer.countDocuments();
        const pendingOrders  = await Order.countDocuments({ status: 'Pending' });
        const outOfStock     = await Product.countDocuments({ stock: 0 });

        const revenueResult = await Order.aggregate([
            { $match: { status: { $ne: 'Cancelled' } } },
            { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } },
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
        const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5);

        res.json({ success: true, data: { totalProducts, totalOrders, totalCustomers, totalRevenue, pendingOrders, outOfStock, recentOrders } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching dashboard stats', error: error.message });
    }
});

// ==========================================
// 🛒 PRODUCT ROUTES
// ==========================================
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, count: products.length, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error fetching products', error: error.message });
    }
});

router.get('/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching product', error: error.message });
    }
});

router.post('/products', async (req, res) => {
    try {
        const newProduct = await Product.create(req.body);
        res.status(201).json({ success: true, data: newProduct });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating product', error: error.message });
    }
});

router.put('/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating product', error: error.message });
    }
});

router.delete('/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting product', error: error.message });
    }
});

// ==========================================
// 📦 ORDER ROUTES
// ==========================================
router.get('/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error fetching orders', error: error.message });
    }
});

// POST /api/orders — create order, handle MoMo redirect
router.post('/orders', async (req, res) => {
    try {
        const { items, shippingAddress, billingAddress, paymentMethod, shippingMethod, discountCode, note } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ success: false, message: 'Order must contain at least one item' });
        }

        // Compute total from submitted prices (trusted because prices come from DB at checkout time)
        const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        const customerName = shippingAddress
            ? `${shippingAddress.firstName || ''} ${shippingAddress.lastName || ''}`.trim()
            : 'Guest';
        const email = shippingAddress?.email || billingAddress?.email || 'guest@afterglow.com';

        // Map items to DB schema — guard against non-ObjectId productId to prevent CastError
        const mappedItems = items.map(item => ({
            product:         mongoose.Types.ObjectId.isValid(item.productId) ? item.productId : null,
            productId:       item.productId,
            quantity:        item.quantity,
            priceAtPurchase: item.price,
        }));

        const newOrder = await Order.create({
            customerName,
            email,
            items:           mappedItems,
            totalAmount,
            paymentMethod:   paymentMethod || 'cod',
            shippingMethod:  shippingMethod || 'standard',
            shippingAddress: shippingAddress || {},
            billingAddress:  billingAddress  || shippingAddress || {},
            discountCode:    discountCode || null,
            note:            note || null,
        });

        // ── MoMo payment ────────────────────────────────────
        if (paymentMethod === 'momo') {
            try {
                const momoOrderId = `AFTERGLOW_${newOrder._id}`;
                const returnUrl   = `${process.env.FRONTEND_URL || 'http://localhost:4200'}/order-success?orderId=${newOrder._id}&method=momo`;
                const notifyUrl   = `${process.env.BACKEND_URL  || 'http://localhost:5000'}/api/payment/momo/notify`;

                const momoRes = await createMoMoPayment({
                    orderId:   momoOrderId,
                    amount:    Math.round(totalAmount),
                    orderInfo: `Afterglow thanh toán đơn hàng #${newOrder._id}`,
                    returnUrl,
                    notifyUrl,
                });

                // Save momoOrderId for IPN matching
                await Order.findByIdAndUpdate(newOrder._id, { momoOrderId });

                if (momoRes.payUrl) {
                    return res.status(201).json({
                        success: true,
                        data: { orderId: newOrder._id, momoPayUrl: momoRes.payUrl },
                    });
                } else {
                    // MoMo rejected — still return orderId but flag error
                    return res.status(201).json({
                        success: true,
                        data: { orderId: newOrder._id },
                        message: momoRes.message || 'MoMo payment initiation failed',
                    });
                }
            } catch (momoErr) {
                console.error('MoMo error:', momoErr.message);
                return res.status(201).json({
                    success: true,
                    data: { orderId: newOrder._id },
                    message: 'MoMo payment error. Please try another payment method.',
                });
            }
        }

        // ── COD / other methods ──────────────────────────────
        const emailService = require('../services/emailService');
        emailService.sendOrderConfirmation(email, newOrder);

        return res.status(201).json({
            success: true,
            data: { orderId: newOrder._id, totalAmount, status: newOrder.status },
        });

    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating order', error: error.message });
    }
});

router.put('/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, data: order });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating order status', error: error.message });
    }
});

router.delete('/orders/:id', async (req, res) => {
    try {
        const order = await Order.findByIdAndDelete(req.params.id);
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        res.json({ success: true, message: 'Order deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting order', error: error.message });
    }
});

// ==========================================
// 👥 CUSTOMER ROUTES
// ==========================================
router.get('/customers', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 });
        res.json({ success: true, count: customers.length, data: customers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error fetching customers', error: error.message });
    }
});

router.post('/customers', async (req, res) => {
    try {
        const newCustomer = await Customer.create(req.body);
        res.status(201).json({ success: true, data: newCustomer });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating customer', error: error.message });
    }
});

router.put('/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.json({ success: true, data: customer });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating customer', error: error.message });
    }
});

router.delete('/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndDelete(req.params.id);
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting customer', error: error.message });
    }
});

// ==========================================
// 📧 TEST EMAIL ROUTES
// ==========================================

const emailService = require('../services/emailService');

router.get('/test/welcome', async (req, res) => {
    try {
        const testEmail = process.env.TEST_EMAIL || 'hoquangvinh124@gmail.com';
        await emailService.sendWelcomeEmail(testEmail, 'Hồ Quang Vinh');
        res.json({ success: true, message: `Welcome email sent to ${testEmail}` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error sending welcome email', error: error.message });
    }
});

router.get('/test/order-confirmation-2', async (req, res) => {
    try {
        const testEmail = process.env.TEST_EMAIL || 'hoquangvinh124@gmail.com';
        const dummyOrder = {
            _id: 'TEST-' + Math.floor(Math.random() * 100000),
            customerName: 'Hồ Quang Vinh',
            paymentMethod: 'cod',
            totalAmount: 185.00,
            items: [
                { productId: 'Afterglow Velvet Lipstick', quantity: 2, priceAtPurchase: 35.00 },
                { productId: 'Luminous Silk Foundation', quantity: 1, priceAtPurchase: 115.00 }
            ]
        };
        await emailService.sendOrderConfirmation(testEmail, dummyOrder);
        res.json({ success: true, message: `Order confirmation email sent to ${testEmail}` });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error sending order confirmation', error: error.message });
    }
});

// ==========================================
// ⭐ REVIEW ROUTES
// ==========================================

router.get('/products/:id/reviews', async (req, res) => {
    try {
        const reviews = await Review.find({ product: req.params.id }).sort({ createdAt: -1 });
        const product = await Product.findById(req.params.id);
        const averageRating = product ? product.rating : 0;
        
        const mappedReviews = reviews.map(r => ({
            id: r._id,
            date: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString(),
            reviewerName: r.reviewerName,
            location: r.location,
            isVerified: r.isVerified,
            skinType: r.skinType,
            skinShade: r.skinShade,
            ageRange: r.ageRange,
            rating: r.rating,
            title: r.title,
            content: r.content,
            recommend: r.recommend,
            upvotes: r.upvotes,
            downvotes: r.downvotes,
            currentUserVote: null
        }));

        res.json({
            success: true,
            data: {
                reviews: mappedReviews,
                averageRating: averageRating,
                totalReviews: mappedReviews.length
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error fetching reviews', error: error.message });
    }
});

router.post('/products/:id/reviews', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

        const newReview = await Review.create({
            product: product._id,
            reviewerName: req.body.reviewerName || 'Afterglow Customer',
            location: req.body.location || '',
            isVerified: true,
            skinType: req.body.skinType || '',
            skinShade: req.body.skinShade || '',
            ageRange: req.body.ageRange || '',
            rating: req.body.rating,
            title: req.body.title,
            content: req.body.body || req.body.content,
            recommend: req.body.rating >= 4,
            upvotes: 0,
            downvotes: 0
        });

        // Update Product aggregate rating
        const allReviews = await Review.find({ product: product._id });
        const reviewSum = allReviews.reduce((sum, r) => sum + r.rating, 0);
        const newAverage = Number((reviewSum / allReviews.length).toFixed(1));

        product.rating = newAverage;
        product.reviewCount = allReviews.length;
        await product.save();

        const mappedReview = {
            id: newReview._id,
            date: newReview.createdAt.toISOString(),
            reviewerName: newReview.reviewerName,
            location: newReview.location,
            isVerified: newReview.isVerified,
            skinType: newReview.skinType,
            skinShade: newReview.skinShade,
            ageRange: newReview.ageRange,
            rating: newReview.rating,
            title: newReview.title,
            content: newReview.content,
            recommend: newReview.recommend,
            upvotes: newReview.upvotes,
            downvotes: newReview.downvotes,
            currentUserVote: null
        };

        res.status(201).json({ 
            success: true, 
            data: {
                review: mappedReview,
                averageRating: newAverage,
                totalReviews: allReviews.length
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating review', error: error.message });
    }
});

router.put('/products/:id/reviews/:reviewId/vote', async (req, res) => {
    try {
        const { value, previousVote } = req.body;
        const review = await Review.findById(req.params.reviewId);
        
        if (!review) return res.status(404).json({ success: false, message: 'Review not found' });

        // Reverse previous vote
        if (previousVote === 'up') review.upvotes = Math.max(0, review.upvotes - 1);
        if (previousVote === 'down') review.downvotes = Math.max(0, review.downvotes - 1);

        // Apply new vote
        if (value === 'up') review.upvotes += 1;
        if (value === 'down') review.downvotes += 1;

        await review.save();

        res.json({ 
            success: true, 
            data: {
                id: review._id,
                date: review.createdAt.toISOString(),
                reviewerName: review.reviewerName,
                location: review.location,
                isVerified: review.isVerified,
                skinType: review.skinType,
                skinShade: review.skinShade,
                ageRange: review.ageRange,
                rating: review.rating,
                title: review.title,
                content: review.content,
                recommend: review.recommend,
                upvotes: review.upvotes,
                downvotes: review.downvotes,
                currentUserVote: value
            }
        });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error voting on review', error: error.message });
    }
});

module.exports = router;
