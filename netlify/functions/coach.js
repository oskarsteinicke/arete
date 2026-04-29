// Northstar Coach — Netlify serverless function
// Uses Groq (free tier) — 14,400 requests/day, no credit card needed.
// Get a free key at console.groq.com, then add GROQ_API_KEY in
// Netlify → Site configuration → Environment variables.

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers,
      body: JSON.stringify({
        error: 'setup_required',
        message: 'Add your GROQ_API_KEY in Netlify → Site configuration → Environment variables, then redeploy.',
      }),
    };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { messages, system } = payload;
  if (!Array.isArray(messages) || !messages.length) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'messages array required' }) };
  }

  // Groq uses the OpenAI-compatible chat completions format
  const groqMessages = [
    { role: 'system', content: system || 'You are Northstar Coach, a helpful lifestyle coach.' },
    ...messages,
  ];

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        max_tokens: 500,
        temperature: 0.7,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers,
        body: JSON.stringify({ error: data.error?.message || 'Groq API error' }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: data.choices?.[0]?.message?.content || '' }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
