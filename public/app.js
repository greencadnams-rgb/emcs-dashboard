document.addEventListener('DOMContentLoaded', async function() {
  // Check if already logged in
  try {
    const res = await fetch('/api/session', { credentials: 'include' });
    if (res.ok) {
      const session = await res.json();
      if (session.authenticated) {
        showDashboard();
        updateHmrcStatus(session.hmrcAuthenticated);
        await loadProfiles();
      } else {
        showLoginScreen();
      }
    } else {
      showLoginScreen();
    }
  } catch(e) {
    console.error('Session check failed:', e);
    showLoginScreen();
  }
  
  // Login button
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async function() {
      const password = document.getElementById('password').value;
      const totpCode = document.getElementById('totp-code').value;
      
      if (!password) {
        alert('Please enter your password');
        return;
      }
      
      if (!totpCode) {
        alert('Please enter your 2FA code');
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
          await loadProfiles();
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
  
  // Setup 2FA button
  const setup2faBtn = document.getElementById('setup-2fa-btn');
  if (setup2faBtn) {
    setup2faBtn.addEventListener('click', async function() {
      const password = document.getElementById('password').value;
      if (!password) {
        alert('Please enter a password first');
        return;
      }
      
      try {
        const res = await fetch('/api/setup-2fa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        
        if (res.ok) {
          const data = await res.json();
          alert('2FA Setup Complete!\n\nSecret: ' + data.secret + '\n\nPlease save this secret and use an authenticator app to generate codes.');
        } else {
          const data = await res.json();
          alert(data.error || '2FA setup failed');
        }
      } catch(e) {
        alert('2FA setup error: ' + e.message);
      }
    });
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      showLoginScreen();
    });
  }
  
  // HMRC login button
  const hmrcLoginBtn = document.getElementById('hmrc-login-btn');
  if (hmrcLoginBtn) {
    hmrcLoginBtn.addEventListener('click', function() {
      window.location.href = '/api/auth';
    });
  }
  
  function showLoginScreen() {
    const loginScreen = document.getElementById('login-screen');
    const dashboard = document.getElementById('dashboard');
    if (loginScreen) {
      loginScreen.style.display = 'flex';
      loginScreen.style.justifyContent = 'center';
      loginScreen.style.alignItems = 'center';
      loginScreen.style.minHeight = '100vh';
    }
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
  
  async function loadProfiles() {
    try {
      const res = await fetch('/api/profiles', { credentials: 'include' });
      if (res.ok) {
        const profiles = await res.json();
        // Populate profile dropdowns
        const profileSelect = document.getElementById('active-profile-select');
        if (profileSelect) {
          profileSelect.innerHTML = '';
          profiles.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name + ' (' + p.ern + ')';
            profileSelect.appendChild(opt);
          });
        }
      }
    } catch(e) {
      console.error('Load profiles failed:', e);
    }
  }
});
