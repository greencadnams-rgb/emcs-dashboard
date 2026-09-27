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
  
  // Login button - only attach if it exists
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async function() {
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
  }
  
  // Setup 2FA button - only attach if it exists
  const setup2faBtn = document.getElementById('setup-2fa-btn');
  if (setup2faBtn) {
    setup2faBtn.addEventListener('click', function() {
      const password = document.getElementById('password').value;
      if (!password) {
        alert('Please enter a password first');
        return;
      }
      window.location.href = '/setup-2fa?password=' + encodeURIComponent(password);
    });
  }
  
  // Logout button - only attach if it exists
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      showLoginScreen();
    });
  }
  
  // HMRC login button - only attach if it exists
  const hmrcLoginBtn = document.getElementById('hmrc-login-btn');
  if (hmrcLoginBtn) {
    hmrcLoginBtn.addEventListener('click', function() {
      window.location.href = '/api/auth';
    });
  }
  
  function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');
    if (loginScreen) loginScreen.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
  }
  
  function showDashboard() {
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');
    if (loginScreen) loginScreen.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
  }
  
  function updateHmrcStatus(authenticated) {
    const badge = document.getElementById('hmrc-status-badge');
    if (badge) {
      if (authenticated) {
        badge.textContent = 'HMRC: Logged In';
        badge.style.backgroundColor = '#28a745';
      } else {
        badge.textContent = 'HMRC: Not Logged In';
        badge.style.backgroundColor = '#dc3545';
      }
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
