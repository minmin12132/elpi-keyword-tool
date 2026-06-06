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
  const seen = new Set();

  // 시드 키워드마다 연관 키워드 전체 수집
  for (let i = 0; i < keywords.length; i++) {
    if (i > 0) await sleep(200);

    const kw = keywords[i].replace(/\s+/g, '');
    const timestamp = Date.now().toString();
    const signature = hmacSignature(timestamp, method, apiPath, secret);
    const queryString = `hintKeywords=${encodeURIComponent(kw)}&showDetail=1`;

    try {
      const url = `https://api.searchad.naver.com${apiPath}?${queryString}`;
      console.log(`[Naver API] [${i+1}/${keywords.length}] seed: ${kw}`);

      const response = await fetch(url, {
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-Customer': customerId,
          'X-Signature': signature
        }
      });

      const text = await response.text();
      console.log(`[Naver API] status:${response.status} body:${text.slice(0, 100)}`);

      if (response.ok) {
        const data = JSON.parse(text);
        if (data.keywordList) {
          // 중복 제거하며 전체 연관 키워드 수집
          for (const item of data.keywordList) {
            if (!seen.has(item.relKeyword)) {
              seen.add(item.relKeyword);
              allResults.push(item);
            }
          }
        }
      }
    } catch (e) {
      console.error('[Naver API] error:', e.message);
    }
  }

  console.log('[Debug] total collected:', allResults.length);
  return res.status(200).json({ keywordList: allResults });
};
