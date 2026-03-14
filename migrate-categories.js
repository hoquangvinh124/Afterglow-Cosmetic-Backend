const mongoose = require('mongoose');
require('dotenv').config();
const Product = require('./models/Product');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB. Starting migration...');

        const products = await Product.find({});
        let updatedCount = 0;

        for (const product of products) {
            // Only update if it's not already 'makeup' and it doesn't have a subCategory (or if it's older data)
            // Even if category is 'skincare', we keep it 'skincare'. Wait, user said "Hiện tại database chưa có skincare nên tất cả đều là màu xanh aqua makeup. Chừng nào category nó là skincare thì là makeup còn mấy cái mà lips đồ là sub category."
            // So if category is not 'skincare', we move it to subCategory and set category = 'makeup'
            if (product.category !== 'skincare' && product.category !== 'makeup') {
                product.subCategory = product.category;
                product.category = 'makeup';
                await product.save();
                updatedCount++;
                console.log(`Updated ${product.name}: category -> makeup, subCategory -> ${product.subCategory}`);
            }
        }

        console.log(`Migration complete. Updated ${updatedCount} products.`);
    } catch (e) {
        console.error('Migration failed:', e);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

migrate();
