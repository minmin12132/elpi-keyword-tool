import crypto from 'crypto';

function hmacSignature(timestamp, method, path, secretKey) {
  const message = `${timestamp}.${method}.${path}`;
  return crypto.createHmac('sha256', secretKey).update(message).digest('base64');
}

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { keywords, apiKey, secret, customerId } = req.body;

  if (!keywords || !apiKey || !secret || !customerId) {
    return res.status(400).json({ error: '필수 파라미터 누락' });
  }

  const path = '/keywordstool';
  const method = 'GET';
  const timestamp = Date.now().toString();
  const signature = hmacSignature(timestamp, method, path, secret);

  const allResults = [];

  // 5개씩 청크로 나눠서 요청
  for (let i = 0; i < keywords.length; i += 5) {
    const chunk = keywords.slice(i, i + 5);
    const params = new URLSearchParams({
      hintKeywords: chunk.join(','),
      showDetail: '1'
    });

    try {
      const response = await fetch(`https://api.searchad.naver.com${path}?${params}`, {
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-Customer': customerId,
          'X-Signature': signature
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.keywordList) {
          allResults.push(...data.keywordList);
        }
      }
    } catch (e) {
      console.error('Naver API chunk error:', e);
    }
  }

  return res.status(200).json({ keywordList: allResults });
}
