export default async function handler(req, res) {
  const clientId = process.env.HMRC_CLIENT_ID;
  const clientSecret = process.env.HMRC_CLIENT_SECRET;
  const redirectUri = process.env.HMRC_REDIRECT_URI;

  console.log('Auth handler called with query:', req.query);

  // If HMRC sends us back an authorization code
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
      console.log('Token response:', data);

      if (data.access_token) {
        // Set cookie with proper settings
        const cookieValue = `hmrc_token=${data.access_token}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=14400`;
        res.setHeader('Set-Cookie', cookieValue);
        
        console.log('Token saved, redirecting to home...');
        res.redirect(302, '/');
      } else {
        console.error('No access token in response:', data);
        res.status(400).send('Login failed: ' + JSON.stringify(data));
      }
    } catch (error) {
      console.error('Token exchange error:', error);
      res.status(500).send('Error: ' + error.message);
    }
  } 
  // If there's an error from HMRC
  else if (req.query.error) {
    console.error('HMRC auth error:', req.query);
    res.status(400).send('Auth error: ' + req.query.error_description);
  }
  // Start the OAuth flow
  else {
    const scope = 'excise-movement-control-system';
    const authUrl = `https://test-www.tax.service.gov.uk/oauth/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    console.log('Redirecting to HMRC auth:', authUrl);
    res.redirect(302, authUrl);
  }
}
