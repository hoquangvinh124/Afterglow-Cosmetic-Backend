const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'afterglow_luxury_secret_key_2026';
const CLIENT_URL = process.env.CLIENT_URL || 'https://afterglow-cosmetic.vercel.app';

// Helper: create JWT token (7 days)
function createToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email, name: user.name, role: user.role, avatar: user.avatar || '' },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// Helper: create temporary password reset token (5 minutes)
function createResetToken(user) {
    return jwt.sign(
        { id: user._id, email: user.email, passwordResetAllowed: true },
        JWT_SECRET,
        { expiresIn: '5m' }
    );
}

// Start Google OAuth flow
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Google OAuth callback
router.get('/google/callback',
    passport.authenticate('google', { session: false, failureRedirect: `${CLIENT_URL}/login?error=auth_failed` }),
    (req, res) => {
        const token = createToken(req.user);
        res.redirect(`${CLIENT_URL}/login?token=${token}`);
    }
);

const User = require('../models/User');
const otpService = require('../services/otpService');
const emailService = require('../services/emailService');

// ==========================================
// 📧 EMAIL / PASSWORD AUTH ENDPOINTS
// ==========================================

// Check if an email is already registered
router.post('/check-email', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'Email is required' });
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        return res.json({ success: true, exists: !!user });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Register with email & password
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
        return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    if (password.length < 6)
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    try {
        const existing = await User.findOne({ email: email.toLowerCase().trim() });
        if (existing)
            return res.status(409).json({ success: false, message: 'Email already in use' });

        const hashed = await bcrypt.hash(password, 12);
        const user = await User.create({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashed,
            role: 'user',
            avatar: ''
        });
        
        // Send welcome email asynchronously
        const emailService = require('../services/emailService');
        emailService.sendWelcomeEmail(user.email, user.name);

        const token = createToken(user);
        return res.status(201).json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
        });
    } catch (err) {
        console.error('[register] Error:', err.message, err.code);
        return res.status(500).json({ success: false, message: 'Registration failed' });
    }
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ success: false, message: 'Email and password are required' });
    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user)
            return res.status(401).json({ success: false, message: 'Invalid email or password' });

        // Google-only accounts have no local password
        if (!user.password)
            return res.status(401).json({ success: false, message: 'This account uses Google Sign-In. Please continue with Google.' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Invalid email or password' });

        const token = createToken(user);
        return res.json({
            success: true,
            token,
            user: { id: user._id, name: user.name, email: user.email, role: user.role, avatar: user.avatar }
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Login failed' });
    }
});

// ==========================================
// 🔐 OTP-BASED PASSWORD RESET & CHANGE
// ==========================================

// Request OTP (for forgot-password or change-password)
router.post('/request-otp', async (req, res) => {
    const { email, purpose } = req.body;

    // Validate inputs
    if (!email || !purpose) {
        return res.status(400).json({ success: false, message: 'Email and purpose are required' });
    }

    if (!['forgot-password', 'change-password'].includes(purpose)) {
        return res.status(400).json({ success: false, message: 'Invalid purpose' });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });

        // Security: Don't reveal if email exists (prevent user enumeration)
        // Always return success, but only send email if user exists
        if (!user) {
            return res.json({
                success: true,
                message: 'If an account exists with this email, an OTP has been sent.',
                expiresIn: 600
            });
        }

        // Check if user has a password (Google OAuth users don't)
        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: 'Cannot reset password for Google accounts. Please use Google Sign-In.'
            });
        }

        // Check rate limiting
        if (!otpService.canRequestOTP(user)) {
            const remainingTime = otpService.getRateLimitRemainingTime(user);
            return res.status(429).json({
                success: false,
                message: `Too many OTP requests. Please try again in ${remainingTime} minutes.`,
                retryAfter: remainingTime
            });
        }

        // Generate OTP
        const otp = otpService.generateOTP();
        const hashedOTP = await otpService.hashOTP(otp);

        // Save hashed OTP to user
        user.otp = {
            code: hashedOTP,
            createdAt: new Date(),
            purpose: purpose
        };

        // Add attempt for rate limiting
        otpService.addAttempt(user);

        await user.save();

        // Send OTP email
        emailService.sendOTPEmail(user.email, user.name, otp, purpose);

        console.log(`[OTP] Generated OTP for ${user.email} (purpose: ${purpose})`);

        return res.json({
            success: true,
            message: 'OTP sent to your email address',
            expiresIn: 600
        });
    } catch (err) {
        console.error('[request-otp] Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to send OTP' });
    }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
    const { email, otp, purpose } = req.body;

    if (!email || !otp || !purpose) {
        return res.status(400).json({ success: false, message: 'Email, OTP, and purpose are required' });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if OTP exists
        if (!user.otp || !user.otp.code) {
            return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
        }

        // Check if OTP expired
        if (otpService.isExpired(user)) {
            otpService.clearOTP(user);
            await user.save();
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        // Check if purpose matches
        if (user.otp.purpose !== purpose) {
            return res.status(400).json({ success: false, message: 'Invalid OTP purpose' });
        }

        // Verify OTP
        const isValid = await otpService.verifyOTP(user, otp);

        if (!isValid) {
            return res.status(400).json({ success: false, message: 'Invalid OTP code' });
        }

        // OTP is valid - for forgot-password, return temporary reset token
        if (purpose === 'forgot-password') {
            const resetToken = createResetToken(user);
            return res.json({
                success: true,
                message: 'OTP verified successfully',
                token: resetToken
            });
        }

        // For change-password, just confirm verification (actual password change happens in /change-password)
        return res.json({
            success: true,
            message: 'OTP verified successfully'
        });
    } catch (err) {
        console.error('[verify-otp] Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to verify OTP' });
    }
});

// Reset password (requires temporary reset token from verify-otp)
router.post('/reset-password', async (req, res) => {
    const { email, newPassword, resetToken } = req.body;

    if (!email || !newPassword || !resetToken) {
        return res.status(400).json({ success: false, message: 'Email, new password, and reset token are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    try {
        // Verify reset token
        const decoded = jwt.verify(resetToken, JWT_SECRET);

        // Check if token is a password reset token
        if (!decoded.passwordResetAllowed) {
            return res.status(401).json({ success: false, message: 'Invalid reset token' });
        }

        // Check if email matches
        if (decoded.email !== email.toLowerCase().trim()) {
            return res.status(401).json({ success: false, message: 'Email mismatch' });
        }

        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update password and clear OTP
        user.password = hashedPassword;
        otpService.clearOTP(user);
        await user.save();

        console.log(`[reset-password] Password reset successful for ${user.email}`);

        return res.json({
            success: true,
            message: 'Password reset successfully. You can now log in with your new password.'
        });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Reset token has expired. Please request a new OTP.' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid reset token' });
        }
        console.error('[reset-password] Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to reset password' });
    }
});

// Change password (requires authentication + OTP verification)
router.post('/change-password', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const { currentPassword, newPassword, otp } = req.body;

    if (!currentPassword || !newPassword || !otp) {
        return res.status(400).json({ success: false, message: 'Current password, new password, and OTP are required' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if user has a password (Google OAuth users don't)
        if (!user.password) {
            return res.status(400).json({
                success: false,
                message: 'Cannot change password for Google accounts'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }

        // Check if OTP exists
        if (!user.otp || !user.otp.code) {
            return res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
        }

        // Check if OTP expired
        if (otpService.isExpired(user)) {
            otpService.clearOTP(user);
            await user.save();
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        // Check if OTP purpose is change-password
        if (user.otp.purpose !== 'change-password') {
            return res.status(400).json({ success: false, message: 'Invalid OTP for password change' });
        }

        // Verify OTP
        const isOTPValid = await otpService.verifyOTP(user, otp);
        if (!isOTPValid) {
            return res.status(400).json({ success: false, message: 'Invalid OTP code' });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update password and clear OTP
        user.password = hashedPassword;
        otpService.clearOTP(user);
        await user.save();

        console.log(`[change-password] Password changed successfully for ${user.email}`);

        return res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Invalid or expired token' });
        }
        console.error('[change-password] Error:', err);
        return res.status(500).json({ success: false, message: 'Failed to change password' });
    }
});

// Get current user info (verify token)
router.get('/me', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        // Internal admin account has a non-ObjectId ID — short-circuit before DB query
        // to prevent Mongoose CastError that would incorrectly return 401
        if (decoded.id === 'admin-internal-id') {
            return res.json({ success: true, data: decoded });
        }

        // Find user in DB and populate wishlist
        const user = await User.findById(decoded.id).populate('wishlist.product');

        if (!user) {
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

        // Support both legacy email-based orders and new userId-linked orders
        const orders = await Order.find({
            $or: [
                { userId: user._id },
                { email: user.email }
            ]
        }).sort({ createdAt: -1 }).populate('items.product');
        res.json({ success: true, data: orders });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching orders' });
    }
});

module.exports = router;
