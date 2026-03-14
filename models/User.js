const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    // googleId is optional — only present for Google OAuth accounts
    googleId: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    // password is optional — only for email/password accounts (stored as bcrypt hash)
    password: { type: String },
    phone: { type: String },
    avatar: { type: String },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    addresses: [{
        firstName: String,
        lastName: String,
        country: String,
        street: String,
        apartment: String,
        province: String,
        district: String,
        ward: String,
        phone: String,
        isDefault: Boolean
    }],
    wishlist: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
