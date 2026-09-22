export default async function handler(req, res) {
  const clientId = process.env.HMRC_CLIENT_ID;
  const clientSecret = process.env.HMRC_CLIENT_SECRET;
  const redirectUri = process.env.HMRC_REDIRECT_URI;

  // 1. HMRC redirected back to us with a 'code'
  if (req.query.code) {
    try {
      // Exchange the code for an access token
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
        // SUCCESS! Redirect to the homepage with the token in the URL
        const token = encodeURIComponent(data.access_token);
        res.redirect(302, `/?hmrc_token=${token}`);
      } else {
        // Show the error on screen so we know what went wrong
        res.status(400).send('HMRC Login Failed: ' + JSON.stringify(data));
      }
    } catch (error) {
      res.status(500).send('Server Error: ' + error.message);
    }
  } 
  // 2. HMRC returned an error (e.g., user denied access)
  else if (req.query.error) {
    res.status(400).send('HMRC Error: ' + req.query.error_description);
  } 
  // 3. No code yet? Send the user to HMRC to log in
  else {
    const scope = 'excise-movement-control-system';
    const authUrl = `https://test-www.tax.service.gov.uk/oauth/authorize?response_type=code&client_id=${clientId}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    res.redirect(302, authUrl);
  }
}
