// Test Kimi K2.5 Cloud via Ollama REST API (no npm packages needed)

async function chat(prompt) {
  const response = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kimi-k2.5:cloud',
      messages: [{ role: 'user', content: prompt }],
      stream: false
    })
  });
  return response.json();
}

const data = await chat('Hello! What can you help me with?');
console.log('Response:', data.message?.content);
console.log('\n--- Thinking Process ---');
console.log(data.message?.thinking);
