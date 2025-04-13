import { Button } from "@/components/ui/button";
//import VoiceAssistant from "./components/VoiceAssistant";
import VoiceAssistant from "./components/VoiceAssistant";




export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-50">
      <h1 className="text-4xl font-bold mb-6">AI 语音助手</h1>
      <Button className="text-lg px-6 py-3">开始语音模拟</Button>
      <VoiceAssistant />
    </main>
  );
}

