const mongoose = require('mongoose');

// Embedded address schema — dùng chung cho shippingAddress & billingAddress
const addressSchema = new mongoose.Schema({
    firstName: String,
    lastName:  String,
    email:     String,
    street:    String,
    apartment: String,
    province:  String,
    district:  String,
    ward:      String,
    phone:     String,
}, { _id: false });

const orderSchema = new mongoose.Schema({
    // Optional link to registered user
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    customerName: { type: String, required: true },
    email:        { type: String, required: true },

    items: [{
        product:          { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
        productId:        { type: String },   // raw string fallback
        productName:      { type: String },
        imageUrl:         { type: String },
        variantId:        { type: String },
        variantName:      { type: String },
        quantity:         { type: Number, required: true, min: 1 },
        priceAtPurchase:  { type: Number, required: true },
    }],

    totalAmount: { type: Number, required: true },

    status: {
        type: String,
        enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending',
    },

    paymentMethod: {
        type: String,
        enum: ['cod', 'momo', 'vnpay', 'creditCard', 'bankTransfer', 'eWallets'],
        required: true,
    },
    paymentStatus: {
        type: String,
        enum: ['Pending', 'Paid', 'Failed'],
        default: 'Pending',
    },

    shippingMethod:  { type: String, default: 'standard' },
    shippingAddress: addressSchema,
    billingAddress:  addressSchema,

    discountCode: { type: String },
    note:         { type: String },

    // Store MoMo's orderId so we can match the IPN callback
    momoOrderId: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
