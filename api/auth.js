export default async function handler(req, res) {
  const clientId = process.env.HMRC_CLIENT_ID;
  const clientSecret = process.env.HMRC_CLIENT_SECRET;
  const redirectUri = process.env.HMRC_REDIRECT_URI;

  console.log('=== AUTH HANDLER ===');
  console.log('Query:', req.query);

  if (req.query.code) {
    try {
      console.log('Exchanging code for token...');
      
      const response = await fetch('https://test-api.service.hmrc.gov.uk/oauth/token', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: req.query.code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri
        })
      });

      const data = await response.json();
      console.log('Token response status:', response.status);
      console.log('Token response:', data);

      if (data.access_token) {
        // Redirect with token in URL (more reliable than cookies)
        const redirectUrl = `/?hmrc_token=${encodeURIComponent(data.access_token)}`;
        console.log('Redirecting to:', redirectUrl);
        res.redirect(302, redirectUrl);
      } else {
        console.error('No access token received');
        res.status(400).json({ error: 'Login failed', details: data });
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      res.status(500).json({ error: error.message });
    }
  } else if (req.query.error) {
    console.error('HMRC error:', req.query);
    res.status(400).json({ error: req.query.error_description || 'Auth failed' });
  } else {
    const scope = 'excise-movement-control-system';
    const authUrl = `https://test-www.tax.service.gov.uk/oauth/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.log('Redirecting to HMRC:', authUrl);
    res.redirect(302, authUrl);
  }
}
