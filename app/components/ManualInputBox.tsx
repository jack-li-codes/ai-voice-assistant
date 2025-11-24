import { useState } from 'react';

type Props = {
  onSend?: (text: string) => void;
};

function ManualInputBox({ onSend }: Props) {
  const [manualInput, setManualInput] = useState('');

  const handleSend = () => {
    if (!manualInput.trim()) return;

    // 通知上层组件处理（生成英文 + 播报）
    onSend?.(manualInput);

    // 清空输入框
    setManualInput('');
  };

  return (
    <div className="mt-4 border-t pt-4">
      <label className="block font-medium mb-1">人工输入（可覆盖 AI 回答）</label>
      <p className="text-xs text-gray-500 mb-2">
        EN: Manual input to override or supplement the AI's reply.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          className="border rounded p-2 flex-1"
          placeholder="你想让助手说什么？ / What do you want the assistant to say?"
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
