const mongoose = require('mongoose');
require('dotenv').config({ path: 'C:\\Users\\PC LENOVO\\Downloads\\chacogi\\Afterglow-Cosmetic-Backend\\.env' });
const Product = require('./models/Product');

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB. Seeding product details...');

        const products = await Product.find({});
        let count = 0;

        for (const p of products) {
            let updated = false;

            const fakeDescription = p.description && p.description.length > 30 ? p.description :
                `Experience the ultimate luxury with our ${p.name}. Specially formulated to enhance your natural beauty, this product delivers a flawless, long-lasting finish that feels as good as it looks. Perfect for everyday elegance or standout evening glam.`;

            const fakeIngredients = p.ingredients || "Aqua (Water), Glycerin, Butylene Glycol, Niacinamide, Sodium Hyaluronate, Panthenol, Camellia Sinensis Leaf Extract, Aloe Barbadensis Leaf Juice, Phenoxyethanol, Ethylhexylglycerin, Fragrance.";

            const fakeHowToUse = p.howToUse || "Apply a small amount to clean, dry skin. Gently massage in upward circular motions until fully absorbed. For best results, use daily as part of your morning and evening skincare routine.";

            const fakeBenefits = p.benefits || "Deeply hydrates and nourishes the skin. Improves skin texture and elasticity. Provides a radiant, healthy-looking glow. Non-comedogenic and suitable for all skin types.";

            await Product.updateOne({ _id: p._id }, {
                $set: {
                    description: fakeDescription,
                    ingredients: fakeIngredients,
                    howToUse: fakeHowToUse,
                    benefits: fakeBenefits
                }
            });
            count++;
        }

        console.log(`Successfully updated ${count} products with fake details.`);
        process.exit(0);
    })
    .catch(err => {
        console.error('Error connecting to MongoDB', err);
        process.exit(1);
    });
