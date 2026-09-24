// Run once with: npm run generate-keys
// Copy the printed values into your host's environment variables
// (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY) and paste the public key into
// the client's /pwa/config.js as PUSH_VAPID_PUBLIC_KEY.
const webpush = require("web-push");
const keys = webpush.generateVAPIDKeys();
console.log("VAPID_PUBLIC_KEY=" + keys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + keys.privateKey);
