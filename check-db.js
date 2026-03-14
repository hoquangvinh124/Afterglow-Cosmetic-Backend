const mongoose = require('mongoose');
require('dotenv').config({ path: 'C:\\Users\\PC LENOVO\\Downloads\\chacogi\\Afterglow-Cosmetic-Backend\\.env' });
const Product = require('./models/Product');

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB. Checking products...');

        const allProducts = await Product.find();
        console.log(`Total products in DB: ${allProducts.length}`);

        const bestSellers = allProducts.filter(p => p.isBestSeller === true);
        console.log(`Total best sellers in DB: ${bestSellers.length}`);

        console.log('Best Sellers:');
        bestSellers.forEach(p => console.log(`- ${p.name} (isBestSeller: ${p.isBestSeller})`));

        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
