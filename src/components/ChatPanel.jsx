import React, { useRef, useEffect, useState } from 'react';

export default function ChatPanel({ project, onAsk }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!input.trim()) return;
    const q = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: q }]);
    setInput('');
    // onAsk should perform RAG call and return response text (or fallback)
    if (onAsk) {
      const resp = await onAsk(q);
      setMessages(prev => [...prev, { role: 'assistant', text: resp }]);
    } else {
      setMessages(prev => [...prev, { role: 'assistant', text: 'RAG not configured. Install API key and Netlify function.' }]);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto p-4 space-y-3 bg-gray-50 dark:bg-gray-900 rounded">
        {messages.length === 0 && <div className="text-sm text-gray-500">Ask about the project or open a PDF to parse.</div>}
        {messages.map((m, i) => (
          <div key={i} className={`max-w-[80%] p-3 rounded ${m.role === 'user' ? 'bg-blue-600 text-white ml-auto' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
            {m.text}
          </div>
        ))}
        <div ref={endRef}></div>
      </div>

      <div className="p-3 mt-3 bg-white dark:bg-gray-800 rounded flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
          className="flex-1 border rounded px-3 py-2 dark:bg-gray-700 dark:text-white" placeholder={'Ask about project - e.g., How many 8" lines?'} />
        <button onClick={send} className="px-4 py-2 rounded bg-teal-500 text-white">Send</button>
      </div>
    </div>
  );
}