const crypto = require('crypto');

function hmacSignature(timestamp, method, path, secretKey) {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }

  const { keywords, apiKey, secret, customerId } = body || {};

  if (!keywords || !apiKey || !secret || !customerId) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  const apiPath = '/keywordstool';
  const method = 'GET';
  const allResults = [];
  const errors = [];

  for (let i = 0; i < keywords.length; i += 5) {
    if (i > 0) await sleep(300);

    const chunk = keywords.slice(i, i + 5);
    const timestamp = Date.now().toString();
    const signature = hmacSignature(timestamp, method, apiPath, secret);

    // URLSearchParams 대신 직접 쿼리스트링 조립 (쉼표 인코딩 방지)
    const queryString = `hintKeywords=${encodeURIComponent(chunk.join(','))}&showDetail=1`;

    try {
      const response = await fetch(`https://api.searchad.naver.com${apiPath}?${queryString}`, {
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-Customer': customerId,
          'X-Signature': signature
        }
      });

      const text = await response.text();
      console.log(`[Naver API] chunk ${i} status:${response.status} body:${text.slice(0, 300)}`);

      if (response.ok) {
        const data = JSON.parse(text);
        if (data.keywordList) allResults.push(...data.keywordList);
      } else {
        errors.push({ status: response.status, body: text.slice(0, 300) });
      }
    } catch (e) {
      console.error('[Naver API] error:', e.message);
      errors.push({ error: e.message });
    }
  }

  console.log('[Debug] total results:', allResults.length);
  return res.status(200).json({ keywordList: allResults, errors });
};
