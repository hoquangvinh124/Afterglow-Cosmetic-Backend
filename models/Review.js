const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    reviewerName: { type: String, required: true },
    location: { type: String, default: '' },
    isVerified: { type: Boolean, default: true },
    skinType: { type: String, default: '' },
    skinShade: { type: String, default: '' },
    ageRange: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, required: true },
    content: { type: String, required: true },
    recommend: { type: Boolean, default: true },
    upvotes: { type: Number, default: 0 },
    downvotes: { type: Number, default: 0 }
}, {
    timestamps: true
});

module.exports = mongoose.model('Review', reviewSchema);
