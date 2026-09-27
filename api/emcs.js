  // Forward specific headers from the browser
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  }
  if (req.headers['x-correlation-id']) {
    headers['x-correlation-id'] = req.headers['x-correlation-id'];
  }
  
  // HMRC sandbox requires x-client-ip header
  // Always set it to 127.0.0.1 for sandbox, or use real IP in production
  const isTest = (process.env.HMRC_ENVIRONMENT || 'test') === 'test';
  if (isTest) {
    headers['x-client-ip'] = '127.0.0.1';
  } else if (req.headers['x-client-ip']) {
    headers['x-client-ip'] = req.headers['x-client-ip'];
  }
