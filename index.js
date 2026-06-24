const express = require('express');
const crypto = require('crypto');
const https = require('https');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-API-KEY, X-SECRET-KEY');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
function sign(params, secret) {
  const query = new URLSearchParams(params).toString();
  return crypto.createHmac('sha256', secret).update(query).digest('hex');
}
function binanceRequest(method, path, params, apiKey, secretKey) {
  return new Promise((resolve, reject) => {
    params.timestamp = Date.now();
    params.signature = sign(params, secretKey);
    const query = new URLSearchParams(params).toString();
    const fullPath = method === 'GET' ? `${path}?${query}` : path;
    const options = {
      hostname: 'api.binance.com',
      path: fullPath,
      method,
      headers: { 'X-MBX-APIKEY': apiKey, 'Content-Type': 'application/x-www-form-urlencoded' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    if (method === 'POST') req.write(query);
    req.end();
  });
}
function binancePublic(path, params = {}) {
  return new Promise((resolve, reject) => {
    const query = new URLSearchParams(params).toString();
    const fullPath = query ? `${path}?${query}` : path;
    const options = { hostname: 'api.binance.com', path: fullPath, method: 'GET' };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}
app.get('/', (req, res) => res.json({ status: 'ok', message: 'البوت شغال ✅' }));
app.get('/api/account', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const secretKey = req.headers['x-secret-key'];
  if (!apiKey || !secretKey) return res.status(400).json({ error: 'API keys missing' });
  try {
    const data = await binanceRequest('GET', '/api/v3/account', {}, apiKey, secretKey);
    const usdt = data.balances?.find(b => b.asset === 'USDT');
    const balances = data.balances?.filter(b => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);
    res.json({ success: true, usdt, balances });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/prices', async (req, res) => {
  try {
    const tickers = await binancePublic('/api/v3/ticker/24hr');
    const coins = tickers
      .filter(t => t.symbol.endsWith('USDT') && parseFloat(t.quoteVolume) > 10000000)
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, 20)
      .map(t => ({ symbol: t.symbol, price: parseFloat(t.lastPrice), change24h: parseFloat(t.priceChangePercent), volume: parseFloat(t.quoteVolume) }));
    res.json({ success: true, coins });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/klines/:symbol', async (req, res) => {
  try {
    const data = await binancePublic('/api/v3/klines', { symbol: req.params.symbol, interval: req.query.interval || '1h', limit: req.query.limit || 100 });
    const candles = data.map(k => ({ time: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) }));
    res.json({ success: true, candles });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/order', async (req, res) => {
  const apiKey = req.headers['x-api-key'];
  const secretKey = req.headers['x-secret-key'];
  if (!apiKey || !secretKey) return res.status(400).json({ error: 'API keys missing' });
  const { symbol, side, type, quantity, price } = req.body;
  if (!symbol || !side || !type || !quantity) return res.status(400).json({ error: 'Missing params' });
  try {
    const params = { symbol, side, type, quantity };
    if (type === 'LIMIT') { params.price = price; params.timeInForce = 'GTC'; }
    const data = await binanceRequest('POST', '/api/v3/order', params, apiKey, secretKey);
    res.json({ success: true, order: data });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('✅ البوت شغال على port ' + PORT));
