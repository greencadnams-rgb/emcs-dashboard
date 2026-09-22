export default async function handler(req, res) {
  const clientId = process.env.HMRC_CLIENT_ID;
  const clientSecret = process.env.HMRC_CLIENT_SECRET;
  const redirectUri = process.env.HMRC_REDIRECT_URI;
  const environment = process.env.HMRC_ENVIRONMENT || 'test';

  // Choose the correct HMRC URLs based on environment
  const isProduction = environment === 'production';
  const authBaseUrl = isProduction 
    ? 'https://www.tax.service.gov.uk' 
    : 'https://test-www.tax.service.gov.uk';
  const tokenUrl = isProduction 
    ? 'https://api.service.hmrc.gov.uk/oauth/token' 
    : 'https://test-api.service.hmrc.gov.uk/oauth/token';

  console.log(`--- AUTH HANDLER (${environment} mode) ---`);

  if (req.query.code) {
    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: req.query.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri
        })
      });

      const data = await response.json();

      if (data.access_token) {
        const redirectUrl = `/?hmrc_token=${encodeURIComponent(data.access_token)}`;
        console.log('✅ Token received, redirecting...');
        res.redirect(302, redirectUrl);
      } else {
        console.error('❌ No access token:', data);
        res.status(400).json({ error: 'Login failed', details: data });
      }
    } catch (error) {
      console.error('❌ Token exchange error:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.query.error) {
    console.error('❌ HMRC error:', req.query);
    res.status(400).json({ error: req.query.error_description || 'Auth failed' });
  } else {
    const scope = 'excise-movement-control-system';
    const authUrl = `${authBaseUrl}/oauth/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.log('🔄 Redirecting to HMRC...');
    res.redirect(302, authUrl);
  }
}
