const mongoose = require('mongoose');
require('dotenv').config({ path: 'C:\\Users\\PC LENOVO\\Downloads\\chacogi\\Afterglow-Cosmetic-Backend\\.env' });
const Product = require('./models/Product');

const bestSellers = [
    {
        name: 'Rose Velvet Matte Lipstick',
        price: 32.99,
        originalPrice: 42.00,
        category: 'lipstick',
        stock: 150,
        status: 'Active',
        image: '/images/FlowerKnows-Strawberry-Rococo-Blush.png',
        description: 'A luxuriously creamy matte lipstick infused with rose extract. Delivers rich, full-coverage color that lasts up to 12 hours without drying your lips.',
        ingredients: 'Isononyl Isononanoate, Dimethicone, Rosa Damascena Flower Extract, Tocopheryl Acetate, Jojoba Esters, Silica, Fragrance.',
        howToUse: 'Exfoliate lips gently before application. Apply directly from the bullet or use a lip brush for precision. Start from the center of your lips and blend outward.',
        benefits: 'Long-lasting matte finish. Enriched with rose extract for nourishment. Non-drying formula with vitamin E. Buildable coverage from sheer to bold.',
        isBestSeller: true,
        isNewArrival: false,
        isReadyToGift: false
    },
    {
        name: 'Crystal Glow Highlighter Palette',
        price: 45.99,
        originalPrice: 58.00,
        category: 'palette',
        stock: 89,
        status: 'Active',
        image: '/images/FlowerKnows-Strawberry-Rococo-Eyeshadow-Palette.png',
        description: 'A stunning trio of micro-fine shimmer highlighters that create a luminous, glass-skin effect. Each shade catches the light beautifully for an ethereal glow.',
        ingredients: 'Mica, Calcium Aluminum Borosilicate, Synthetic Fluorphlogopite, Dimethicone, Silica, Diamond Powder, Phenoxyethanol.',
        howToUse: 'Using a fan brush or fingertip, sweep highlighter onto the high points of your face: cheekbones, brow bone, nose bridge, and cupid\'s bow.',
        benefits: 'Ultra-fine shimmer without glitter fallout. Buildable intensity from subtle to blinding. Suitable for all skin tones. Long-wearing formula.',
        isBestSeller: true,
        isNewArrival: false,
        isReadyToGift: false
    },
    {
        name: 'Silk Finish Foundation SPF25',
        price: 55.00,
        originalPrice: 68.00,
        category: 'foundation',
        stock: 200,
        status: 'Active',
        image: '/images/FlowerKnows-Strawberry-Rococo-Lipstick.png',
        description: 'A weightless, buildable foundation that melts into skin for a naturally flawless, silk-like finish. Infused with SPF25 for daily sun protection.',
        ingredients: 'Aqua, Cyclopentasiloxane, Titanium Dioxide, Glycerin, Niacinamide, Hyaluronic Acid, Vitamin C, Aloe Vera Extract, Zinc Oxide.',
        howToUse: 'Shake well before use. Apply a pump onto the back of your hand. Use a damp beauty sponge or foundation brush to blend from the center of the face outward.',
        benefits: 'Medium-to-full buildable coverage. SPF25 sun protection. Hydrating formula with hyaluronic acid. Controls oil for up to 16 hours.',
        isBestSeller: true,
        isNewArrival: false,
        isReadyToGift: false
    },
    {
        name: 'Blooming Peach Blush Duo',
        price: 28.50,
        originalPrice: 35.00,
        category: 'blush',
        stock: 120,
        status: 'Active',
        image: '/images/FlowerKnows-Strawberry-Rococo-Lip-Cream.png',
        description: 'A harmonious duo of matte and shimmer blush shades inspired by fresh peach blossoms. Creates a natural, healthy flush that looks stunning on every skin tone.',
        ingredients: 'Talc, Mica, Zinc Stearate, Dimethicone, Peach Extract, Camellia Sinensis Leaf Extract, Tocopherol, Silica.',
        howToUse: 'Smile and apply the matte shade to the apples of your cheeks using a blush brush. Layer the shimmer shade on top for an added glow.',
        benefits: 'Dual matte + shimmer finish. Blendable and buildable formula. Infused with peach extract for skin care benefits. Lasts all day.',
        isBestSeller: true,
        isNewArrival: false,
        isReadyToGift: false
    },
    {
        name: 'Lash Paradise Volume Mascara',
        price: 24.99,
        originalPrice: 30.00,
        category: 'mascara',
        stock: 300,
        status: 'Active',
        image: '/images/FlowerKnows-Strawberry-Rococo-Brow-Pencil.png',
        description: 'An ultra-volumizing mascara with a unique hourglass wand that coats every lash from root to tip. Delivers dramatic, feathery volume without clumping.',
        ingredients: 'Aqua, Beeswax, Copernicia Cerifera Wax, Butylene Glycol, Stearic Acid, Acacia Senegal Gum, Panthenol, Biotin.',
        howToUse: 'Start at the base of lashes and wiggle the wand upward in a zigzag motion. Apply 2-3 coats for maximum volume. Use the tip for lower lashes.',
        benefits: 'Extreme volume without clumping. Smudge-proof and flake-proof. Enriched with biotin for lash health. Easy removal with warm water.',
        isBestSeller: true,
        isNewArrival: false,
        isReadyToGift: false
    },
    {
        name: 'Hydra-Glow Setting Spray',
        price: 22.00,
        originalPrice: 28.00,
        category: 'setting-spray',
        stock: 250,
        status: 'Active',
        image: '/images/FlowerKnows-Violet-Strawberry-Rococo-Glowy-Lip-Gloss.png',
        description: 'A micro-fine mist that locks in your makeup for up to 16 hours while keeping skin hydrated and dewy. The perfect finishing touch for any look.',
        ingredients: 'Aqua, Glycerin, Aloe Barbadensis Leaf Juice, Niacinamide, Sodium Hyaluronate, Rosa Centifolia Flower Water, Phenoxyethanol.',
        howToUse: 'Hold 8-10 inches from face. Close eyes and mist in an X and T pattern over your finished makeup. Allow to dry naturally.',
        benefits: 'Locks makeup for 16+ hours. Hydrating mist formula. Controls shine without mattifying. Refreshes makeup throughout the day.',
        isBestSeller: true,
        isNewArrival: false,
        isReadyToGift: false
    },
    {
        name: 'Starlight Eyeshadow Palette',
        price: 52.00,
        originalPrice: 65.00,
        category: 'palette',
        stock: 75,
        status: 'Active',
        image: '/images/FlowerKnows-Strawberry-Rococo-Mascara.png',
        description: 'A curated collection of 12 universally flattering shades ranging from soft neutrals to bold metallics. Perfect for creating endless day-to-night looks.',
        ingredients: 'Mica, Talc, Dimethicone, Ethylhexyl Palmitate, Kaolin, Tocopheryl Acetate, Jojoba Oil, Iron Oxides.',
        howToUse: 'Prime lids before application. Use lighter shades on the lid, medium tones in the crease, and darker shades in the outer corner. Blend well for seamless transitions.',
        benefits: '12 versatile shades in one palette. Ultra-pigmented and buttery smooth. Minimal fallout during application. Lasts up to 12 hours with primer.',
        isBestSeller: true,
        isNewArrival: false,
        isReadyToGift: false
    },
    {
        name: 'Plumping Lip Oil Gloss',
        price: 19.99,
        originalPrice: 25.00,
        category: 'lip-gloss',
        stock: 180,
        status: 'Active',
        image: '/images/FlowerKnows-Strawberry-Rococo-Lip-Liner.png',
        description: 'A non-sticky lip oil that delivers a juicy, glass-like shine while plumping and hydrating lips. Infused with real fruit extracts for a subtle tint of color.',
        ingredients: 'Polybutene, Octyldodecanol, Squalane, Jojoba Seed Oil, Vitamin E, Peppermint Oil, Strawberry Extract, Honey Extract.',
        howToUse: 'Apply directly to lips using the doe-foot applicator. Can be worn alone for a natural glossy look or layered over lipstick for extra shine and dimension.',
        benefits: 'Plumping effect with peptides. Non-sticky, comfortable wear. Deeply moisturizing with squalane. Subtle fruit-tinted color.',
        isBestSeller: true,
        isNewArrival: false,
        isReadyToGift: false
    }
];

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('Connected to MongoDB. Seeding best sellers...');

        for (const product of bestSellers) {
            await Product.create(product);
            console.log(`Created: ${product.name}`);
        }

        console.log(`\nSuccessfully seeded ${bestSellers.length} best seller products!`);
        process.exit(0);
    })
    .catch(err => {
        console.error('Error:', err);
        process.exit(1);
    });
