const mongoose = require("mongoose");

async function connectDB() {
    try {
        const target = process.env.DB_TARGET || 'test';
        const uri = target === 'dev'
            ? process.env.MONGODB_URI_DEV
            : process.env.MONGODB_URI_TEST;
        if (!uri) {
            throw new Error(`MONGODB_URI_${target.toUpperCase()}가 .env에 설정되지 않았습니다.`);
        }
        await mongoose.connect(uri);
        console.log(`MongoDB connected (${target})`);
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
}

module.exports = connectDB;
