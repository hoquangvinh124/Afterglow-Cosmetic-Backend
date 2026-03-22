require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');
const Review = require('./models/Review');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hoquangvinh124:xB2uiaB2PskfFUXG@cluster0.wckzv48.mongodb.net/afterglow?appName=Cluster0';

const skinTypes = ['Dry', 'Oily', 'Combination', 'Normal', 'Sensitive'];
const ageRanges = ['18-24', '25-34', '35-44', '45-54', '55+'];
const locations = ['Ho Chi Minh City', 'Hanoi', 'Da Nang', 'Can Tho', 'New York', 'Los Angeles', 'London', 'Paris', 'Tokyo', 'Seoul'];

const femaleNames = [
    'Linh Nguyen', 'Mai Tran', 'Thao Le', 'Phuong Pham', 'Trang Hoang',
    'Emma W.', 'Sophia M.', 'Olivia J.', 'Ava S.', 'Isabella R.',
    'Mia K.', 'Charlotte T.', 'Amelia C.', 'Evelyn P.', 'Harper B.',
    'Chau Bui', 'Khanh Vy', 'Quynh Luu', 'Minh Tu', 'Tu Hao',
    'Sarah L.', 'Jessica D.', 'Helen H.', 'Chloe N.', 'Zoe V.'
];

const reviewContents = {
    5: [
        { title: "Absolutely love it!", content: "This product exceeded my expectations. It blends beautifully and lasts all day. Highly recommended!" },
        { title: "Holy grail status", content: "I've tried so many similar products but this one is by far the best. The luxurious feel is unmatched." },
        { title: "Stunning finish", content: "Transforms my routine. The packaging is gorgeous, and the product itself performs flawlessly." },
        { title: "Worth every penny", content: "A bit of a splurge but absolutely worth it. My skin has never looked better. Will repurchase." },
        { title: "Simply perfect", content: "I am obsessed! The texture is divine and it gives me that perfect 'Afterglow' look." }
    ],
    4: [
        { title: "Really good", content: "I really like this product. It works well and looks beautiful, just wish it came with a bit more product for the price." },
        { title: "Great addition to my routine", content: "Solid performance. Takes a little practice to get the hang of applying it perfectly, but the end result is lovely." },
        { title: "Nice luxurious feel", content: "Very nice! The packaging feels premium and everything is high quality. Dropping one star just because the shade was slightly warmer than expected." }
    ],
    3: [
        { title: "It's okay", content: "The product is fine, but it didn't wow me like I thought it would based on the hype. It's decent." },
        { title: "Average", content: "Not bad, but not my favorite. The formula is a little tricky to work with on my skin type." }
    ],
    2: [
        { title: "A bit disappointed", content: "I wanted to love this, but it just didn't work for me. The color oxidized on my skin." },
        { title: "Not for me", content: "Beautiful packaging but the product itself irritated my skin slightly. Probably better for someone else." }
    ],
    1: [
        { title: "Did not work at all", content: "Very disappointed. It separated on my skin and did not last more than an hour. Would not recommend." },
        { title: "Overpriced", content: "I honestly don't get the hype. The formula felt cheap despite the luxury branding. I had to return it." }
    ]
};

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(array) {
    let currentIndex = array.length,  randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

async function seedReviews() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB.');

        // Clear existing reviews
        await Review.deleteMany({});
        console.log('Cleared existing reviews.');

        const products = await Product.find();
        console.log(`Found ${products.length} products to seed reviews for.`);

        let totalReviewsCreated = 0;

        for (const product of products) {
            // N = random between 35 and 50
            const n = Math.floor(Math.random() * (50 - 35 + 1)) + 35;
            
            // To ensure 1-5 all present, and average 4.7-5.0:
            // Add exactly one of 1, 2, 3, 4 stars. (Total 10 stars)
            // Remaining (n - 4) reviews are 5 stars.
            // Avg = (10 + 5 * (n-4)) / n = (5n - 10) / n = 5 - 10/n
            // For n=35: avg = ~4.71
            // For n=50: avg = 4.80

            let ratings = [1, 2, 3, 4];
            for (let i = 0; i < n - 4; i++) {
                ratings.push(5);
            }
            
            // Shuffle ratings
            ratings = shuffle(ratings);

            let reviewSum = 0;
            const newReviews = [];

            for (const r of ratings) {
                reviewSum += r;
                
                const template = getRandomElement(reviewContents[r]);
                
                const upvotes = r >= 4 ? Math.floor(Math.random() * 20) : Math.floor(Math.random() * 5);
                const downvotes = Math.floor(Math.random() * 3);
                
                newReviews.push({
                    product: product._id,
                    reviewerName: getRandomElement(femaleNames),
                    location: Math.random() > 0.3 ? getRandomElement(locations) : '',
                    isVerified: Math.random() > 0.1, // 90% verified
                    skinType: getRandomElement(skinTypes),
                    skinShade: Math.random() > 0.5 ? 'Light/Medium' : 'Medium/Deep',
                    ageRange: getRandomElement(ageRanges),
                    rating: r,
                    title: template.title,
                    content: template.content,
                    recommend: r >= 4,
                    upvotes,
                    downvotes
                });
            }

            // Insert into Database
            await Review.insertMany(newReviews);
            totalReviewsCreated += newReviews.length;

            const averageRating = Number((reviewSum / n).toFixed(1));

            // Update product cache stats
            product.rating = averageRating;
            product.reviewCount = n;
            await product.save();

            console.log(`Product "${product.name}" - ${n} reviews, Avg Rating: ${averageRating}`);
        }

        console.log(`✅ successfully seeded ${totalReviewsCreated} reviews.`);
    } catch (error) {
        console.error('Error seeding reviews:', error);
    } finally {
        await mongoose.disconnect();
        console.log('MongoDB disconnected.');
    }
}

seedReviews();
