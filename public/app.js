  async function apiCall(method, path, body) {
    const options = { method, credentials: 'include', headers: {} };
    if (body !== undefined) {
      if (typeof body === 'string') {
        options.body = body;
        options.headers['Content-Type'] = 'application/xml';
      } else {
        options.body = JSON.stringify(body);
        options.headers['Content-Type'] = 'application/json';
      }
    }
    const res = await fetch(path, options);
    
    if (res.status === 401) {
      // SMART ERROR HANDLING: Differentiate between Dashboard logout and HMRC logout
      const contentType = res.headers.get('content-type') || '';
      let isHmrcError = false;
      
      if (contentType.includes('json')) {
        try {
          const clone = res.clone();
          const data = await clone.json();
          // If it's our proxy saying HMRC token is missing, or HMRC directly saying credentials are invalid
          if (data.error === 'HMRC_NOT_AUTHENTICATED' || data.code === 'INVALID_CREDENTIALS' || (data.message && data.message.includes('Authorisation'))) {
            isHmrcError = true;
          }
        } catch(e) {}
      } else if (contentType.includes('xml') || contentType.includes('html')) {
        // HMRC sometimes returns raw XML/HTML 401 errors
        isHmrcError = true;
      }

      if (isHmrcError) {
        // Don't log out of the dashboard! Just mark HMRC as disconnected.
        updateHmrcStatus(false);
        alert('Your HMRC connection has expired or was rejected. Please click "Login to HMRC" in the top bar to reconnect.');
        throw new Error('HMRC session expired');
      }

      // Only log out of the dashboard if it's actually a dashboard session error
      showLoginScreen();
      throw new Error('Session expired');
    }
    return res;
  }
