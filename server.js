const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const morgan = require('morgan');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
require('dotenv').config();

const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: ['https://afterglow-cosmetic.vercel.app', 'http://localhost:4200'],
    credentials: true, // Cho phép gửi thông tin xác thực (cookies, headers,...)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(passport.initialize());

// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'YOUR_GOOGLE_CLIENT_ID',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'YOUR_GOOGLE_CLIENT_SECRET',
    callbackURL: process.env.BACKEND_URL ? `${process.env.BACKEND_URL}/api/auth/google/callback` : 'https://afterglow-cosmetic-backend.onrender.com/api/auth/google/callback'
},
    async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            if (!user) {
                user = await User.create({
                    googleId: profile.id,
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    avatar: profile.photos[0]?.value || '',
                    role: 'user'
                });
            }
            done(null, user);
        } catch (err) {
            done(err, null);
        }
    }
));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:admin123@cluster0.mongodb.net/afterglow?retryWrites=true&w=majority';
console.log('🔄 Attempting to connect to MongoDB Atlas...');
console.log('URI:', MONGODB_URI.substring(0, 30) + '...');

mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 5000 // Timeout in 5s instead of 30s
})
    .then(() => console.log('✅ Connected to MongoDB Atlas (Afterglow Database)'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// API Routes
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const agentApiRoutes = require('./routes/agent-api');
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/agent', agentApiRoutes);

// Health Check
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'Operational',
        message: 'Afterglow Cosmetic API is running.',
        timestamp: new Date()
    });
});

// Fallback Route
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'API Endpoint not found' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Luxury Server running on http://localhost:${PORT}`);
    console.log(`✨ Environment: ${process.env.NODE_ENV || 'development'}`);
});
