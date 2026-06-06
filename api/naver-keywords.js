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

  // 네이버 API: 키워드 1개씩, 띄어쓰기 제거 후 호출
  for (let i = 0; i < keywords.length; i++) {
    if (i > 0) await sleep(200);

    // 띄어쓰기 제거 (네이버 API가 공백 포함 키워드를 거부함)
    const kw = keywords[i].replace(/\s+/g, '');
    const timestamp = Date.now().toString();
    const signature = hmacSignature(timestamp, method, apiPath, secret);
    const queryString = `hintKeywords=${encodeURIComponent(kw)}&showDetail=1`;

    try {
      const url = `https://api.searchad.naver.com${apiPath}?${queryString}`;
      console.log(`[Naver API] [${i+1}/${keywords.length}] keyword: ${kw}`);

      const response = await fetch(url, {
        headers: {
          'X-Timestamp': timestamp,
          'X-API-KEY': apiKey,
          'X-Customer': customerId,
          'X-Signature': signature
        }
      });

      const text = await response.text();
      console.log(`[Naver API] status:${response.status} body:${text.slice(0, 200)}`);

      if (response.ok) {
        const data = JSON.parse(text);
        // 원래 키워드와 매핑되도록 relKeyword를 원본 키워드로 덮어씀
        if (data.keywordList && data.keywordList.length > 0) {
          // 검색량이 가장 높은 결과를 원본 키워드로 매핑
          const best = data.keywordList[0];
          best.relKeyword = keywords[i]; // 원본 키워드(띄어쓰기 포함)로 복원
          allResults.push(best);
        } else {
          // 결과 없어도 키워드는 유지 (검색량 0으로)
          allResults.push({
            relKeyword: keywords[i],
            monthlyPcQcCnt: '0',
            monthlyMobileQcCnt: '0',
            compIdx: '중간'
          });
        }
      } else {
        errors.push({ keyword: kw, status: response.status, body: text.slice(0, 200) });
        // 실패한 키워드도 0으로 유지
        allResults.push({
          relKeyword: keywords[i],
          monthlyPcQcCnt: '0',
          monthlyMobileQcCnt: '0',
          compIdx: '중간'
        });
      }
    } catch (e) {
      console.error('[Naver API] error:', e.message);
      errors.push({ keyword: kw, error: e.message });
    }
  }

  console.log('[Debug] total results:', allResults.length, 'errors:', errors.length);
  return res.status(200).json({ keywordList: allResults, errors });
};
