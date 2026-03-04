const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'afterglow_luxury_secret_key_2026';
const CLIENT_URL = process.env.CLIENT_URL || 'https://afterglow-cosmetic.vercel.app';

// Start Google OAuth flow
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${CLIENT_URL}/login?error=auth_failed` }),
    (req, res) => {
        // Create JWT token
        const token = jwt.sign(
            { id: req.user._id, email: req.user.email, name: req.user.name, role: req.user.role, avatar: req.user.avatar },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        // Redirect to frontend with token
        res.redirect(`${CLIENT_URL}/login?token=${token}`);
    }
);

const User = require('../models/User');

// Get current user info (verify token)
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Find user in DB and populate wishlist
        const user = await User.findById(decoded.id).populate('wishlist.product');

        if (!user) {
            // Fallback for Admin account defined in .env
            if (decoded.role === 'admin') {
                return res.json({ success: true, data: decoded });
            }
            return res.status(404).json({ success: false, message: 'User not found in database' });
        }

        res.json({ success: true, data: user });
    } catch (err) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

// Admin Direct Login
router.post('/admin/login', (req, res) => {
    const { email, password } = req.body;

    // Check against .env internal credentials
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@afterglow.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'luxuryadmin2026';

    if (email === adminEmail && password === adminPassword) {
        // Create JWT token for admin
        const token = jwt.sign(
            { id: 'admin-internal-id', email: adminEmail, name: 'System Administrator', role: 'admin', avatar: '/images/avatar-placeholder.png' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.json({ success: true, token, user: { name: 'System Administrator', role: 'admin' } });
    } else {
        res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }
});

// Profile Update Route
router.put('/profile', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { name, phone } = req.body;

        const user = await User.findByIdAndUpdate(decoded.id, { name, phone }, { new: true });
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(401).json({ success: false, message: 'Invalid token or update failed' });
    }
});

// Addresses Routes
router.post('/address', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (req.body.isDefault) {
            user.addresses.forEach(a => a.isDefault = false);
        }

        user.addresses.push(req.body);
        await user.save();
        res.json({ success: true, data: user.addresses });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error adding address' });
    }
});

router.put('/address/:id', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (req.body.isDefault) {
            user.addresses.forEach(a => a.isDefault = false);
        }

        const address = user.addresses.id(req.params.id);
        if (address) {
            Object.assign(address, req.body);
            await user.save();
        }
        res.json({ success: true, data: user.addresses });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error updating address' });
    }
});

router.delete('/address/:id', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        await User.findByIdAndUpdate(decoded.id, {
            $pull: { addresses: { _id: req.params.id } }
        });
        res.json({ success: true, message: 'Address removed' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error removing address' });
    }
});

// Wishlist Routes
router.post('/wishlist', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const { productId } = req.body;

        await User.findByIdAndUpdate(decoded.id, {
            $addToSet: { wishlist: { product: productId } }
        });

        const updatedUser = await User.findById(decoded.id).populate('wishlist.product');
        res.json({ success: true, data: updatedUser.wishlist });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error adding to wishlist' });
    }
});

router.delete('/wishlist/:productId', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        await User.findByIdAndUpdate(decoded.id, {
            $pull: { wishlist: { product: req.params.productId } }
        });

        const updatedUser = await User.findById(decoded.id).populate('wishlist.product');
        res.json({ success: true, data: updatedUser.wishlist });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error removing from wishlist' });
    }
});

const Order = require('../models/Order');

// Get User Orders
router.get('/orders', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });
    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        // Orders are matched by email
        const orders = await Order.find({ email: user.email }).sort({ createdAt: -1 }).populate('items.product');
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching orders' });
    }
});

module.exports = router;
