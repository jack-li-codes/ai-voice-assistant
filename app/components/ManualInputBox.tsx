import { useState } from 'react';
import { speakWithElevenLabs } from '@/lib/voice/speakWithElevenLabs';

type Props = {
  onSend?: (text: string) => void;
  setConversation?: React.Dispatch<React.SetStateAction<string[]>>;
};

function ManualInputBox({ onSend, setConversation }: Props) {
  const [manualInput, setManualInput] = useState('');

  const handleSend = async () => {
    if (!manualInput.trim()) return;

    // 语音播报
    await speakWithElevenLabs(manualInput);

    // 通知上层组件（可选）
    onSend?.(manualInput);

    // 更新对话记录
    setConversation?.((prev) => [...prev, manualInput]);

    // 清空输入框
    setManualInput('');
  };

  return (
    <div className="mt-4 border-t pt-4">
      <label className="block font-medium mb-1">人工输入（可覆盖 AI 回答）</label>
      <div className="flex gap-2">
        <input
          type="text"
          className="border rounded p-2 flex-1"
          placeholder="你想让助手说什么？"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
        />
        <button
          onClick={handleSend}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          发送
        </button>
      </div>
    </div>
  );
}

export default ManualInputBox;
