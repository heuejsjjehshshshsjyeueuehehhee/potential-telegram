// test.js
const videoExtractor = require('./modules/videoExtractor');

// Woh URL jo dikkat de raha hai
const TEST_URL = "https://watchanimeworld.net/episode/you-and-i-are-polar-opposites-1x1/";

console.log("🚀 STARTING TEST...");
console.log(`🎯 Testing URL: ${TEST_URL}`);

async function runTest() {
    try {
        const link = await videoExtractor.extractLink(TEST_URL);
        console.log("\n================ RESULT ================");
        if (link) {
            console.log(`✅ SUCCESS! Extracted Link: ${link}`);
        } else {
            console.log("❌ FAILED! Could not find any video link.");
        }
    } catch (error) {
        console.error("🔥 CRITICAL ERROR:", error);
    }
}

runTest();