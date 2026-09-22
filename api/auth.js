export default async function handler(req, res) {
  const clientId = process.env.HMRC_CLIENT_ID;
  const clientSecret = process.env.HMRC_CLIENT_SECRET;
  const redirectUri = process.env.HMRC_REDIRECT_URI;

  // If HMRC sends us back an authorization code, exchange it for a token
  if (req.query.code) {
    const response = await fetch('https://test-api.service.hmrc.gov.uk/oauth/token', {
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
      // Store token in a secure HttpOnly cookie (expires in 4 hours)
      res.setHeader('Set-Cookie',
        `hmrc_token=${data.access_token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=14400`
      );
      res.redirect('/');
    } else {
      res.status(400).send('Login failed: ' + JSON.stringify(data));
    }
  } else {
    // No code yet — redirect user to HMRC's official login page
    const scope = 'excise-movement-control-system';
    const authUrl = `https://test-www.tax.service.gov.uk/oauth/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(authUrl);
  }
}
