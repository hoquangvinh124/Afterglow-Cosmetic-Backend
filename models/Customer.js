const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    membershipLevel: { type: String, enum: ['Standard', 'Silver', 'Gold', 'VIP'], default: 'Standard' },
    totalSpent: { type: Number, default: 0 },
    lastPurchaseDate: { type: Date },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    avatar: { type: String, default: '/images/default-avatar.png' }
}, {
    timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);
