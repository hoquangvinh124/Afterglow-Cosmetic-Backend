const express = require('express');
const router = express.Router();
const Product = require('../models/Product');

// ==========================================
// 🤖 AGENT API ROUTES
// Optimized endpoints for Voice AI Agent
// ==========================================

// Get all products (lightweight: name, price, category, description)
router.get('/products', async (req, res) => {
    try {
        const products = await Product.find({ status: 'Active' })
            .select('name price originalPrice category description image isNewArrival isBestSeller')
            .sort({ createdAt: -1 })
            .lean();
        res.json({ success: true, count: products.length, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching products', error: error.message });
    }
});

// Search products with filters
router.get('/products/search', async (req, res) => {
    try {
        const { q, category, minPrice, maxPrice, limit } = req.query;
        const filter = { status: 'Active' };

        // Text search (name or description)
        if (q) {
            filter.$or = [
                { name: { $regex: q, $options: 'i' } },
                { description: { $regex: q, $options: 'i' } },
            ];
        }

        // Category filter
        if (category) {
            filter.category = { $regex: category, $options: 'i' };
        }

        // Price range filter
        if (minPrice || maxPrice) {
            filter.price = {};
            if (minPrice) filter.price.$gte = Number(minPrice);
            if (maxPrice) filter.price.$lte = Number(maxPrice);
        }

        const products = await Product.find(filter)
            .select('name price originalPrice category description image isNewArrival isBestSeller')
            .limit(Number(limit) || 10)
            .lean();

        res.json({ success: true, count: products.length, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error searching products', error: error.message });
    }
});

// Get best sellers
router.get('/products/best-sellers', async (req, res) => {
    try {
        const products = await Product.find({ isBestSeller: true, status: 'Active' })
            .select('name price originalPrice category description image')
            .lean();
        res.json({ success: true, count: products.length, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching best sellers', error: error.message });
    }
});

// Get new arrivals
router.get('/products/new-arrivals', async (req, res) => {
    try {
        const products = await Product.find({ isNewArrival: true, status: 'Active' })
            .select('name price originalPrice category description image')
            .lean();
        res.json({ success: true, count: products.length, data: products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching new arrivals', error: error.message });
    }
});

// Get single product detail
router.get('/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).lean();
        if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, data: product });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching product', error: error.message });
    }
});

// Get all categories (for agent to know available categories)
router.get('/categories', async (req, res) => {
    try {
        const categories = await Product.distinct('category', { status: 'Active' });
        res.json({ success: true, data: categories });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching categories', error: error.message });
    }
});

module.exports = router;
