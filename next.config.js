/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
};

module.exports = nextConfig; 
console.log("✅ Loaded ENV:", process.env.ELEVENLABS_API_KEY, process.env.ELEVENLABS_VOICE_ID);
