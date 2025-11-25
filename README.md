🤖 AI Voice Assistant – Intelligent Phone Agent

An intelligent voice assistant powered by GPT + Speech Recognition + Voice Synthesis.
Users simply type instructions in Chinese, and the AI automatically understands the task, generates natural English dialogue, and plays it using realistic AI voice — simulating a real phone call.

Perfect for scenarios like:

        Rescheduling interviews
        Customer service communication
        Delivery inquiries
        Contacting schools
        Banking support
        Medical communication

🚀 Key Features
🗣️ Chinese → English Automated Calling

Example input:

“帮我和 HR 说我想把面试改到周三下午。”

The AI transforms the Chinese instruction into professional, natural English dialogue, simulating a real phone call.

🔊 Realistic Human-like Speech

        Powered by ElevenLabs, generating clear, natural English voices.

🎙️ Real-time Speech Recognition

        Users can speak → AI transcribes → continues the conversation naturally.

🤖 AI Call Agent

A GPT-based logic module that:

        Understands background context
        Maintains consistent identity
        Responds with natural, human-like communication

📄 Multi-turn Conversation Log

       All “simulated phone call” content is recorded and displayed on the interface.

⚙️ Extensible Task Templates

Supports different automated scenarios:

    Rescheduling interviews
    Checking delivery status
    Return/refund customer service
    Medical communication
    Parent–school communication
    (More templates can be added in the future.)

📁 Project Structure (Simplified)
            ai-voice-assistant/
            ├── app/                     # Pages & UI
            ├── components/              # Chat bubbles, buttons, animations, input boxes
            ├── lib/
            │   ├── gpt/                 # GPT wrappers
            │   ├── voice/               # ElevenLabs voice functions
            │   ├── audio/               # Recording & transcription logic
            │   └── utils/               # Utility functions
            ├── ai-calls/                # Core call-engine module
            │   ├── callAgent.ts         # GPT multi-turn logic
            │   ├── callPromptBuilder.ts # Prompt builder
            │   ├── scheduler.ts         # Schedule / time handling
            │   └── templates/           # Task templates (e.g. rescheduleInterview)
            ├── public/
            ├── .env.local               # API keys
            └── README.md

🛠 Tech Stack

            Next.js (App Router)
            TypeScript
            OpenAI GPT / Realtime API
            ElevenLabs TTS & STT
            TailwindCSS
            Vercel Deployment

⚙️ Local Development
1. Install dependencies
            npm install

2. Run the development server
            npm run dev

3. Create .env.local in the project root:
            NEXT_PUBLIC_OPENAI_API_KEY=your_key
            NEXT_PUBLIC_ELEVENLABS_API_KEY=your_key
            NEXT_PUBLIC_ELEVENLABS_VOICE_ID=your_voice_id

🌱 Future Expansion

            AI “call answering” mode
            Multi-role communication (e.g., doctor ↔ parent ↔ child)
            Multi-language translation during calls
            Mobile App (iOS / Android)
            Real phone calling via Twilio / WebRTC

🧑‍💻 Author

Jack Li
17 years old · Canada 🇨🇦
Focused on AI application development, voice technologies, and intelligent agents.