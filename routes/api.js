const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const mongoose = require('mongoose');
const Product  = require('../models/Product');
const Order    = require('../models/Order');
const Customer = require('../models/Customer');

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

module.exports = router;

// ==========================================
// 📊 DASHBOARD STATS
// ==========================================
router.get('/dashboard/stats', async (req, res) => {
    try {
        const totalProducts = await Product.countDocuments();
        const totalOrders = await Order.countDocuments();
        const totalCustomers = await Customer.countDocuments();

        const pendingOrders = await Order.countDocuments({ status: 'Pending' });
        const outOfStock = await Product.countDocuments({ stock: 0 });

        // Calculate total revenue
        const revenueResult = await Order.aggregate([
            { $match: { status: { $ne: 'Cancelled' } } },
            { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        // Recent orders (last 5)
        const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(5);

        res.json({
            success: true,
            data: {
                totalProducts,
                totalOrders,
                totalCustomers,
                totalRevenue,
                pendingOrders,
                outOfStock,
                recentOrders
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching dashboard stats', error: error.message });
    }
});

// ==========================================
// 🛒 PRODUCT ROUTES
// ==========================================

// Get All Products
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find().sort({ createdAt: -1 });
        res.json({ success: true, count: products.length, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error fetching products', error: error.message });
    }
});

// Get Single Product
router.get('/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching product', error: error.message });
    }
});

// Create Product
router.post('/products', async (req, res) => {
    try {
        const newProduct = await Product.create(req.body);
        res.status(201).json({ success: true, data: newProduct });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating product', error: error.message });
    }
});

// Update Product
router.put('/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating product', error: error.message });
    }
});

// Delete Product
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

// Get All Orders
router.get('/orders', async (req, res) => {
    try {
        const orders = await Order.find().sort({ createdAt: -1 });
        res.json({ success: true, count: orders.length, data: orders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error fetching orders', error: error.message });
    }
});

// Create Order
router.post('/orders', async (req, res) => {
    try {
        const newOrder = await Order.create(req.body);
        res.status(201).json({ success: true, data: newOrder });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating order', error: error.message });
    }
});

// Update Order Status
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

// Delete Order
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

// Get All Customers
router.get('/customers', async (req, res) => {
    try {
        const customers = await Customer.find().sort({ createdAt: -1 });
        res.json({ success: true, count: customers.length, data: customers });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error fetching customers', error: error.message });
    }
});

// Create Customer
router.post('/customers', async (req, res) => {
    try {
        const newCustomer = await Customer.create(req.body);
        res.status(201).json({ success: true, data: newCustomer });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error creating customer', error: error.message });
    }
});

// Update Customer
router.put('/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.json({ success: true, data: customer });
    } catch (error) {
        res.status(400).json({ success: false, message: 'Error updating customer', error: error.message });
    }
});

// Delete Customer
router.delete('/customers/:id', async (req, res) => {
    try {
        const customer = await Customer.findByIdAndDelete(req.params.id);
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error deleting customer', error: error.message });
    }
});

module.exports = router;
