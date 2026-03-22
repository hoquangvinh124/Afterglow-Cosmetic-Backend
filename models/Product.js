const mongoose = require('mongoose');

/**
 * VariantSchema — mỗi variant là một màu / phiên bản của sản phẩm.
 * Chứa tên, hex màu approximate, danh sách ảnh (ordered), và stock riêng.
 */
const variantSchema = new mongoose.Schema({
    name:   { type: String, required: true },          // e.g. "01 Seaborne Moon"
    slug:   { type: String, required: true },          // e.g. "01-seaborne-moon"
    hex:    { type: String, default: '#D4B5A0' },      // approximate swatch color
    images: [{ type: String }],                        // ordered image paths (public/images/...)
    stock:  { type: Number, default: 50 }
}, { _id: true });

const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    price: { type: Number, required: true },
    originalPrice: { type: Number },
    category: { type: String, required: true },        // "makeup" | "skincare"
    subCategory: { type: String },                     // "blush" | "eyes" | "lips" | etc.
    stock: { type: Number, default: 0 },               // aggregate stock (sum of variants)
    status: { type: String, enum: ['Active', 'Draft', 'Out of Stock'], default: 'Active' },
    // Legacy single-image — kept for backwards compat; derived from variants[0].images[0]
    image: { type: String, default: '/images/sample-product.png' },
    // Variant array — new: each product can have N colour/shade variants
    variants: [variantSchema],
    description: { type: String },
    ingredients: { type: String },
    howToUse: { type: String },
    benefits: { type: String },
    isNewArrival: { type: Boolean, default: false },
    isBestSeller: { type: Boolean, default: false },
    isReadyToGift: { type: Boolean, default: false },
    rating: { type: Number, default: 0 },              // Average rating
    reviewCount: { type: Number, default: 0 }          // Total number of reviews
}, {
    timestamps: true
});

module.exports = mongoose.model('Product', productSchema);
