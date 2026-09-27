// ==================== INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', async function() {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById('s-date').value = today;
  document.getElementById('s-invoice-date').value = today;

  window.monitorData = [];
  window.ie818Items = [];
  window.currentDraftId = null;
  window.profiles = [];
  window.activeProfileId = null;

  // Clean OAuth redirect URL
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('authenticated') === '1') {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  // ==================== CONSTANTS ====================
  const MESSAGE_TYPE_NAMES = {
    'IE801': 'Acceptance (ARC Issued)', 'IE802': 'Acceptance Rejected',
    'IE803': 'Change of Destination (Alt)', 'IE807': 'Movement Interrupted',
    'IE810': 'Cancellation', 'IE813': 'Change of Destination',
    'IE818': 'Report of Receipt', 'IE819': 'Alert or Rejection',
    'IE837': 'Explanation of Delay', 'IE838': 'Delay Explanation Accepted',
    'IE839': 'Customs Rejection', 'IE871': 'Reason for Shortage',
    'IE881': 'Manual Closure', 'IE905': 'Status Response'
  };
  const TERMINAL_STATES = ['IE810', 'IE818', 'IE819', 'IE839', 'IE881'];
  const CN_CODES = {
    'B000': '22030001', 'W200': '22042142', 'W300': '22041011',
    'I000': '22042999', 'S200': '22089091', 'S300': '22071000',
    'T200': '24022010', 'T300': '24021000', 'E410': '27101231', 'E420': '27101211'
  };
  const PACKAGE_CODES = [
    { code: 'BA', name: 'Barrel' }, { code: 'BB', name: 'Bobbin' }, { code: 'BD', name: 'Board' },
    { code: 'BE', name: 'Bundle' }, { code: 'BG', name: 'Bag' }, { code: 'BI', name: 'Bin' },
    { code: 'BJ', name: 'Bucket' }, { code: 'BK', name: 'Basket' }, { code: 'BL', name: 'Bale' },
    { code: 'BO', name: 'Bottle' }, { code: 'BX', name: 'Box' }, { code: 'CA', name: 'Can' },
    { code: 'CB', name: 'Crate' }, { code: 'CC', name: 'Carrying case' }, { code: 'CF', name: 'Coffer' },
    { code: 'CI', name: 'Canister' }, { code: 'CK', name: 'Cask' }, { code: 'CL', name: 'Coil' },
    { code: 'CM', name: 'Card' }, { code: 'CN', name: 'Container' }, { code: 'CO', name: 'Carboy' },
    { code: 'CS', name: 'Case' }, { code: 'CT', name: 'Carton' }, { code: 'CU', name: 'Cup' },
    { code: 'CV', name: 'Cover' }, { code: 'CX', name: 'Chest' }, { code: 'CY', name: 'Cylinder' },
    { code: 'DR', name: 'Drum' }, { code: 'DS', name: 'Display' }, { code: 'EN', name: 'Envelope' },
    { code: 'FB', name: 'Flexible bag' }, { code: 'FI', name: 'Firkin' }, { code: 'FL', name: 'Flask' },
    { code: 'GI', name: 'Girder' }, { code: 'KG', name: 'Keg (large)' }, { code: 'KE', name: 'Keg' },
    { code: 'NE', name: 'Unpacked' }, { code: 'NS', name: 'Nest' }, { code: 'OT', name: 'Other' },
    { code: 'OU', name: 'Container, outer' }, { code: 'PK', name: 'Package' }, { code: 'PL', name: 'Pail' },
    { code: 'PU', name: 'Tray pack' }, { code: 'PX', name: 'Pallet' }, { code: 'PZ', name: 'Pallet box' },
    { code: 'RL', name: 'Reel' }, { code: 'RO', name: 'Roll' }, { code: 'SC', name: 'Sachet' },
    { code: 'SK', name: 'Skein' }, { code: 'SL', name: 'Slab' }, { code: 'SM', name: 'Sheet' },
    { code: 'ST', name: 'Sheet' }, { code: 'SU', name: 'Suitcase' }, { code: 'TB', name: 'Tub' },
    { code: 'TC', name: 'Tube container' }, { code: 'TD', name: 'Tube' }, { code: 'TG', name: 'Tank container' },
    { code: 'TK', name: 'Tank' }, { code: 'TN', name: 'Tin' }, { code: 'TR', name: 'Trunk' },
    { code: 'TS', name: 'Tins' }, { code: 'TU', name: 'Tube' }, { code: 'UN', name: 'Unit' },
    { code: 'VG', name: 'Bulk, gas' }, { code: 'VI', name: 'Vial' }, { code: 'VR', name: 'Bulk, liquid' },
    { code: 'VO', name: 'Bulk, solid' }, { code: 'XE', name: 'Bin pallet' }
  ];

  // ==================== API HELPERS ====================
  // Robust response parser - handles both JSON and plain text errors
  async function parseResponse(res) {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        return await res.json();
      } catch (e) {
        return { error: 'Failed to parse JSON response' };
      }
    } else {
      const text = await res.text();
      return { error: text || 'Unknown server error' };
    }
  }

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
      showLoginScreen();
      throw new Error('Session expired');
    }
    return res;
  }

  async function hmrcCall(method, endpoint, body) {
    return await apiCall(method, `/api/emcs?endpoint=${encodeURIComponent(endpoint)}`, body);
  }

  // ==================== SESSION ====================
  async function checkSession() {
    try {
      const res = await fetch('/api/session', { credentials: 'include' });
      const data = await parseResponse(res);
      if (data.error && !data.authenticated) {
        return { authenticated: false, hmrcAuthenticated: false };
      }
      return data;
    } catch (e) {
      return { authenticated: false, hmrcAuthenticated: false };
    }
  }

  function showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('dashboard').style.display = 'none';
  }

  function showDashboard() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
  }

  function updateHmrcStatus(authenticated) {
    const el = document.getElementById('hmrc-status');
    if (authenticated) {
      el.innerText = 'HMRC: Logged In';
      el.className = 'token-status token-ok';
    } else {
      el.innerText = 'HMRC: Not Logged In';
      el.className = 'token-status token-missing';
    }
  }

  // Initial session check (non-blocking)
  try {
    const sessionData = await checkSession();
    if (sessionData.authenticated) {
      showDashboard();
      updateHmrcStatus(sessionData.hmrcAuthenticated);
      await loadProfiles();
      await loadDrafts();
    } else {
      showLoginScreen();
    }
  } catch (e) {
    showLoginScreen();
  }

  // Inactivity timeout (30 minutes)
  let inactivityTimer;
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(async () => {
      alert('Session expired due to inactivity. Please log in again.');
      try {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      } catch (e) {}
      window.location.reload();
    }, 30 * 60 * 1000);
  }
  ['click', 'keydown', 'mousemove'].forEach(evt => document.addEventListener(evt, resetInactivityTimer));
  resetInactivityTimer();

  // ==================== LOGIN ====================
  document.getElementById('login-btn').addEventListener('click', async function() {
    const loginBtn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    errorEl.innerText = '';

    try {
      const res = await fetch('/api/protect', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: document.getElementById('password').value,
          totpCode: document.getElementById('totp-code').value
        })
      });

      const data = await parseResponse(res);

      if (data.requires2FA) {
        document.getElementById('totp-code').style.display = 'block';
        errorEl.innerText = 'Enter your 2FA code';
        document.getElementById('totp-code').focus();
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
        return;
      }
      if (res.ok && data.success) {
        showDashboard();
        const s = await checkSession();
        updateHmrcStatus(s.hmrcAuthenticated);
        await loadProfiles();
        await loadDrafts();
      } else {
        // Show the error message from server, cleaned up
        let errorMsg = data.error || 'Login failed';
        if (typeof errorMsg === 'string' && errorMsg.length > 200) {
          errorMsg = errorMsg.substring(0, 200) + '...';
        }
        errorEl.innerText = errorMsg;
      }
    } catch (err) {
      errorEl.innerText = 'Network error: ' + err.message;
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  });

  document.getElementById('logout-link').addEventListener('click', async function(e) {
    e.preventDefault();
    try {
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {}
    window.location.reload();
  });

  document.getElementById('hmrc-login-link').addEventListener('click', function(e) {
    e.preventDefault();
    window.location.href = '/api/auth';
  });

  document.getElementById('setup-2fa-btn').addEventListener('click', async function() {
    try {
      const res = await fetch('/api/setup-2fa', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const data = await parseResponse(res);
        if (data.secret) {
          document.getElementById('2fa-setup').style.display = 'block';
          document.getElementById('qr-code').src = data.qrCode;
          document.getElementById('secret-text').innerText = data.secret;
          window._tempSecret = data.secret;
        } else {
          alert('Failed to get 2FA secret: ' + (data.error || 'Unknown error'));
        }
      } else {
        alert('Please login first.');
      }
    } catch (err) {
      alert('Network error during 2FA setup: ' + err.message);
    }
  });

  document.getElementById('verify-2fa-btn').addEventListener('click', async function() {
    try {
      const res = await fetch('/api/setup-2fa', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: window._tempSecret, token: document.getElementById('verify-code').value })
      });
      const data = await parseResponse(res);
      if (data.success) {
        document.getElementById('2fa-result').innerHTML = '<span class="success">✅ Verified! Add this to Vercel env var TOTP_SECRET: <code>' + data.secret + '</code></span>';
      } else {
        document.getElementById('2fa-result').innerHTML = '<span class="error">❌ ' + (data.error || 'Verification failed') + '</span>';
      }
    } catch (err) {
      document.getElementById('2fa-result').innerHTML = '<span class="error">Network error: ' + err.message + '</span>';
    }
  });

  // ==================== TABS ====================
  document.querySelectorAll('.nav-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById(this.getAttribute('data-tab')).classList.add('active');
      this.classList.add('active');
      if (this.getAttribute('data-tab') === 'tab-monitor') fetchMonitorData();
    });
  });

  // ==================== PARSING HELPERS ====================
  function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function extractXmlValue(xml, tagName) {
    if (!xml) return null;
    const patterns = [
      new RegExp('<[^:>]+:' + tagName + '[^>]*>([^<]*)</[^:>]+:' + tagName + '>'),
      new RegExp('<' + tagName + '[^>]*>([^<]*)</' + tagName + '>')
    ];
    for (let i = 0; i < patterns.length; i++) {
      const match = xml.match(patterns[i]);
      if (match) return match[1];
    }
    return null;
  }

  function extractAllXmlValues(xml, tagName) {
    if (!xml) return [];
    const results = [];
    const patterns = [
      new RegExp('<[^:>]+:' + tagName + '[^>]*>([^<]*)</[^:>]+:' + tagName + '>', 'g'),
      new RegExp('<' + tagName + '[^>]*>([^<]*)</' + tagName + '>', 'g')
    ];
    for (let i = 0; i < patterns.length; i++) {
      let match;
      while ((match = patterns[i].exec(xml)) !== null) results.push(match[1]);
      if (results.length > 0) return results;
    }
    return results;
  }

  function renderField(label, value, valueClass) {
    if (value === null || value === undefined || value === '') return '';
    const cls = valueClass ? ' class="' + valueClass + '"' : '';
    return '<div class="parsed-field"><div class="label">' + escapeHtml(label) + '</div><div class="value"' + cls + '>' + escapeHtml(value) + '</div></div>';
  }

  function renderMovementParsed(data) {
    if (!data) return '<p style="color:#666;">No data to display.</p>';
    let html = '<div class="parsed-card"><h4>Movement Summary <span class="type-badge">IE815</span></h4><div class="parsed-grid">';
    html += renderField('Movement ID', data.movementId);
    html += renderField('ARC', data.administrativeReferenceCode, 'arc');
    html += renderField('LRN', data.localReferenceNumber);
    html += renderField('Consignor ERN', data.consignorId);
    html += renderField('Consignee ERN', data.consigneeId);
    html += renderField('Last Updated', data.lastUpdated);
    html += renderField('Box ID', data.boxId);
    html += '</div></div>';
    return html;
  }

  function renderMessagesParsed(msgs) {
    if (!msgs || !Array.isArray(msgs) || msgs.length === 0) {
      return '<p style="color:#666;">No messages found for this movement.</p>';
    }
    let html = '';
    msgs.forEach(function(m) {
      const xml = m.decodedXml || '';
      const type = m.messageType || 'Unknown';
      const typeName = MESSAGE_TYPE_NAMES[type] || type;
      const typeClass = type.toLowerCase();
      html += '<div class="parsed-card">';
      html += '<h4>' + escapeHtml(type) + ' — ' + escapeHtml(typeName) + ' <span class="type-badge ' + typeClass + '">' + escapeHtml(type) + '</span></h4>';
      html += '<div class="parsed-grid">';
      html += renderField('Message ID', m.messageId || extractXmlValue(xml, 'MessageIdentifier'));
      html += renderField('ARC', extractXmlValue(xml, 'AdministrativeReferenceCode'), 'arc');
      html += renderField('LRN', extractXmlValue(xml, 'LocalReferenceNumber'));
      html += renderField('Received', m.createdOn);
      html += renderField('Consignor ERN', extractXmlValue(xml, 'TraderExciseNumber'));
      html += renderField('Consignee ID', extractXmlValue(xml, 'Traderid'));
      html += renderField('Product Code', extractXmlValue(xml, 'ExciseProductCode'));
      html += renderField('Quantity', extractXmlValue(xml, 'Quantity'));
      html += '</div>';
      html += '<details class="raw-toggle" style="margin-top:10px;"><summary>📄 Show Raw XML</summary><pre>' + escapeHtml(xml) + '</pre></details>';
      html += '</div>';
    });
    return html;
  }

  function renderSingleMessageParsed(xml) {
    if (!xml) return '<p style="color:#666;">No XML data to display.</p>';
    const typeMatch = xml.match(/<[^:>]+:(IE\d{3})/);
    const type = typeMatch ? typeMatch[1] : 'Unknown';
    const typeName = MESSAGE_TYPE_NAMES[type] || type;
    const typeClass = type.toLowerCase();
    let html = '<div class="parsed-card">';
    html += '<h4>' + escapeHtml(type) + ' — ' + escapeHtml(typeName) + ' <span class="type-badge ' + typeClass + '">' + escapeHtml(type) + '</span></h4>';
    html += '<div class="parsed-grid">';
    html += renderField('Message Sender', extractXmlValue(xml, 'MessageSender'));
    html += renderField('Message Recipient', extractXmlValue(xml, 'MessageRecipient'));
    html += renderField('Message Identifier', extractXmlValue(xml, 'MessageIdentifier'));
    html += renderField('ARC', extractXmlValue(xml, 'AdministrativeReferenceCode'), 'arc');
    html += renderField('LRN', extractXmlValue(xml, 'LocalReferenceNumber'));
    html += renderField('Sequence Number', extractXmlValue(xml, 'SequenceNumber'));
    html += renderField('Consignor ERN', extractXmlValue(xml, 'TraderExciseNumber'));
    html += renderField('Consignee ID', extractXmlValue(xml, 'Traderid'));
    html += renderField('Product Code', extractXmlValue(xml, 'ExciseProductCode'));
    html += renderField('Quantity', extractXmlValue(xml, 'Quantity'));
    html += renderField('Gross Mass', extractXmlValue(xml, 'GrossMass'));
    html += renderField('Net Mass', extractXmlValue(xml, 'NetMass'));
    const transportUnits = extractAllXmlValues(xml, 'IdentityOfTransportUnits');
    if (transportUnits.length > 0) html += renderField('Transport Units', transportUnits.join(', '));
    html += '</div></div>';
    return html;
  }

  function renderPrevalidateParsed(data) {
    if (!data) return '';
    let html = '<div class="parsed-card"><h4>Trader Validation Result</h4><div class="parsed-grid">';
    html += renderField('ERN', data.exciseRegistrationNumber);
    html += renderField('Entity Group', data.entityGroup);
    html += renderField('Valid Trader', data.validTrader ? '✅ YES' : '❌ NO', data.validTrader ? '' : 'warn');
    html += renderField('Trader Type', data.traderType);
    if (data.validateProductAuthorisationResponse) {
      html += renderField('Product Authorised', data.validateProductAuthorisationResponse.valid ? '✅ YES' : '❌ NO', data.validateProductAuthorisationResponse.valid ? '' : 'warn');
    }
    html += '</div></div>';
    return html;
  }

  // ==================== PROFILES ====================
  async function loadProfiles() {
    try {
      const res = await apiCall('GET', '/api/profiles');
      const data = await parseResponse(res);
      if (Array.isArray(data)) {
        window.profiles = data;
      } else {
        window.profiles = [];
      }
      renderProfileDropdown();
      renderProfileChips();
      applyProfileToForms();
    } catch (e) {
      console.error('Failed to load profiles:', e);
    }
  }

  function renderProfileDropdown() {
    const sel = document.getElementById('active-profile-select');
    sel.innerHTML = window.profiles.map(function(p) {
      const selected = (p.id === window.activeProfileId) ? ' selected' : '';
      return '<option value="' + p.id + '"' + selected + '>' + escapeHtml(p.name) + ' (' + escapeHtml(p.ern || 'no ERN') + ')</option>';
    }).join('');
  }

  function renderProfileChips() {
    const container = document.getElementById('profile-chips');
    if (window.profiles.length === 0) {
      container.innerHTML = '<p style="color:#666;">No profiles yet.</p>';
      return;
    }
    container.innerHTML = window.profiles.map(function(p) {
      const activeClass = (p.id === window.activeProfileId) ? ' active' : '';
      return '<div class="profile-chip' + activeClass + '" data-id="' + p.id + '">' +
        '<span class="load-prof">' + escapeHtml(p.name) + ' (' + escapeHtml(p.ern || 'no ERN') + ') - ' + escapeHtml(p.type) + '</span>' +
        '<span class="del-prof" data-id="' + p.id + '" title="Delete">✕</span></div>';
    }).join('');

    container.querySelectorAll('.load-prof').forEach(function(el) {
      el.addEventListener('click', function() {
        const id = parseInt(this.parentElement.getAttribute('data-id'));
        window.activeProfileId = id;
        applyProfileToForms();
        renderProfileDropdown();
        renderProfileChips();
      });
    });
    container.querySelectorAll('.del-prof').forEach(function(el) {
      el.addEventListener('click', async function(e) {
        e.stopPropagation();
        const id = parseInt(this.getAttribute('data-id'));
        if (window.profiles.length <= 1) { alert('You must have at least one profile.'); return; }
        if (!confirm('Delete this profile?')) return;
        try {
          await apiCall('DELETE', '/api/profiles?id=' + id);
        } catch (e) {}
        if (window.activeProfileId === id) window.activeProfileId = null;
        await loadProfiles();
      });
    });
  }

  function applyProfileToForms() {
    if (!window.activeProfileId && window.profiles.length > 0) {
      window.activeProfileId = window.profiles[0].id;
    }
    const p = window.profiles.find(x => x.id === window.activeProfileId);
    if (!p) return;
    if (p.type === 'consignor') {
      document.getElementById('s-consignor-ern').value = p.ern || '';
      document.getElementById('s-consignor-name').value = p.traderName || '';
      document.getElementById('s-consignor-street').value = p.street || '';
      document.getElementById('s-consignor-postcode').value = p.postcode || '';
      document.getElementById('s-consignor-city').value = p.city || '';
      document.getElementById('s-dispatch-office').value = p.office || '';
    } else {
      document.getElementById('s-consignee-ern').value = p.ern || '';
      document.getElementById('s-consignee-name').value = p.traderName || '';
      document.getElementById('s-consignee-street').value = p.street || '';
      document.getElementById('s-consignee-postcode').value = p.postcode || '';
      document.getElementById('s-consignee-city').value = p.city || '';
    }
  }

  document.getElementById('active-profile-select').addEventListener('change', function() {
    window.activeProfileId = parseInt(this.value);
    applyProfileToForms();
    renderProfileChips();
  });

  document.getElementById('create-profile-btn').addEventListener('click', async function() {
    const name = document.getElementById('prof-name').value.trim();
    const ern = document.getElementById('prof-ern').value.trim();
    if (!name || !ern) { alert('Name and ERN are required.'); return; }
    if (!/^[A-Z]{2}[A-Z0-9]{11}$/.test(ern)) { alert('Invalid ERN format (e.g., GBWK002281023).'); return; }
    try {
      await apiCall('POST', '/api/profiles', {
        name,
        type: document.getElementById('prof-type').value,
        ern,
        traderName: document.getElementById('prof-trader-name').value,
        street: document.getElementById('prof-street').value,
        postcode: document.getElementById('prof-postcode').value,
        city: document.getElementById('prof-city').value,
        office: document.getElementById('prof-office').value
      });
      ['prof-name', 'prof-ern', 'prof-trader-name', 'prof-street', 'prof-postcode', 'prof-city'].forEach(id => document.getElementById(id).value = '');
      await loadProfiles();
      alert('Profile created!');
    } catch (e) {
      alert('Failed to create profile: ' + e.message);
    }
  });

  // ==================== DRAFTS ====================
  async function loadDrafts() {
    try {
      const res = await apiCall('GET', '/api/drafts');
      const data = await parseResponse(res);
      const drafts = Array.isArray(data) ? data : [];
      renderDrafts(drafts);
    } catch (e) {
      console.error('Failed to load drafts:', e);
    }
  }

  function renderDrafts(drafts) {
    const section = document.getElementById('drafts-section');
    const container = document.getElementById('draft-list');
    const countEl = document.getElementById('draft-count');
    if (!drafts || drafts.length === 0) {
      section.style.display = 'none';
      return;
    }
    section.style.display = 'block';
    countEl.textContent = drafts.length + ' draft' + (drafts.length !== 1 ? 's' : '') + ' saved';
    container.innerHTML = drafts.map(function(d) {
      const isActive = window.currentDraftId === d.id;
      const borderStyle = isActive ? 'border-left-color:#005ea5;' : '';
      const data = d.data || {};
      const itemsCount = (data.goodsItems || []).length;
      return '<div class="draft-card" style="' + borderStyle + '">' +
        '<div class="draft-info">' +
          '<div class="draft-name">' + escapeHtml(d.name) + (isActive ? ' <span style="color:#00703c; font-size:11px;">(loaded)</span>' : '') + '</div>' +
          '<div class="draft-meta">' +
            '<span>📅 ' + new Date(d.created).toLocaleString() + '</span>' +
            '<span>🏭 ' + escapeHtml((data.formData || {})['s-consignor-ern'] || '—') + '</span>' +
            '<span>→ ' + escapeHtml((data.formData || {})['s-consignee-ern'] || '—') + '</span>' +
            '<span>📦 ' + itemsCount + ' item' + (itemsCount !== 1 ? 's' : '') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="draft-actions">' +
          '<button class="btn-small btn-green" onclick="window._loadDraft(\'' + d.id + '\')">Load</button>' +
          '<button class="btn-small btn-orange" onclick="window._submitDraft(\'' + d.id + '\')">Submit</button>' +
          '<button class="btn-small btn-red" onclick="window._deleteDraft(\'' + d.id + '\')">Delete</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window._loadDraft = async function(id) {
    try {
      const res = await apiCall('GET', '/api/drafts');
      const drafts = await parseResponse(res);
      const draft = (Array.isArray(drafts) ? drafts : []).find(d => d.id === id);
      if (!draft) { alert('Draft not found.'); return; }
      if (window.currentDraftId && window.currentDraftId !== id) {
        if (!confirm('Another draft is loaded. Replace it?')) return;
      }
      applyDraftData(draft.data);
      window.currentDraftId = id;
      await loadDrafts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      alert('Failed to load draft: ' + e.message);
    }
  };

  window._deleteDraft = async function(id) {
    if (!confirm('Delete this draft?')) return;
    try {
      await apiCall('DELETE', '/api/drafts?id=' + id);
    } catch (e) {}
    if (window.currentDraftId === id) window.currentDraftId = null;
    await loadDrafts();
  };

  window._submitDraft = async function(id) {
    if (!confirm('Load this draft and submit it to HMRC?')) return;
    await window._loadDraft(id);
    setTimeout(() => document.getElementById('submit-movement-btn').click(), 300);
  };

  function applyDraftData(data) {
    if (!data) return;
    if (data.formData) {
      Object.keys(data.formData).forEach(function(id) {
        const el = document.getElementById(id);
        if (el) el.value = data.formData[id];
      });
    }
    const tuContainer = document.getElementById('transport-units-container');
    tuContainer.innerHTML = '';
    if (data.transportUnits && data.transportUnits.length > 0) {
      data.transportUnits.forEach((tu, idx) => addTransportUnit(tu.unitCode, tu.identity, idx + 1));
    } else {
      addTransportUnit('1', '', 1);
    }
    if (data.goodsItems && data.goodsItems.length > 0) {
      renderGoodsItems(data.goodsItems.length, data.goodsItems);
    } else {
      renderGoodsItems(1);
    }
  }

  function captureFormData() {
    const fieldIds = [
      's-dest-type', 's-journey-time', 's-transport-arrangement',
      's-consignor-ern', 's-consignor-name', 's-consignor-street', 's-consignor-street-num',
      's-consignor-postcode', 's-consignor-city',
      's-dispatch-warehouse', 's-dispatch-name', 's-dispatch-street', 's-dispatch-street-num',
      's-dispatch-postcode', 's-dispatch-city',
      's-consignee-ern', 's-consignee-name', 's-consignee-street', 's-consignee-street-num',
      's-consignee-postcode', 's-consignee-city',
      's-delivery-trader-id', 's-delivery-name', 's-delivery-street', 's-delivery-street-num',
      's-delivery-postcode', 's-delivery-city',
      's-lrn', 's-invoice-number', 's-invoice-date', 's-origin-type', 's-date', 's-time',
      's-dispatch-office', 's-guarantor-type', 's-transport-mode',
      's-transporter-vat', 's-transporter-name', 's-transporter-city'
    ];
    const formData = {};
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) formData[id] = el.value;
    });
    const transportUnits = [];
    document.querySelectorAll('#transport-units-container .transport-unit-field').forEach(unit => {
      transportUnits.push({
        unitCode: unit.querySelector('.s-transport-unit-code').value,
        identity: unit.querySelector('.s-identity-transport').value
      });
    });
    const goodsItems = [];
    document.querySelectorAll('#goods-items-container .item-field').forEach(item => {
      goodsItems.push({
        productCode: item.querySelector('.s-product-code').value,
        cnCode: item.querySelector('.s-cn-code').value,
        qty: item.querySelector('.s-qty').value,
        gross: item.querySelector('.s-weight').value,
        net: item.querySelector('.s-net-weight').value,
        abv: item.querySelector('.s-abv').value,
        commDesc: item.querySelector('.s-comm-desc').value,
        brand: item.querySelector('.s-brand').value,
        pkgKind: item.querySelector('.s-package-kind').value,
        pkgCount: item.querySelector('.s-package-count').value,
        bulk: item.querySelector('.s-bulk').checked,
        shipMark: item.querySelector('.s-ship-mark').value,
        seal: item.querySelector('.s-seal').value,
        smallProducer: item.querySelector('.s-small-producer').checked
      });
    });
    return { formData, transportUnits, goodsItems };
  }

  document.getElementById('save-draft-btn').addEventListener('click', async function() {
    const name = prompt('Enter a name for this draft:', 'Draft ' + new Date().toLocaleDateString());
    if (!name) return;
    const data = captureFormData();
    try {
      await apiCall('POST', '/api/drafts', {
        name: name.trim(),
        data,
        id: window.currentDraftId
      });
      await loadDrafts();
      alert('Draft saved.');
    } catch (e) {
      alert('Failed to save draft: ' + e.message);
    }
  });

  // ==================== GOODS ITEMS ====================
  function buildPackageOptions(selected) {
    return PACKAGE_CODES.map(function(p) {
      const sel = (p.code === selected) ? ' selected' : '';
      return '<option value="' + p.code + '"' + sel + '>' + p.code + ' - ' + p.name + '</option>';
    }).join('');
  }

  function updateItemFieldVisibility(item) {
    const pc = item.querySelector('.s-product-code').value.toUpperCase();
    const abvField = item.querySelector('.s-abv').parentElement;
    const alcoholCodes = ['B000', 'W200', 'W300', 'I000', 'S200', 'S300', 'S400', 'S500'];
    abvField.style.display = alcoholCodes.includes(pc) ? 'block' : 'none';
  }

  function autoFillCNCode(item) {
    const pc = item.querySelector('.s-product-code').value.toUpperCase();
    if (CN_CODES[pc]) item.querySelector('.s-cn-code').value = CN_CODES[pc];
  }

  function bindItemEvents(item) {
    item.querySelector('.s-product-code').addEventListener('change', function() {
      autoFillCNCode(this.closest('.item-field'));
      updateItemFieldVisibility(this.closest('.item-field'));
    });
    item.querySelector('.s-bulk').addEventListener('change', function() {
      const p = this.closest('.item-field');
      const netField = p.querySelector('.s-net-weight');
      if (this.checked) { netField.value = p.querySelector('.s-weight').value; netField.disabled = true; }
      else { netField.disabled = false; }
    });
    item.querySelector('.s-weight').addEventListener('input', function() {
      const p = this.closest('.item-field');
      if (p.querySelector('.s-bulk').checked) p.querySelector('.s-net-weight').value = this.value;
    });
    item.querySelector('.collapse-btn').addEventListener('click', function() {
      const it = this.closest('.item-field');
      it.classList.toggle('collapsed');
      this.textContent = it.classList.contains('collapsed') ? '▶' : '▼';
    });
    item.querySelector('.remove-btn').addEventListener('click', function() {
      this.closest('.item-field').remove();
      renumberItems();
    });
    updateItemFieldVisibility(item);
  }

  function renumberItems() {
    const items = document.querySelectorAll('#goods-items-container .item-field');
    items.forEach(function(it, idx) {
      it.setAttribute('data-item', idx + 1);
      const h4 = it.querySelector('h4');
      if (h4) h4.textContent = 'Item ' + (idx + 1);
    });
  }

  function createItemElement(idx, data) {
    const it = data || {};
    const div = document.createElement('div');
    div.className = 'item-field';
    div.setAttribute('data-item', idx);
    div.innerHTML =
      '<div class="item-header"><h4>Item ' + idx + '</h4>' +
        '<div class="item-actions">' +
          '<button type="button" class="btn-small collapse-btn">▼</button>' +
          '<button type="button" class="btn-small btn-red remove-btn">✕ Remove</button>' +
        '</div></div>' +
      '<div class="form-grid">' +
        '<div class="field"><label>Excise Product Code <span class="required-asterisk">*</span></label><input type="text" class="s-product-code" value="' + (it.productCode || 'B000') + '" pattern="^[A-Z][0-9]{3}$" maxlength="4" required></div>' +
        '<div class="field"><label>CN Code <span class="required-asterisk">*</span></label><input type="text" class="s-cn-code" value="' + (it.cnCode || '22030001') + '" pattern="^\\d{8}$" maxlength="8" required></div>' +
        '<div class="field"><label>Quantity <span class="required-asterisk">*</span></label><input type="number" class="s-qty" value="' + (it.qty || 2000) + '" step="0.001" required></div>' +
        '<div class="field"><label>Bulk Movement</label><input type="checkbox" class="s-bulk" style="width:auto; margin-top:10px;"' + (it.bulk ? ' checked' : '') + '></div>' +
        '<div class="field"><label>Gross Mass (kg) <span class="required-asterisk">*</span></label><input type="number" class="s-weight" value="' + (it.gross || 20000) + '" step="0.000001" required></div>' +
        '<div class="field"><label>Net Mass (kg) <span class="required-asterisk">*</span></label><input type="number" class="s-net-weight" value="' + (it.net || 19999) + '" step="0.000001" required></div>' +
        '<div class="field"><label>Commercial Description <span class="required-asterisk">*</span></label><input type="text" class="s-comm-desc" value="' + escapeHtml(it.commDesc || '') + '" required></div>' +
        '<div class="field"><label>Brand Name</label><input type="text" class="s-brand" value="' + escapeHtml(it.brand || '') + '"></div>' +
        '<div class="field"><label>ABV %</label><input type="number" class="s-abv" value="' + (it.abv !== undefined ? it.abv : 5.0) + '" step="0.01"></div>' +
        '<div class="field"><label>Kind of Packages <span class="required-asterisk">*</span></label><select class="s-package-kind" required>' + buildPackageOptions(it.pkgKind || 'BA') + '</select></div>' +
        '<div class="field"><label>Number of Packages <span class="required-asterisk">*</span></label><input type="number" class="s-package-count" value="' + (it.pkgCount !== undefined ? it.pkgCount : 2) + '" min="0" required></div>' +
        '<div class="field"><label>Shipping Mark</label><input type="text" class="s-ship-mark" value="' + escapeHtml(it.shipMark || '') + '" placeholder="Optional"></div>' +
        '<div class="field"><label>Commercial Seal ID</label><input type="text" class="s-seal" value="' + escapeHtml(it.seal || '') + '" placeholder="Optional"></div>' +
        '<div class="field" style="grid-column: 1 / -1;"><label style="display:flex; align-items:center; gap:8px;"><input type="checkbox" class="s-small-producer" style="width:auto;"' + (it.smallProducer ? ' checked' : '') + '> Independent Small Producer Declaration</label></div>' +
      '</div>';
    return div;
  }

  function renderGoodsItems(count, existingItems) {
    const container = document.getElementById('goods-items-container');
    container.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const it = (existingItems && existingItems[i-1]) || {};
      const div = createItemElement(i, it);
      container.appendChild(div);
      bindItemEvents(div);
    }
    if (existingItems) {
      existingItems.forEach(function(it, idx) {
        if (it.bulk) {
          const item = container.children[idx];
          if (item) {
            const netField = item.querySelector('.s-net-weight');
            if (netField) { netField.value = item.querySelector('.s-weight').value; netField.disabled = true; }
          }
        }
      });
    }
  }
  renderGoodsItems(1);

  document.getElementById('add-goods-item-btn').addEventListener('click', function() {
    const container = document.getElementById('goods-items-container');
    const newIdx = container.children.length + 1;
    const div = createItemElement(newIdx, {});
    container.appendChild(div);
    bindItemEvents(div);
  });

  // ==================== TRANSPORT UNITS ====================
  function addTransportUnit(unitCode, identity, idx) {
    const container = document.getElementById('transport-units-container');
    const newUnit = document.createElement('div');
    newUnit.className = 'transport-unit-field';
    newUnit.setAttribute('data-unit', idx);
    newUnit.innerHTML = '<h4>Transport Unit ' + idx + ' <button type="button" class="btn-red btn-small remove-unit-btn" style="float:right;">Remove</button></h4>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Transport Unit Code <span class="required-asterisk">*</span></label>' +
      '<select class="s-transport-unit-code" required>' +
      '<option value="1"' + (unitCode === '1' ? ' selected' : '') + '>1 - Container</option>' +
      '<option value="2"' + (unitCode === '2' ? ' selected' : '') + '>2 - Vehicle</option>' +
      '<option value="3"' + (unitCode === '3' ? ' selected' : '') + '>3 - Trailer</option>' +
      '<option value="4"' + (unitCode === '4' ? ' selected' : '') + '>4 - Tractor</option>' +
      '</select></div>' +
      '<div class="field"><label>Identity <span class="required-asterisk">*</span></label>' +
      '<input type="text" class="s-identity-transport" value="' + escapeHtml(identity || '') + '" maxlength="35" required></div>' +
      '</div>';
    container.appendChild(newUnit);
    newUnit.querySelector('.remove-unit-btn').addEventListener('click', function() {
      newUnit.remove();
      renumberTransportUnits();
    });
  }

  function renumberTransportUnits() {
    const units = document.querySelectorAll('#transport-units-container .transport-unit-field');
    units.forEach(function(u, idx) {
      u.setAttribute('data-unit', idx + 1);
      const h4 = u.querySelector('h4');
      if (h4) {
        const btn = h4.querySelector('.remove-unit-btn');
        h4.textContent = 'Transport Unit ' + (idx + 1) + ' ';
        if (btn) h4.appendChild(btn);
      }
    });
  }

  document.getElementById('add-transport-unit-btn').addEventListener('click', function() {
    const container = document.getElementById('transport-units-container');
    addTransportUnit('1', '', container.children.length + 1);
  });
  addTransportUnit('1', '', 1);

  // ==================== CSV EXPORT ====================
  document.getElementById('export-last-csv-btn').addEventListener('click', function() {
    const last = JSON.parse(localStorage.getItem('emcs_last_submission') || 'null');
    if (!last) { alert('No submission to export.'); return; }
    const headers = ['MovementID', 'ARC', 'LRN', 'ConsignorERN', 'ConsigneeERN', 'ProductCode', 'Quantity', 'DispatchDate', 'Status'];
    const rows = [headers.join(',')];
    last.items.forEach(function(it) {
      rows.push([last.movementId, last.arc, last.lrn, last.consignorErn, last.consigneeErn, it.productCode, it.qty, last.date, 'Submitted'].map(v => '"' + (v || '') + '"').join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'emcs-submission-' + last.lrn + '.csv';
    a.click();
  });

  // ==================== MONITOR DASHBOARD ====================
  async function fetchMovementDetails(movId) {
    try {
      const res = await hmrcCall('GET', '/customs/excise/movements/' + encodeURIComponent(movId) + '/messages');
      if (!res.ok) return { arc: null, latestStatus: null };
      const text = await res.text();
      let msgs;
      try {
        msgs = JSON.parse(text);
      } catch (e) {
        return { arc: null, latestStatus: null };
      }
      if (!Array.isArray(msgs) || msgs.length === 0) return { arc: null, latestStatus: null };
      msgs.forEach(m => {
        if (m.encodedMessage && !m.decodedXml) {
          try { m.decodedXml = atob(m.encodedMessage); } catch(e) {}
        }
      });
      let arc = null;
      for (let i = 0; i < msgs.length; i++) {
        if (msgs[i].messageType === 'IE801') {
          const xml = msgs[i].decodedXml;
          const match = xml.match(/<[^>]*AdministrativeReferenceCode[^>]*>([^<]+)<\/[^>]+>/);
          if (match) { arc = match[1]; break; }
        }
      }
      const latest = msgs.reduce((prev, current) => (prev.createdOn > current.createdOn) ? prev : current);
      return { arc, latestStatus: latest.messageType };
    } catch(e) { return { arc: null, latestStatus: null }; }
  }

  async function fetchMonitorData() {
    const session = await checkSession();
    if (!session.authenticated) return;
    document.getElementById('mon-loading').style.display = 'block';
    document.getElementById('mon-table').style.display = 'none';

    const p = window.profiles.find(x => x.id === window.activeProfileId) || window.profiles[0];
    const ern = (p && p.ern) || '';
    if (!ern) {
      document.getElementById('mon-loading').style.display = 'none';
      document.getElementById('mon-no-results').style.display = 'block';
      document.getElementById('mon-no-results').innerText = 'Please set an ERN in your active profile.';
      return;
    }

    try {
      const res = await hmrcCall('GET', '/customs/excise/movements?ern=' + encodeURIComponent(ern));
      const text = await res.text();
      try {
        window.monitorData = JSON.parse(text);
        if (!Array.isArray(window.monitorData)) window.monitorData = [];
      } catch (e) {
        window.monitorData = [];
      }
    } catch(e) { window.monitorData = []; }

    if (window.monitorData.length > 0) {
      document.getElementById('mon-loading').innerHTML = '<span class="loading-spinner"></span>Fetching details for ' + window.monitorData.length + ' movement(s)...';
      const batchSize = 5;
      for (let i = 0; i < window.monitorData.length; i += batchSize) {
        const batch = window.monitorData.slice(i, i + batchSize);
        await Promise.all(batch.map(async m => {
          const details = await fetchMovementDetails(m.movementId);
          if (details.arc) m.administrativeReferenceCode = details.arc;
          if (details.latestStatus) m._latestStatus = details.latestStatus;
        }));
      }
    }

    document.getElementById('mon-loading').style.display = 'none';
    applyMonitorFilters();
  }

  function getStatusCategory(latestStatus) {
    if (!latestStatus) return 'pending';
    const map = {
      'IE801': 'accepted', 'IE810': 'cancelled', 'IE818': 'receipted',
      'IE819': 'rejected', 'IE807': 'interrupted', 'IE813': 'changed',
      'IE803': 'changed', 'IE839': 'rejected', 'IE881': 'closed',
      'IE837': 'delay', 'IE871': 'shortage', 'IE905': 'accepted'
    };
    return map[latestStatus] || 'accepted';
  }

  function getMovementStatusIndicator(m) {
    if (!m.administrativeReferenceCode) {
      return '<span class="status-indicator"><span class="status-dot dot-grey"></span>Pending</span>';
    }
    const statusMap = {
      'IE801': { label: 'Accepted', dot: 'dot-green' },
      'IE810': { label: 'Cancelled', dot: 'dot-red' },
      'IE818': { label: 'Receipted', dot: 'dot-green' },
      'IE819': { label: 'Rejected', dot: 'dot-red' },
      'IE807': { label: 'Interrupted', dot: 'dot-amber' },
      'IE813': { label: 'Dest. Changed', dot: 'dot-blue' },
      'IE803': { label: 'Dest. Changed', dot: 'dot-blue' },
      'IE839': { label: 'Customs Rejected', dot: 'dot-red' },
      'IE881': { label: 'Manually Closed', dot: 'dot-green' },
      'IE837': { label: 'Delay Explained', dot: 'dot-amber' },
      'IE871': { label: 'Shortage Explained', dot: 'dot-amber' },
      'IE905': { label: 'Status Update', dot: 'dot-blue' }
    };
    const s = statusMap[m._latestStatus] || { label: 'Accepted', dot: 'dot-green' };
    return '<span class="status-indicator"><span class="status-dot ' + s.dot + '"></span>' + s.label + '</span>';
  }

  function applyMonitorFilters() {
    const direction = document.getElementById('mon-direction').value;
    const statusFilter = document.getElementById('mon-status').value;
    const p = window.profiles.find(x => x.id === window.activeProfileId) || window.profiles[0];
    const myErn = (p && p.ern) || '';
    const today = new Date();
    const dispFrom = document.getElementById('mon-disp-from').value;
    const dispTo = document.getElementById('mon-disp-to').value;

    const filtered = window.monitorData.filter(function(m) {
      const isOut = m.consignorId === myErn;
      if (direction === 'in' && isOut) return false;
      if (direction === 'out' && !isOut) return false;
      if (statusFilter) {
        const category = m.administrativeReferenceCode ? getStatusCategory(m._latestStatus) : 'pending';
        if (statusFilter !== category) return false;
      }
      if (dispFrom) { const d = m.lastUpdated ? m.lastUpdated.split('T')[0] : ''; if (d < dispFrom) return false; }
      if (dispTo) { const d = m.lastUpdated ? m.lastUpdated.split('T')[0] : ''; if (d > dispTo) return false; }
      return true;
    });

    const tbody = document.getElementById('mon-tbody');
    tbody.innerHTML = '';
    if (filtered.length === 0) {
      document.getElementById('mon-table').style.display = 'none';
      document.getElementById('mon-no-results').style.display = 'block';
      document.getElementById('mon-no-results').innerText = 'No movements match your filters.';
      return;
    }
    document.getElementById('mon-table').style.display = 'table';
    document.getElementById('mon-no-results').style.display = 'none';

    filtered.forEach(function(m) {
      const isOut = m.consignorId === myErn;
      const counterparty = isOut ? m.consigneeId : m.consignorId;
      const directionText = isOut ? 'Goods out' : 'Goods in';
      const dispatchDate = m.lastUpdated ? new Date(m.lastUpdated) : new Date();
      const daysOpen = Math.floor((today - dispatchDate) / (1000 * 60 * 60 * 24));
      const isOverdue = daysOpen > 5;
      const rowClass = isOverdue ? 'warning-row' : '';
      const daysClass = isOverdue ? 'warning-text' : '';
      const arc = m.administrativeReferenceCode;
      const arcCell = arc
        ? '<div class="arc-cell"><span class="arc-value">' + arc + '</span><span class="lrn">LRN: ' + (m.localReferenceNumber || '') + '</span></div>'
        : '<div class="arc-cell"><span class="pending">Pending ARC</span><span class="lrn">LRN: ' + (m.localReferenceNumber || '') + '</span></div>';
      const statusIndicator = getMovementStatusIndicator(m);
      const lastMessage = m._latestStatus || '—';
      const isTerminal = m._latestStatus && TERMINAL_STATES.indexOf(m._latestStatus) !== -1;
      let actions = '<div class="actions-cell">';
      actions += '<button class="btn-small btn-grey" onclick="window._viewMovement(\'' + m.movementId + '\')">View</button>';
      if (isOut && arc && !isTerminal) {
        actions += '<button class="btn-small btn-red" onclick="window._cancelMovement(\'' + m.movementId + '\', \'' + arc + '\')">Cancel</button>';
      }
      if (!isOut && arc && !isTerminal) {
        actions += '<button class="btn-small btn-green" onclick="window._receiptMovement(\'' + m.movementId + '\', \'' + arc + '\')">Receipt</button>';
      }
      actions += '</div>';
      const tr = document.createElement('tr');
      tr.className = rowClass;
      tr.innerHTML = '<td>' + arcCell + '</td>' +
        '<td>' + directionText + '</td>' +
        '<td>' + counterparty + '</td>' +
        '<td>' + (m.lastUpdated ? m.lastUpdated.split('T')[0] : '—') + '</td>' +
        '<td>' + statusIndicator + '</td>' +
        '<td style="font-size:11px; font-family:\'SF Mono\', Monaco, monospace; color:#505a5f;">' + lastMessage + '</td>' +
        '<td style="text-align:center;" class="' + daysClass + '">' + daysOpen + '</td>' +
        '<td style="text-align:right;">' + actions + '</td>';
      tbody.appendChild(tr);
    });
  }

  window._viewMovement = function(movId) {
    document.getElementById('gsm-id').value = movId;
    document.querySelector('[data-tab="tab-get-movement"]').click();
    document.getElementById('get-single-movement-btn').click();
  };
  window._cancelMovement = function(movId, arc) {
    if (!arc) { alert('Cannot cancel: no ARC yet.'); return; }
    document.getElementById('sm-mov-id').value = movId;
    document.getElementById('sm-arc').value = arc;
    document.getElementById('sm-type').value = 'IE810';
    document.getElementById('sm-type').dispatchEvent(new Event('change'));
    document.querySelector('[data-tab="tab-submit-msg"]').click();
  };
  window._receiptMovement = function(movId, arc) {
    if (!arc) { alert('Cannot receipt: no ARC yet.'); return; }
    document.getElementById('sm-mov-id').value = movId;
    document.getElementById('sm-arc').value = arc;
    document.getElementById('sm-type').value = 'IE818';
    document.getElementById('sm-type').dispatchEvent(new Event('change'));
    document.querySelector('[data-tab="tab-submit-msg"]').click();
  };

  document.getElementById('mon-apply-filters').addEventListener('click', applyMonitorFilters);
  document.getElementById('mon-clear-filters').addEventListener('click', function() {
    ['mon-direction', 'mon-status', 'mon-epc', 'mon-disp-from', 'mon-disp-to'].forEach(id => document.getElementById(id).value = '');
    applyMonitorFilters();
  });
  document.getElementById('mon-refresh').addEventListener('click', fetchMonitorData);

  // ==================== IE818 ITEM-LEVEL ====================
  function showHideIE818Section() {
    const msgType = document.getElementById('sm-type').value;
    document.getElementById('ie818-section').style.display = (msgType === 'IE818') ? 'block' : 'none';
  }

  document.getElementById('load-818-items-btn').addEventListener('click', async function() {
    const movId = document.getElementById('sm-mov-id').value;
    if (!movId) { alert('Movement ID required.'); return; }
    try {
      const res = await hmrcCall('GET', '/customs/excise/movements/' + encodeURIComponent(movId));
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { alert('Failed to parse movement data.'); return; }
      let items = [];
      if (data.bodyEadEsad && Array.isArray(data.bodyEadEsad)) items = data.bodyEadEsad;
      else if (data.items && Array.isArray(data.items)) items = data.items;
      else items = [{ bodyRecordUniqueReference: 1, exciseProductCode: 'B000', quantity: 0, description: 'Item (details unavailable - please fill manually)' }];
      window.ie818Items = items;
      renderIE818Items(items);
    } catch(e) {
      alert('Failed to load movement: ' + e.message);
    }
  });

  function renderIE818Items(items) {
    const container = document.getElementById('ie818-items-container');
    if (items.length === 0) { container.innerHTML = '<p>No items found.</p>'; return; }
    let html = '<table class="receipt-table"><thead><tr>' +
      '<th>#</th><th>Product Code</th><th>Description</th><th>Expected Qty</th>' +
      '<th>Received Qty</th><th>Status</th><th>Reason Code</th><th>Notes</th>' +
      '</tr></thead><tbody>';
    items.forEach(function(it, idx) {
      const ref = it.bodyRecordUniqueReference || (idx + 1);
      const pc = it.exciseProductCode || '';
      const desc = it.commercialDescription || it.description || '';
      const expQty = it.quantity || 0;
      html += '<tr data-idx="' + idx + '">' +
        '<td>' + ref + '</td><td>' + pc + '</td><td>' + desc + '</td>' +
        '<td><input type="number" class="ie818-expected" value="' + expQty + '" step="0.001" readonly style="background:#eee;"></td>' +
        '<td><input type="number" class="ie818-received" value="' + expQty + '" step="0.001" onchange="window._updateIE818Row(this)"></td>' +
        '<td class="ie818-status">OK</td>' +
        '<td><select class="ie818-reason"><option value="">-- None --</option>' +
          '<option value="1">1 - Breakage</option><option value="2">2 - Leakage</option>' +
          '<option value="3">3 - Quantity discrepancy</option><option value="4">4 - Product type discrepancy</option>' +
          '<option value="5">5 - Other</option></select></td>' +
        '<td><input type="text" class="ie818-notes" placeholder="Optional notes"></td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
  }

  window._updateIE818Row = function(input) {
    const row = input.closest('tr');
    const expected = parseFloat(row.querySelector('.ie818-expected').value) || 0;
    const received = parseFloat(input.value) || 0;
    const statusCell = row.querySelector('.ie818-status');
    row.classList.remove('shortage', 'excess');
    if (received < expected) {
      statusCell.textContent = 'SHORT (' + (expected - received).toFixed(3) + ')';
      row.classList.add('shortage');
    } else if (received > expected) {
      statusCell.textContent = 'EXCESS (+' + (received - expected).toFixed(3) + ')';
      row.classList.add('excess');
    } else {
      statusCell.textContent = 'OK';
    }
  };

  // ==================== SUBMIT MOVEMENT ====================
  const TMS_NS = 'urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:TMS:V3.23';
  function xmlField(tag, value) {
    if (!value || value.trim() === '') return '';
    return '<urn:' + tag + '>' + value + '</urn:' + tag + '>';
  }

  document.getElementById('submit-movement-btn').addEventListener('click', async function() {
    const session = await checkSession();
    if (!session.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    const uniqueLrn = document.getElementById('s-lrn').value || ('LRN' + Date.now().toString().slice(-10));
    const submitDate = new Date().toISOString().slice(0, 10);
    const prepareTime = new Date().toISOString().slice(11, 19);

    let bodyEadEsadXml = '';
    const itemSummary = [];
    document.querySelectorAll('#goods-items-container .item-field').forEach(function(item, idx) {
      const bulk = item.querySelector('.s-bulk').checked;
      const netW = bulk ? item.querySelector('.s-weight').value : item.querySelector('.s-net-weight').value;
      const pc = item.querySelector('.s-product-code').value;
      const qty = item.querySelector('.s-qty').value;
      const abv = item.querySelector('.s-abv').value;
      const commDesc = item.querySelector('.s-comm-desc').value;
      const brand = item.querySelector('.s-brand').value;
      const shipMark = item.querySelector('.s-ship-mark').value;
      bodyEadEsadXml += '<urn:BodyEadEsad>' +
        '<urn:BodyRecordUniqueReference>' + (idx + 1) + '</urn:BodyRecordUniqueReference>' +
        '<urn:ExciseProductCode>' + pc + '</urn:ExciseProductCode>' +
        '<urn:CnCode>' + item.querySelector('.s-cn-code').value + '</urn:CnCode>' +
        '<urn:Quantity>' + qty + '</urn:Quantity>' +
        '<urn:GrossMass>' + item.querySelector('.s-weight').value + '</urn:GrossMass>' +
        '<urn:NetMass>' + netW + '</urn:NetMass>' +
        (abv ? '<urn:AlcoholicStrengthByVolumeInPercentage>' + abv + '</urn:AlcoholicStrengthByVolumeInPercentage>' : '') +
        '<urn:FiscalMarkUsedFlag>0</urn:FiscalMarkUsedFlag>' +
        (commDesc ? '<urn:CommercialDescription>' + commDesc + '</urn:CommercialDescription>' : '') +
        (brand ? '<urn:BrandName>' + brand + '</urn:BrandName>' : '') +
        '<urn:Package><urn:KindOfPackages>' + item.querySelector('.s-package-kind').value + '</urn:KindOfPackages>' +
        '<urn:NumberOfPackages>' + item.querySelector('.s-package-count').value + '</urn:NumberOfPackages>' +
        (shipMark ? '<urn:ShippingMarks>' + shipMark + '</urn:ShippingMarks>' : '') +
        '</urn:Package></urn:BodyEadEsad>';
      itemSummary.push({ productCode: pc, qty: qty });
    });

    let xml = '<urn:IE815 xmlns:urn="urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:IE815:V3.23" xmlns:urn1="' + TMS_NS + '">' +
      '<urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>' +
      '<urn1:DateOfPreparation>' + submitDate + '</urn1:DateOfPreparation><urn1:TimeOfPreparation>' + prepareTime + '</urn1:TimeOfPreparation>' +
      '<urn1:MessageIdentifier>' + uniqueLrn + '</urn1:MessageIdentifier><urn1:CorrelationIdentifier>PORTAL' + uniqueLrn + '</urn1:CorrelationIdentifier></urn:Header>' +
      '<urn:Body><urn:SubmittedDraftOfEADESAD><urn:Attributes><urn:SubmissionMessageType>1</urn:SubmissionMessageType></urn:Attributes>' +
      '<urn:ConsigneeTrader language="en"><urn:Traderid>' + document.getElementById('s-consignee-ern').value + '</urn:Traderid>' +
      '<urn:TraderName>' + document.getElementById('s-consignee-name').value + '</urn:TraderName>' +
      '<urn:StreetName>' + document.getElementById('s-consignee-street').value + '</urn:StreetName>' +
      xmlField('StreetNumber', document.getElementById('s-consignee-street-num').value) +
      '<urn:Postcode>' + document.getElementById('s-consignee-postcode').value + '</urn:Postcode>' +
      '<urn:City>' + document.getElementById('s-consignee-city').value + '</urn:City></urn:ConsigneeTrader>' +
      '<urn:ConsignorTrader language="en"><urn:TraderExciseNumber>' + document.getElementById('s-consignor-ern').value + '</urn:TraderExciseNumber>' +
      '<urn:TraderName>' + document.getElementById('s-consignor-name').value + '</urn:TraderName>' +
      '<urn:StreetName>' + document.getElementById('s-consignor-street').value + '</urn:StreetName>' +
      xmlField('StreetNumber', document.getElementById('s-consignor-street-num').value) +
      '<urn:Postcode>' + document.getElementById('s-consignor-postcode').value + '</urn:Postcode>' +
      '<urn:City>' + document.getElementById('s-consignor-city').value + '</urn:City></urn:ConsignorTrader>';

    const dw = document.getElementById('s-dispatch-warehouse').value.trim();
    if (dw) {
      xml += '<urn:PlaceOfDispatchTrader language="en"><urn:ReferenceOfTaxWarehouse>' + dw + '</urn:ReferenceOfTaxWarehouse>' +
        xmlField('TraderName', document.getElementById('s-dispatch-name').value) +
        xmlField('StreetName', document.getElementById('s-dispatch-street').value) +
        xmlField('StreetNumber', document.getElementById('s-dispatch-street-num').value) +
        xmlField('Postcode', document.getElementById('s-dispatch-postcode').value) +
        xmlField('City', document.getElementById('s-dispatch-city').value) +
        '</urn:PlaceOfDispatchTrader>';
    }

    xml += '<urn:DeliveryPlaceTrader language="en"><urn:Traderid>' + document.getElementById('s-delivery-trader-id').value + '</urn:Traderid>' +
      '<urn:TraderName>' + document.getElementById('s-delivery-name').value + '</urn:TraderName>' +
      '<urn:StreetName>' + document.getElementById('s-delivery-street').value + '</urn:StreetName>' +
      xmlField('StreetNumber', document.getElementById('s-delivery-street-num').value) +
      '<urn:Postcode>' + document.getElementById('s-delivery-postcode').value + '</urn:Postcode>' +
      '<urn:City>' + document.getElementById('s-delivery-city').value + '</urn:City></urn:DeliveryPlaceTrader>' +
      '<urn:CompetentAuthorityDispatchOffice><urn:ReferenceNumber>' + document.getElementById('s-dispatch-office').value + '</urn:ReferenceNumber></urn:CompetentAuthorityDispatchOffice>' +
      '<urn:FirstTransporterTrader language="en"><urn:VatNumber>' + document.getElementById('s-transporter-vat').value + '</urn:VatNumber>' +
      '<urn:TraderName>' + document.getElementById('s-transporter-name').value + '</urn:TraderName>' +
      '<urn:StreetName>Logistics Way</urn:StreetName><urn:StreetNumber>5</urn:StreetNumber>' +
      '<urn:Postcode>FR5 4RN</urn:Postcode>' +
      '<urn:City>' + document.getElementById('s-transporter-city').value + '</urn:City></urn:FirstTransporterTrader>' +
      '<urn:HeaderEadEsad><urn:DestinationTypeCode>' + document.getElementById('s-dest-type').value + '</urn:DestinationTypeCode>' +
      '<urn:JourneyTime>' + document.getElementById('s-journey-time').value + '</urn:JourneyTime>' +
      '<urn:TransportArrangement>' + document.getElementById('s-transport-arrangement').value + '</urn:TransportArrangement></urn:HeaderEadEsad>' +
      '<urn:TransportMode><urn:TransportModeCode>' + document.getElementById('s-transport-mode').value + '</urn:TransportModeCode></urn:TransportMode>' +
      '<urn:MovementGuarantee><urn:GuarantorTypeCode>' + document.getElementById('s-guarantor-type').value + '</urn:GuarantorTypeCode></urn:MovementGuarantee>' +
      bodyEadEsadXml +
      '<urn:EadEsadDraft><urn:LocalReferenceNumber>' + uniqueLrn + '</urn:LocalReferenceNumber>' +
      '<urn:InvoiceNumber>' + document.getElementById('s-invoice-number').value + '</urn:InvoiceNumber>' +
      '<urn:InvoiceDate>' + document.getElementById('s-invoice-date').value + '</urn:InvoiceDate>' +
      '<urn:OriginTypeCode>' + document.getElementById('s-origin-type').value + '</urn:OriginTypeCode>' +
      '<urn:DateOfDispatch>' + document.getElementById('s-date').value + '</urn:DateOfDispatch>' +
      '<urn:TimeOfDispatch>' + document.getElementById('s-time').value + ':00</urn:TimeOfDispatch></urn:EadEsadDraft>';

    document.querySelectorAll('.transport-unit-field').forEach(function(unit) {
      const uc = unit.querySelector('.s-transport-unit-code').value;
      const ui = unit.querySelector('.s-identity-transport').value;
      if (uc && ui) xml += '<urn:TransportDetails><urn:TransportUnitCode>' + uc + '</urn:TransportUnitCode><urn:IdentityOfTransportUnits>' + ui + '</urn:IdentityOfTransportUnits></urn:TransportDetails>';
    });
    xml += '</urn:SubmittedDraftOfEADESAD></urn:Body></urn:IE815>';

    const res = await hmrcCall('POST', '/customs/excise/movements', xml);
    const responseText = await res.text();
    document.getElementById('submit-output').innerText = 'Status: ' + res.status + '\n\n' + responseText;

    if (res.status === 202) {
      try {
        const parsed = JSON.parse(responseText);
        if (parsed.movementId) {
          localStorage.setItem('emcs_last_submission', JSON.stringify({
            movementId: parsed.movementId,
            arc: parsed.administrativeReferenceCode || '',
            lrn: parsed.localReferenceNumber || uniqueLrn,
            consignorErn: document.getElementById('s-consignor-ern').value,
            consigneeErn: document.getElementById('s-consignee-ern').value,
            date: submitDate,
            items: itemSummary
          }));
          document.getElementById('export-last-csv-btn').style.display = 'inline-block';
          if (window.currentDraftId) {
            try {
              await apiCall('DELETE', '/api/drafts?id=' + window.currentDraftId);
            } catch (e) {}
            window.currentDraftId = null;
            await loadDrafts();
          }
        }
      } catch(e) {}
    }
  });

  // ==================== TAB 3 ====================
  document.getElementById('get-single-movement-btn').addEventListener('click', async function() {
    const movId = document.getElementById('gsm-id').value;
    if (!movId) { alert('Movement ID required'); return; }
    const res = await hmrcCall('GET', '/customs/excise/movements/' + encodeURIComponent(movId));
    const text = await res.text();
    document.getElementById('gsm-output').innerText = 'Status: ' + res.status + '\n\n' + text;
    try {
      const data = JSON.parse(text);
      document.getElementById('gsm-parsed').innerHTML = renderMovementParsed(data);
    } catch(e) {
      document.getElementById('gsm-parsed').innerHTML = '<p style="color:#d4351c;">Could not parse response: ' + e.message + '</p>';
    }
  });

  // ==================== TAB 4 ====================
  document.getElementById('sm-type').addEventListener('change', function() {
    showHideIE818Section();
    const container = document.getElementById('msg-specific-fields');
    const msgType = this.value;
    if (msgType === 'IE818') {
      container.innerHTML = '<h3 style="margin-top:20px;">IE818 Global Fields</h3><div class="form-grid">' +
        '<div class="field"><label>Date of Arrival</label><input type="date" id="msg-arrival-date" value="' + today + '"></div>' +
        '<div class="field"><label>Global Conclusion</label>' +
        '<select id="msg-receipt-conclusion">' +
        '<option value="1">1 - Acceptable (all items OK)</option>' +
        '<option value="2" selected>2 - Unacceptable with reservations</option>' +
        '<option value="3">3 - Refusal (entire shipment rejected)</option>' +
        '</select></div></div>';
      return;
    }
    let html = '<h3 style="margin-top:20px;">Message-Specific Fields</h3><div class="form-grid">';
    if (msgType === 'IE810') {
      html += '<div class="field"><label>Cancellation Reason</label><select id="msg-cancel-reason"><option value="1">1 - Duplicate</option><option value="2">2 - Erroneous</option><option value="3" selected>3 - Before dispatch</option><option value="4">4 - During transit</option></select></div>';
    } else if (msgType === 'IE813') {
      html += '<div class="field"><label>New Destination Type</label><select id="msg-dest-type"><option value="1">1 - Tax warehouse</option><option value="2">2 - Registered consignee</option></select></div>';
      html += '<div class="field"><label>New Consignee ERN</label><input type="text" id="msg-new-consignee" value=""></div>';
      html += '<div class="field"><label>New Consignee Name</label><input type="text" id="msg-new-consignee-name" value=""></div>';
    } else if (msgType === 'IE819') {
      html += '<div class="field"><label>Date of Alert</label><input type="date" id="msg-alert-date" value="' + today + '"></div>';
      html += '<div class="field"><label>Rejected Flag</label><select id="msg-rejected-flag"><option value="0">0 - No</option><option value="1" selected>1 - Yes</option></select></div>';
      html += '<div class="field"><label>Reason Code</label><select id="msg-rejection-reason"><option value="1">1 - Other</option><option value="2" selected>2 - Quantity discrepancy</option></select></div>';
      html += '<div class="field"><label>Info</label><input type="text" id="msg-rejection-info" value=""></div>';
    } else if (msgType === 'IE837') {
      html += '<div class="field"><label>Submitter Type</label><select id="msg-submitter-type"><option value="1" selected>1 - Consignor</option><option value="2">2 - Consignee</option></select></div>';
      html += '<div class="field"><label>Explanation Code</label><select id="msg-explanation-code"><option value="1">1 - Transport problems</option><option value="2">2 - Force majeure</option><option value="6" selected>6 - Other</option></select></div>';
      html += '<div class="field"><label>Info</label><input type="text" id="msg-delay-info" value=""></div>';
    } else if (msgType === 'IE871') {
      html += '<div class="field"><label>Date of Analysis</label><input type="date" id="msg-analysis-date" value="' + today + '"></div>';
      html += '<div class="field"><label>Global Explanation</label><input type="text" id="msg-shortage-explanation" value=""></div>';
    }
    html += '</div>';
    container.innerHTML = html;
  });
  document.getElementById('sm-type').dispatchEvent(new Event('change'));

  document.getElementById('submit-message-btn').addEventListener('click', async function() {
    const movId = document.getElementById('sm-mov-id').value;
    const arc = document.getElementById('sm-arc').value;
    if (!movId) { alert('Movement ID required'); return; }
    if (!arc) { alert('ARC required'); return; }
    const msgType = document.getElementById('sm-type').value;
    const seq = document.getElementById('sm-seq').value || '1';
    const msgId = document.getElementById('sm-msgid').value || ('MSG' + Date.now());
    const submitDate = new Date().toISOString().slice(0, 10);
    const prepareTime = new Date().toISOString().slice(11, 19);
    const namespace = 'urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:' + msgType + ':V3.23';
    let bodyXml = '';

    if (msgType === 'IE810') {
      const reason = document.getElementById('msg-cancel-reason').value;
      bodyXml = '<urn:CancellationOfEAD><urn:Attributes><urn:DateAndTimeOfValidationOfCancellation>' + prepareTime + '</urn:DateAndTimeOfValidationOfCancellation></urn:Attributes>' +
        '<urn:ExciseMovementEad><urn:AdministrativeReferenceCode>' + arc + '</urn:AdministrativeReferenceCode></urn:ExciseMovementEad>' +
        '<urn:Cancellation><urn:CancellationReasonCode>' + reason + '</urn:CancellationReasonCode></urn:Cancellation></urn:CancellationOfEAD>';
    } else if (msgType === 'IE818') {
      const arrivalDate = document.getElementById('msg-arrival-date').value;
      let conclusion = document.getElementById('msg-receipt-conclusion').value;
      let bodyReportXml = '';
      let hasShortage = false;
      window.ie818Items.forEach(function(it, idx) {
        const row = document.querySelector('#ie818-items-container tr[data-idx="' + idx + '"]');
        if (!row) return;
        const expected = parseFloat(row.querySelector('.ie818-expected').value) || 0;
        const received = parseFloat(row.querySelector('.ie818-received').value) || 0;
        const reason = row.querySelector('.ie818-reason').value;
        const notes = row.querySelector('.ie818-notes').value;
        const ref = it.bodyRecordUniqueReference || (idx + 1);
        if (received !== expected || reason) {
          hasShortage = true;
          bodyReportXml += '<urn:BodyReportOfReceiptExport><urn:BodyRecordUniqueReference>' + ref + '</urn:BodyRecordUniqueReference>';
          if (received !== expected) {
            const diffCode = received < expected ? 'S' : 'E';
            bodyReportXml += '<urn:ObservedShortageOrExcess><urn:ObservedQuantity>' + received + '</urn:ObservedQuantity>' +
              '<urn:ObservedShortageOrExcessCode>' + diffCode + '</urn:ObservedShortageOrExcessCode></urn:ObservedShortageOrExcess>';
          }
          if (reason) {
            bodyReportXml += '<urn:UnsatisfactoryReason><urn:UnsatisfactoryReasonCode>' + reason + '</urn:UnsatisfactoryReasonCode>' +
              (notes ? '<urn:ComplementaryInformation language="en">' + notes + '</urn:ComplementaryInformation>' : '') +
              '</urn:UnsatisfactoryReason>';
          }
          bodyReportXml += '</urn:BodyReportOfReceiptExport>';
        }
      });
      if (hasShortage && conclusion === '1') conclusion = '2';
      bodyXml = '<urn:AcceptedOrRejectedReportOfReceiptExport>' +
        '<urn:Attributes><urn:DateAndTimeOfValidationOfReportOfReceiptExport>' + prepareTime + '</urn:DateAndTimeOfValidationOfReportOfReceiptExport></urn:Attributes>' +
        '<urn:ConsigneeTrader language="en"><urn:Traderid>' + document.getElementById('s-consignee-ern').value + '</urn:Traderid><urn:TraderName>' + document.getElementById('s-consignee-name').value + '</urn:TraderName></urn:ConsigneeTrader>' +
        '<urn:ExciseMovement><urn:AdministrativeReferenceCode>' + arc + '</urn:AdministrativeReferenceCode><urn:SequenceNumber>' + seq + '</urn:SequenceNumber></urn:ExciseMovement>' +
        '<urn:DestinationOffice><urn:ReferenceNumber>' + document.getElementById('s-dispatch-office').value + '</urn:ReferenceNumber></urn:DestinationOffice>' +
        '<urn:ReportOfReceiptExport><urn:DateOfArrivalOfExciseProducts>' + arrivalDate + '</urn:DateOfArrivalOfExciseProducts>' +
        '<urn:GlobalConclusionOfReceipt>' + conclusion + '</urn:GlobalConclusionOfReceipt></urn:ReportOfReceiptExport>' +
        bodyReportXml + '</urn:AcceptedOrRejectedReportOfReceiptExport>';
    } else if (msgType === 'IE837') {
      const submitterType = document.getElementById('msg-submitter-type').value;
      const submitterId = submitterType === '1' ? document.getElementById('s-consignor-ern').value : document.getElementById('s-consignee-ern').value;
      bodyXml = '<urn:ExplanationOnDelayForDelivery><urn:Attributes>' +
        '<urn:SubmitterIdentification>' + submitterId + '</urn:SubmitterIdentification>' +
        '<urn:SubmitterType>' + submitterType + '</urn:SubmitterType>' +
        '<urn:ExplanationCode>' + document.getElementById('msg-explanation-code').value + '</urn:ExplanationCode>' +
        '<urn:ComplementaryInformation language="en">' + document.getElementById('msg-delay-info').value + '</urn:ComplementaryInformation>' +
        '<urn:MessageRole>1</urn:MessageRole></urn:Attributes>' +
        '<urn:ExciseMovement><urn:AdministrativeReferenceCode>' + arc + '</urn:AdministrativeReferenceCode><urn:SequenceNumber>' + seq + '</urn:SequenceNumber></urn:ExciseMovement>' +
        '</urn:ExplanationOnDelayForDelivery>';
    } else if (msgType === 'IE871') {
      bodyXml = '<urn:ExplanationOnReasonForShortage><urn:Attributes><urn:SubmitterType>1</urn:SubmitterType>' +
        '<urn:DateAndTimeOfValidationOfExplanationOnShortage>' + prepareTime + '</urn:DateAndTimeOfValidationOfExplanationOnShortage></urn:Attributes>' +
        '<urn:ExciseMovement><urn:AdministrativeReferenceCode>' + arc + '</urn:AdministrativeReferenceCode><urn:SequenceNumber>' + seq + '</urn:SequenceNumber></urn:ExciseMovement>' +
        '<urn:ConsignorTrader language="en"><urn:TraderExciseNumber>' + document.getElementById('s-consignor-ern').value + '</urn:TraderExciseNumber><urn:TraderName>' + document.getElementById('s-consignor-name').value + '</urn:TraderName></urn:ConsignorTrader>' +
        '<urn:Analysis><urn:DateOfAnalysis>' + document.getElementById('msg-analysis-date').value + '</urn:DateOfAnalysis><urn:GlobalExplanation language="en">' + document.getElementById('msg-shortage-explanation').value + '</urn:GlobalExplanation></urn:Analysis>' +
        '</urn:ExplanationOnReasonForShortage>';
    } else {
      alert('Message type ' + msgType + ' not fully implemented in frontend yet.');
      return;
    }

    const xml = '<urn:' + msgType + ' xmlns:urn="' + namespace + '" xmlns:urn1="' + TMS_NS + '"><urn:Header>' +
      '<urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>' +
      '<urn1:DateOfPreparation>' + submitDate + '</urn1:DateOfPreparation><urn1:TimeOfPreparation>' + prepareTime + '</urn1:TimeOfPreparation>' +
      '<urn1:MessageIdentifier>' + msgId + '</urn1:MessageIdentifier><urn1:CorrelationIdentifier>PORTAL' + msgId + '</urn1:CorrelationIdentifier></urn:Header>' +
      '<urn:Body>' + bodyXml + '</urn:Body></urn:' + msgType + '>';

    const res = await hmrcCall('POST', '/customs/excise/movements/' + encodeURIComponent(movId) + '/messages', xml);
    const responseText = await res.text();
    document.getElementById('sm-output').innerText = 'Status: ' + res.status + '\n\n' + responseText;
  });

  // ==================== TAB 5 ====================
  document.getElementById('get-messages-btn').addEventListener('click', async function() {
    const movId = document.getElementById('gmsg-id').value;
    if (!movId) { alert('Movement ID required'); return; }
    const res = await hmrcCall('GET', '/customs/excise/movements/' + encodeURIComponent(movId) + '/messages');
    const text = await res.text();
    document.getElementById('gmsg-output').innerText = 'Status: ' + res.status + '\n\n' + text;
    try {
      const msgs = JSON.parse(text);
      if (Array.isArray(msgs)) {
        msgs.forEach(m => { if (m.encodedMessage) { try { m.decodedXml = atob(m.encodedMessage); } catch(e) {} } });
        document.getElementById('gmsg-count').textContent = msgs.length + ' message(s)';
        document.getElementById('gmsg-parsed').innerHTML = renderMessagesParsed(msgs);
      } else {
        document.getElementById('gmsg-count').textContent = '';
        document.getElementById('gmsg-parsed').innerHTML = '<p style="color:#d4351c;">Unexpected response format.</p>';
      }
    } catch(e) {
      document.getElementById('gmsg-count').textContent = '';
      document.getElementById('gmsg-parsed').innerHTML = '<p style="color:#d4351c;">Could not parse response: ' + e.message + '</p>';
    }
  });

  // ==================== TAB 6 ====================
  document.getElementById('get-single-message-btn').addEventListener('click', async function() {
    const movId = document.getElementById('gsmsg-mid').value;
    const msgId = document.getElementById('gsmsg-id').value;
    if (!movId || !msgId) { alert('Both IDs required'); return; }
    const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/movements/' + movId + '/messages/' + msgId), {
      credentials: 'include',
      headers: { 'Accept': 'application/vnd.hmrc.1.0+xml' }
    });
    const text = await res.text();
    document.getElementById('gsmsg-output').innerText = 'Status: ' + res.status + '\n\n' + text;
    if (res.status === 200) {
      document.getElementById('gsmsg-parsed').innerHTML = renderSingleMessageParsed(text);
    } else {
      document.getElementById('gsmsg-parsed').innerHTML = '<p style="color:#d4351c;">Error: Status ' + res.status + '</p>';
    }
  });

  // ==================== TAB 7 ====================
  document.getElementById('pre-validate-btn').addEventListener('click', async function() {
    const requestBody = {
      exciseTraderValidationRequest: {
        exciseTraderRequest: {
          exciseRegistrationNumber: document.getElementById('pv-ern').value,
          entityGroup: document.getElementById('pv-group').value,
          validateProductAuthorisationRequest: [{ product: { exciseProductCode: document.getElementById('pv-p1').value } }]
        }
      }
    };
    const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/traders/pre-validate'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-correlation-id': crypto.randomUUID() },
      body: JSON.stringify(requestBody)
    });
    const text = await res.text();
    document.getElementById('pv-output').innerText = 'Status: ' + res.status + '\n\n' + text;
    try {
      const data = JSON.parse(text);
      document.getElementById('pv-parsed').innerHTML = renderPrevalidateParsed(data);
    } catch(e) {
      document.getElementById('pv-parsed').innerHTML = '<p style="color:#d4351c;">Could not parse response.</p>';
    }
  });

  // ==================== TAB 8 ====================
  document.getElementById('subscribe-ern-btn').addEventListener('click', async function() {
    const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/erns/' + document.getElementById('sub-ern').value + '/subscription'), {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxId: '42c75e22-7bba-44f2-a610-4b4c3b262e3e' })
    });
    const text = await res.text();
    document.getElementById('sub-output').innerText = 'Status: ' + res.status + '\n\n' + text;
  });

  // ==================== TAB 9 ====================
  document.getElementById('unsubscribe-ern-btn').addEventListener('click', async function() {
    const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/erns/' + document.getElementById('unsub-ern').value + '/subscription'), {
      method: 'DELETE', credentials: 'include'
    });
    const text = await res.text();
    document.getElementById('unsub-output').innerText = res.status === 202 ? 'Successfully unsubscribed' : 'Status: ' + res.status + '\n\n' + text;
  });
});
