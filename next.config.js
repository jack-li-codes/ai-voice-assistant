/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_ORG_ID: process.env.OPENAI_ORG_ID,
  },
};

module.exports = nextConfig;
console.log("✅ Loaded ENV:", {
  ELEVENLABS_API_KEY: !!process.env.ELEVENLABS_API_KEY,
  ELEVENLABS_VOICE_ID: !!process.env.ELEVENLABS_VOICE_ID
});
