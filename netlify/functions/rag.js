const fetch = global.fetch || require('node-fetch');

exports.handler = async function(event) {
  try {
    const body = JSON.parse(event.body || '{}');
    const question = body.question || '';
    const chunks = body.chunks || [];
    const OPENAI_KEY = process.env.OPENAI_API_KEY;
    if(!OPENAI_KEY) return { statusCode:500, body: JSON.stringify({ error: 'Missing OPENAI_API_KEY' }) };

    const contextText = chunks.map(c => c.text).slice(0,8).join('\n---\n');

    const prompt = `You are an engineering assistant. Use the context below to answer precisely.
Context:
${contextText}

Question:
${question}
`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role:'user', content: prompt }], max_tokens:800 })
    });

    if(!res.ok) {
      const t = await res.text();
      return { statusCode:500, body: JSON.stringify({ error: t }) };
    }
    const j = await res.json();
    const answer = j.choices?.[0]?.message?.content || JSON.stringify(j);
    return { statusCode:200, body: JSON.stringify({ answer }) };
  } catch(err) {
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ error: err.message || String(err) }) };
  }
};