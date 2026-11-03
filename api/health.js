module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.status(200).json({ ok: true, service: 'maison-clinic-api', storageConfigured: !!process.env.DATABASE_URL });
};
