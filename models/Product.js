const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    category: { type: String, required: true },
    stock: { type: Number, default: 0 },
    status: { type: String, enum: ['Active', 'Draft', 'Out of Stock'], default: 'Active' },
    image: { type: String, default: '/images/sample-product.png' },
    description: { type: String },
    isNewArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isReadyToGift: { type: Boolean, default: false }
}, {
    timestamps: true
});

module.exports = mongoose.model('Product', productSchema);
