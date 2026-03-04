const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

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
