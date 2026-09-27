document.addEventListener('DOMContentLoaded', async function() {
  // Show login screen by default
  showLoginScreen();
  
  // Check if already logged in
  try {
    const res = await fetch('/api/session', { credentials: 'include' });
    if (res.ok) {
      const session = await res.json();
      if (session.authenticated) {
        showDashboard();
        updateHmrcStatus(session.hmrcAuthenticated);
      }
    }
  } catch(e) {
    console.error('Session check failed:', e);
  }
  
  // Login button
  document.getElementById('login-btn').addEventListener('click', async function() {
    const password = document.getElementById('password').value;
    const totpCode = document.getElementById('totp-code').value;
    
    if (!password || !totpCode) {
      alert('Please enter password and 2FA code');
      return;
    }
    
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, totpCode })
      });
      
      if (res.ok) {
        showDashboard();
        checkHmrcStatus();
      } else {
        const data = await res.json();
        alert(data.error || 'Login failed');
      }
    } catch(e) {
      alert('Login error: ' + e.message);
    }
  });
  
  // Setup 2FA button
  document.getElementById('setup-2fa-btn').addEventListener('click', function() {
    const password = document.getElementById('password').value;
    if (!password) {
      alert('Please enter a password first');
      return;
    }
    window.location.href = '/setup-2fa?password=' + encodeURIComponent(password);
  });
  
  // Logout button
  document.getElementById('logout-btn').addEventListener('click', async function() {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    showLoginScreen();
  });
  
  // HMRC login button
  document.getElementById('hmrc-login-btn').addEventListener('click', function() {
    window.location.href = '/api/auth';
  });
  
  function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'block';
    document.getElementById('dashboard').style.display = 'none';
  }
  
  function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
  }
  
  function updateHmrcStatus(authenticated) {
    const badge = document.getElementById('hmrc-status-badge');
    if (authenticated) {
      badge.textContent = 'HMRC: Logged In';
      badge.style.backgroundColor = '#28a745';
    } else {
      badge.textContent = 'HMRC: Not Logged In';
      badge.style.backgroundColor = '#dc3545';
    }
  }
  
  async function checkHmrcStatus() {
    try {
      const res = await fetch('/api/session', { credentials: 'include' });
      if (res.ok) {
        const session = await res.json();
        updateHmrcStatus(session.hmrcAuthenticated);
      }
    } catch(e) {
      console.error('HMRC status check failed:', e);
    }
  }
});
