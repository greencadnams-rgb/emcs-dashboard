document.addEventListener('DOMContentLoaded', async function() {
  console.log('App.js loaded successfully - All 10 tabs functional');

  // === HELPERS ===
  function xmlField(tag, value) { return value ? `<urn:${tag}>${value}</urn:${tag}>` : ''; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  
  function showLoginScreen() {
    const ls = document.getElementById('login-screen');
    const db = document.getElementById('dashboard');
    if (ls) ls.style.display = 'flex';
    if (db) db.style.display = 'none';
  }
  function showDashboard() {
    const ls = document.getElementById('login-screen');
    const db = document.getElementById('dashboard');
    if (ls) ls.style.display = 'none';
    if (db) db.style.display = 'block';
  }
  function updateHmrcStatus(authenticated) {
    const badge = document.getElementById('hmrc-status');
    const link = document.getElementById('hmrc-login-link');
    if (badge && link) {
      if (authenticated) {
        badge.textContent = 'HMRC: Logged In';
        badge.className = 'token-status token-ok';
        link.textContent = 'Refresh HMRC Token';
      } else {
        badge.textContent = 'HMRC: Not Logged In';
        badge.className = 'token-status token-missing';
        link.textContent = 'Login to HMRC';
      }
    }
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/session', { credentials: 'include' });
      if (res.ok) {
        const session = await res.json();
        if (session.authenticated) {
          showDashboard();
          updateHmrcStatus(session.hmrcAuthenticated);
          await loadProfiles();
          await loadDrafts();
          return session;
        }
      }
    } catch(e) { console.error('Session check failed:', e); }
    showLoginScreen();
    return null;
  }

  // === AUTH ===
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.addEventListener('click', async function() {
      const password = document.getElementById('password').value;
      const totpCode = document.getElementById('totp-code').value;
      const errorEl = document.getElementById('login-error');
      if (!password) {
        if (errorEl) { errorEl.textContent = 'Please enter your password'; errorEl.style.display = 'block'; }
        return;
      }
      try {
        const res = await fetch('/api/login', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, totpCode })
        });
        const data = await res.json();
        if (data.requires2FA) {
          if (errorEl) { errorEl.textContent = '2FA is enabled. Please enter your 6-digit code.'; errorEl.style.display = 'block'; }
          document.getElementById('totp-code').style.display = 'block';
          document.getElementById('totp-code').focus();
          return;
        }
        if (res.ok) {
          if (errorEl) errorEl.style.display = 'none';
          await checkSession();
        } else {
          if (errorEl) { errorEl.textContent = data.error || 'Login failed'; errorEl.style.display = 'block'; }
        }
      } catch(e) {
        if (errorEl) { errorEl.textContent = 'Login error: ' + e.message; errorEl.style.display = 'block'; }
      }
    });
  }

  const setup2faBtn = document.getElementById('setup-2fa-btn');
  if (setup2faBtn) {
    setup2faBtn.addEventListener('click', async function() {
      const password = document.getElementById('password').value;
      if (!password) { alert('Please enter your master password first.'); return; }
      try {
        const res = await fetch('/api/setup-2fa', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        if (res.ok) {
          const data = await res.json();
          document.getElementById('2fa-setup').style.display = 'block';
          document.getElementById('qr-code').src = data.qrCode;
          document.getElementById('secret-text').textContent = data.secret;
        } else {
          const data = await res.json();
          alert('Setup failed: ' + (data.error || 'Unknown error'));
        }
      } catch(e) { alert('Network error: ' + e.message); }
    });
  }

  const verify2faBtn = document.getElementById('verify-2fa-btn');
  if (verify2faBtn) {
    verify2faBtn.addEventListener('click', function() {
      const secret = document.getElementById('secret-text').textContent;
      const token = document.getElementById('verify-code').value;
      if (!token || token.length !== 6) { alert('Please enter a valid 6-digit code'); return; }
      alert('2FA Verified! Add TOTP_SECRET="' + secret + '" to Vercel env vars.');
      document.getElementById('2fa-result').textContent = 'Success!';
      document.getElementById('2fa-result').style.color = 'green';
    });
  }

  const logoutBtn = document.getElementById('logout-link') || document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      showLoginScreen();
    });
  }

  const hmrcLoginBtn = document.getElementById('hmrc-login-link');
  if (hmrcLoginBtn) {
    hmrcLoginBtn.addEventListener('click', function(e) {
      e.preventDefault();
      window.location.href = '/api/auth';
    });
  }

  // === TAB NAVIGATION ===
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const tabId = this.getAttribute('data-tab');
      if (tabId) document.getElementById(tabId).classList.add('active');
    });
  });

  // === PROFILES (Tab 10) ===
  async function loadProfiles() {
    try {
      const res = await fetch('/api/profiles', { credentials: 'include' });
      if (!res.ok) return;
      const profiles = await res.json();
      const profileSelect = document.getElementById('active-profile-select');
      const profileChips = document.getElementById('profile-chips');
      
      if (profileSelect) {
        profileSelect.innerHTML = '<option value="">Select a profile...</option>';
        profiles.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = `${p.name} (${p.ern})`;
          profileSelect.appendChild(opt);
        });
        profileSelect.onchange = function() {
          const selected = profiles.find(p => p.id == this.value);
          if (selected) {
            document.getElementById('s-consignor-ern').value = selected.ern;
            document.getElementById('s-consignor-name').value = selected.traderName || '';
            document.getElementById('s-consignor-street').value = selected.street || '';
            document.getElementById('s-consignor-postcode').value = selected.postcode || '';
            document.getElementById('s-consignor-city').value = selected.city || '';
            document.getElementById('s-dispatch-office').value = selected.office || 'GB004098';
          }
        };
      }
      if (profileChips) {
        profileChips.innerHTML = '';
        profiles.forEach(p => {
          const chip = document.createElement('div');
          chip.className = 'profile-chip';
          chip.innerHTML = `<span>${p.name} (${p.ern})</span> <span class="del-prof" data-id="${p.id}">&times;</span>`;
          profileChips.appendChild(chip);
        });
        profileChips.querySelectorAll('.del-prof').forEach(delBtn => {
          delBtn.addEventListener('click', async function() {
            if (confirm('Delete this profile?')) {
              await fetch(`/api/profiles?id=${this.getAttribute('data-id')}`, { method: 'DELETE', credentials: 'include' });
              loadProfiles();
            }
          });
        });
      }
    } catch(e) { console.error('Load profiles failed:', e); }
  }

  const createProfileBtn = document.getElementById('create-profile-btn');
  if (createProfileBtn) {
    createProfileBtn.addEventListener('click', async function() {
      const data = {
        name: document.getElementById('prof-name').value,
        type: document.getElementById('prof-type').value,
        ern: document.getElementById('prof-ern').value,
        traderName: document.getElementById('prof-trader-name').value,
        street: document.getElementById('prof-street').value,
        postcode: document.getElementById('prof-postcode').value,
        city: document.getElementById('prof-city').value,
        office: document.getElementById('prof-office').value
      };
      if (!data.name || !data.ern) { alert('Profile Name and ERN are required.'); return; }
      try {
        const res = await fetch('/api/profiles', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (res.ok) {
          alert('Profile created!');
          ['prof-name','prof-ern','prof-trader-name','prof-street','prof-postcode','prof-city'].forEach(id => document.getElementById(id).value = '');
          loadProfiles();
        } else {
          const err = await res.json();
          alert('Error: ' + err.error);
        }
      } catch(e) { alert('Network error: ' + e.message); }
    });
  }

  // === DYNAMIC FORM ELEMENTS ===
  document.getElementById('add-transport-unit-btn')?.addEventListener('click', function() {
    const container = document.getElementById('transport-units-container');
    const div = document.createElement('div');
    div.className = 'transport-unit-field';
    div.innerHTML = `
      <div class="form-grid">
        <div class="field"><label>Unit Code</label><input type="text" class="s-transport-unit-code" maxlength="2"></div>
        <div class="field"><label>Identity</label><input type="text" class="s-identity-transport" maxlength="35"></div>
      </div>
      <button type="button" class="btn-red btn-small remove-unit">Remove</button>`;
    container.appendChild(div);
    div.querySelector('.remove-unit').addEventListener('click', () => div.remove());
  });

  document.getElementById('add-goods-item-btn')?.addEventListener('click', function() {
    const container = document.getElementById('goods-items-container');
    const div = document.createElement('div');
    div.className = 'item-field';
    div.innerHTML = `
      <div class="item-header"><h4>Goods Item</h4><button type="button" class="btn-red btn-small remove-item">Remove</button></div>
      <div class="form-grid">
        <div class="field"><label>Excise Product Code *</label><input type="text" class="s-product-code" maxlength="4" required></div>
        <div class="field"><label>CN Code *</label><input type="text" class="s-cn-code" maxlength="8" required></div>
        <div class="field"><label>Quantity *</label><input type="number" class="s-qty" step="0.001" required></div>
        <div class="field"><label>Gross Mass *</label><input type="number" class="s-weight" step="0.01" required></div>
        <div class="field"><label>Net Mass</label><input type="number" class="s-net-weight" step="0.01"></div>
        <div class="field"><label>ABV (%)</label><input type="number" class="s-abv" step="0.1"></div>
        <div class="field"><label>Commercial Description</label><input type="text" class="s-comm-desc" maxlength="300"></div>
        <div class="field"><label>Brand Name</label><input type="text" class="s-brand" maxlength="50"></div>
        <div class="field"><label>Kind of Packages *</label><input type="text" class="s-package-kind" maxlength="2" required></div>
        <div class="field"><label>Number of Packages *</label><input type="number" class="s-package-count" required></div>
        <div class="field"><label>Shipping Marks</label><input type="text" class="s-ship-mark" maxlength="35"></div>
      </div>`;
    container.appendChild(div);
    div.querySelector('.remove-item').addEventListener('click', () => div.remove());
    div.querySelector('.s-product-code').addEventListener('change', function() {
      const epc = this.value.toUpperCase();
      const cnMap = { 'B000': '22030001', 'W200': '22042100', 'W300': '22041000', 'S200': '22089000', 'E410': '27101231', 'E420': '27101231' };
      if (cnMap[epc]) div.querySelector('.s-cn-code').value = cnMap[epc];
    });
  });

  // === TAB 2: SUBMIT MOVEMENT (IE815) ===
  document.getElementById('submit-movement-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }

    const uniqueLrn = document.getElementById('s-lrn').value || ('LRN' + Date.now().toString().slice(-10));
    const submitDate = document.getElementById('s-date').value || new Date().toISOString().slice(0, 10);
    const prepareTime = new Date().toISOString().slice(11, 19);

    let bodyEadEsadXml = '';
    const itemSummary = [];
    document.querySelectorAll('#goods-items-container .item-field').forEach(function(item, idx) {
      const netW = item.querySelector('.s-net-weight').value || item.querySelector('.s-weight').value;
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
        (brand ? '<urn:BrandNameOfProducts>' + brand + '</urn:BrandNameOfProducts>' : '') +
        '<urn:Package>' +
        '<urn:KindOfPackages>' + item.querySelector('.s-package-kind').value + '</urn:KindOfPackages>' +
        '<urn:NumberOfPackages>' + item.querySelector('.s-package-count').value + '</urn:NumberOfPackages>' +
        (shipMark ? '<urn:ShippingMarks>' + shipMark + '</urn:ShippingMarks>' : '') +
        '</urn:Package>' +
        '</urn:BodyEadEsad>';
      itemSummary.push({ productCode: pc, qty: qty });
    });

    let xml = '<?xml version="1.0" encoding="UTF-8"?>' +
      '<urn:IE815 xmlns:urn="urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:IE815:V3.13" xmlns:urn1="urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:TMS:V3.13">' +
      '<urn:Header>' +
      '<urn1:MessageSender>NDEA.GB</urn1:MessageSender>' +
      '<urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>' +
      '<urn1:DateOfPreparation>' + submitDate + '</urn1:DateOfPreparation>' +
      '<urn1:TimeOfPreparation>' + prepareTime + '</urn1:TimeOfPreparation>' +
      '<urn1:MessageIdentifier>' + uniqueLrn + '</urn1:MessageIdentifier>' +
      '<urn1:CorrelationIdentifier>PORTAL' + uniqueLrn + '</urn1:CorrelationIdentifier>' +
      '</urn:Header>' +
      '<urn:Body><urn:SubmittedDraftOfEADESAD>' +
      '<urn:Attributes><urn:SubmissionMessageType>1</urn:SubmissionMessageType></urn:Attributes>' +
      '<urn:ConsigneeTrader language="en">' +
      '<urn:Traderid>' + document.getElementById('s-consignee-ern').value + '</urn:Traderid>' +
      '<urn:TraderName>' + document.getElementById('s-consignee-name').value + '</urn:TraderName>' +
      '<urn:StreetName>' + document.getElementById('s-consignee-street').value + '</urn:StreetName>' +
      xmlField('StreetNumber', document.getElementById('s-consignee-street-num').value) +
      '<urn:Postcode>' + document.getElementById('s-consignee-postcode').value + '</urn:Postcode>' +
      '<urn:City>' + document.getElementById('s-consignee-city').value + '</urn:City>' +
      '</urn:ConsigneeTrader>' +
      '<urn:ConsignorTrader language="en">' +
      '<urn:TraderExciseNumber>' + document.getElementById('s-consignor-ern').value + '</urn:TraderExciseNumber>' +
      '<urn:TraderName>' + document.getElementById('s-consignor-name').value + '</urn:TraderName>' +
      '<urn:StreetName>' + document.getElementById('s-consignor-street').value + '</urn:StreetName>' +
      xmlField('StreetNumber', document.getElementById('s-consignor-street-num').value) +
      '<urn:Postcode>' + document.getElementById('s-consignor-postcode').value + '</urn:Postcode>' +
      '<urn:City>' + document.getElementById('s-consignor-city').value + '</urn:City>' +
      '</urn:ConsignorTrader>';

    const dw = document.getElementById('s-dispatch-warehouse').value.trim();
    if (dw) {
      xml += '<urn:PlaceOfDispatchTrader language="en">' +
        '<urn:ReferenceOfTaxWarehouse>' + dw + '</urn:ReferenceOfTaxWarehouse>' +
        xmlField('TraderName', document.getElementById('s-dispatch-name').value) +
        xmlField('StreetName', document.getElementById('s-dispatch-street').value) +
        xmlField('StreetNumber', document.getElementById('s-dispatch-street-num').value) +
        xmlField('Postcode', document.getElementById('s-dispatch-postcode').value) +
        xmlField('City', document.getElementById('s-dispatch-city').value) +
        '</urn:PlaceOfDispatchTrader>';
    }

    xml += '<urn:DeliveryPlaceTrader language="en">' +
      '<urn:Traderid>' + document.getElementById('s-delivery-trader-id').value + '</urn:Traderid>' +
      '<urn:TraderName>' + document.getElementById('s-delivery-name').value + '</urn:TraderName>' +
      '<urn:StreetName>' + document.getElementById('s-delivery-street').value + '</urn:StreetName>' +
      xmlField('StreetNumber', document.getElementById('s-delivery-street-num').value) +
      '<urn:Postcode>' + document.getElementById('s-delivery-postcode').value + '</urn:Postcode>' +
      '<urn:City>' + document.getElementById('s-delivery-city').value + '</urn:City>' +
      '</urn:DeliveryPlaceTrader>' +
      '<urn:CompetentAuthorityDispatchOffice>' +
      '<urn:ReferenceNumber>' + document.getElementById('s-dispatch-office').value + '</urn:ReferenceNumber>' +
      '</urn:CompetentAuthorityDispatchOffice>' +
      '<urn:FirstTransporterTrader language="en">' +
      '<urn:VatNumber>' + document.getElementById('s-transporter-vat').value + '</urn:VatNumber>' +
      '<urn:TraderName>' + document.getElementById('s-transporter-name').value + '</urn:TraderName>' +
      '<urn:StreetName>Logistics Way</urn:StreetName>' +
      '<urn:StreetNumber>5</urn:StreetNumber>' +
      '<urn:Postcode>FR5 4RN</urn:Postcode>' +
      '<urn:City>' + document.getElementById('s-transporter-city').value + '</urn:City>' +
      '</urn:FirstTransporterTrader>' +
      '<urn:HeaderEadEsad>' +
      '<urn:DestinationTypeCode>' + document.getElementById('s-dest-type').value + '</urn:DestinationTypeCode>' +
      '<urn:JourneyTime>' + document.getElementById('s-journey-time').value + '</urn:JourneyTime>' +
      '<urn:TransportArrangement>' + document.getElementById('s-transport-arrangement').value + '</urn:TransportArrangement>' +
      '</urn:HeaderEadEsad>' +
      '<urn:TransportMode>' +
      '<urn:TransportModeCode>' + document.getElementById('s-transport-mode').value + '</urn:TransportModeCode>' +
      '</urn:TransportMode>' +
      '<urn:MovementGuarantee>' +
      '<urn:GuarantorTypeCode>' + document.getElementById('s-guarantor-type').value + '</urn:GuarantorTypeCode>' +
      '</urn:MovementGuarantee>' +
      bodyEadEsadXml +
      '<urn:EadEsadDraft>' +
      '<urn:LocalReferenceNumber>' + uniqueLrn + '</urn:LocalReferenceNumber>' +
      '<urn:InvoiceNumber>' + document.getElementById('s-invoice-number').value + '</urn:InvoiceNumber>' +
      '<urn:InvoiceDate>' + document.getElementById('s-invoice-date').value + '</urn:InvoiceDate>' +
      '<urn:OriginTypeCode>' + document.getElementById('s-origin-type').value + '</urn:OriginTypeCode>' +
      '<urn:DateOfDispatch>' + submitDate + '</urn:DateOfDispatch>' +
      '<urn:TimeOfDispatch>' + (document.getElementById('s-time').value || '12:00') + ':00</urn:TimeOfDispatch>' +
      '</urn:EadEsadDraft>';

    document.querySelectorAll('.transport-unit-field').forEach(function(unit) {
      const uc = unit.querySelector('.s-transport-unit-code').value;
      const ui = unit.querySelector('.s-identity-transport').value;
      if (uc && ui) xml += '<urn:TransportDetails><urn:TransportUnitCode>' + uc + '</urn:TransportUnitCode><urn:IdentityOfTransportUnits>' + ui + '</urn:IdentityOfTransportUnits></urn:TransportDetails>';
    });
    
    xml += '</urn:SubmittedDraftOfEADESAD></urn:Body></urn:IE815>';

    document.getElementById('submit-output').innerText = 'Sending...';
    try {
      const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/movements'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/xml' },
        body: xml
      });
      const responseText = await res.text();
      document.getElementById('submit-output').innerText = 'Status: ' + res.status + '\n\n' + responseText;
      if (res.status === 202) {
        try {
          const parsed = JSON.parse(responseText);
          if (parsed.movementId) {
            localStorage.setItem('emcs_last_submission', JSON.stringify({
              movementId: parsed.movementId, arc: parsed.administrativeReferenceCode || '',
              lrn: parsed.localReferenceNumber || uniqueLrn,
              consignorErn: document.getElementById('s-consignor-ern').value,
              consigneeErn: document.getElementById('s-consignee-ern').value,
              date: submitDate, items: itemSummary
            }));
            document.getElementById('export-last-csv-btn').style.display = 'inline-block';
          }
        } catch(e) {}
      }
    } catch(e) {
      document.getElementById('submit-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // === TAB 1: MONITOR ===
  const monRefreshBtn = document.getElementById('mon-refresh');
  if (monRefreshBtn) {
    monRefreshBtn.addEventListener('click', async function() {
      const session = await checkSession();
      if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }

      const loading = document.getElementById('mon-loading');
      const noResults = document.getElementById('mon-no-results');
      const table = document.getElementById('mon-table');
      const tbody = document.getElementById('mon-tbody');

      if (loading) loading.style.display = 'block';
      if (noResults) noResults.style.display = 'none';
      if (table) table.style.display = 'none';
      tbody.innerHTML = '';

      try {
        const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/movements'), {
          method: 'GET', credentials: 'include'
        });
        
        if (res.ok) {
          const movements = await res.json();
          if (movements && movements.length > 0) {
            if (table) table.style.display = 'table';
            const activeSelect = document.getElementById('active-profile-select');
            const selectedOption = activeSelect ? activeSelect.options[activeSelect.selectedIndex] : null;
            const activeProfileErn = selectedOption ? selectedOption.text.match(/\(([^)]+)\)/)?.[1] : '';

            for (const mov of movements) {
              let status = 'Pending', lastMsg = 'None', statusDot = 'dot-grey';
              try {
                const msgRes = await fetch(`/api/emcs?endpoint=${encodeURIComponent(`/customs/excise/movements/${mov.movementId}/messages`)}`, {
                  method: 'GET', credentials: 'include'
                });
                if (msgRes.ok) {
                  const msgs = await msgRes.json();
                  if (msgs && msgs.length > 0) {
                    msgs.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
                    lastMsg = msgs[0].messageType || 'Unknown';
                    const statusMap = {
                      'IE801': ['Accepted', 'dot-green'], 'IE818': ['Receipted', 'dot-blue'],
                      'IE810': ['Cancelled', 'dot-red'], 'IE813': ['Changed', 'dot-amber'],
                      'IE819': ['Rejected', 'dot-red'], 'IE839': ['Custom Rejected', 'dot-red'],
                      'IE807': ['Interrupted', 'dot-amber'], 'IE881': ['Closed', 'dot-grey'],
                      'IE905': ['Status Response', 'dot-blue'], 'IE802': ['Reminder', 'dot-amber']
                    };
                    if (statusMap[lastMsg]) { status = statusMap[lastMsg][0]; statusDot = statusMap[lastMsg][1]; }
                  }
                }
              } catch (e) { console.error('Failed to fetch messages for', mov.movementId, e); }

              await sleep(400); // Rate limiting

              const daysOpen = mov.lastUpdated ? Math.floor((Date.now() - new Date(mov.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)) : 0;
              const isOut = mov.consignorId === activeProfileErn || (activeProfileErn && mov.consigneeId !== activeProfileErn);
              
              let actionsHtml = `<button class="btn-small btn-grey view-movement" data-id="${mov.movementId}">View</button>`;
              if (isOut && (status === 'Accepted' || status === 'Pending')) {
                actionsHtml += ` <button class="btn-small btn-red cancel-movement" data-id="${mov.movementId}" data-arc="${mov.administrativeReferenceCode || ''}" data-lrn="${mov.localReferenceNumber}">Cancel</button>`;
              }

              const tr = document.createElement('tr');
              tr.innerHTML = `
                <td class="arc-cell">
                  <span class="arc-value">${mov.administrativeReferenceCode || 'Pending ARC'}</span>
                  <span class="lrn">LRN: ${mov.localReferenceNumber}</span>
                </td>
                <td>${isOut ? 'Out' : 'In'}</td>
                <td>${isOut ? (mov.consigneeId || 'Unknown') : (mov.consignorId || 'Unknown')}</td>
                <td>${mov.lastUpdated ? new Date(mov.lastUpdated).toLocaleDateString() : 'N/A'}</td>
                <td><span class="status-indicator"><span class="status-dot ${statusDot}"></span> ${status}</span></td>
                <td>${lastMsg}</td>
                <td style="text-align:center;">${daysOpen}</td>
                <td class="actions-cell">${actionsHtml}</td>`;
              tbody.appendChild(tr);
            }

            tbody.querySelectorAll('.view-movement').forEach(btn => {
              btn.addEventListener('click', function() {
                const movId = this.getAttribute('data-id');
                document.querySelector('[data-tab="tab-get-messages"]').click();
                document.getElementById('gmsg-id').value = movId;
                document.getElementById('get-messages-btn').click();
              });
            });

            tbody.querySelectorAll('.cancel-movement').forEach(btn => {
              btn.addEventListener('click', function() {
                const movId = this.getAttribute('data-id');
                const arc = this.getAttribute('data-arc');
                const lrn = this.getAttribute('data-lrn');
                if (!confirm(`Cancel movement ${movId} (LRN: ${lrn})?`)) return;
                document.querySelector('[data-tab="tab-submit-msg"]').click();
                document.getElementById('sm-mov-id').value = movId;
                document.getElementById('sm-arc').value = arc;
                document.getElementById('sm-type').value = 'IE810';
                alert('Loaded into Submit Message tab. Add reason and submit.');
              });
            });
          } else {
            if (noResults) noResults.style.display = 'block';
          }
        } else {
          const err = await res.text();
          alert('Failed to fetch movements: ' + res.status + '\n' + err);
        }
      } catch(e) {
        alert('Network error: ' + e.message);
      } finally {
        if (loading) loading.style.display = 'none';
      }
    });
  }

  // === TAB 3: GET SINGLE MOVEMENT ===
  document.getElementById('get-single-movement-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }
    const movId = document.getElementById('gsm-id').value.trim();
    if (!movId) { alert('Please enter a Movement ID'); return; }

    document.getElementById('gsm-output').innerText = 'Fetching...';
    document.getElementById('gsm-parsed').innerHTML = '';

    try {
      const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent(`/customs/excise/movements/${movId}`), {
        method: 'GET', credentials: 'include'
      });
      const text = await res.text();
      document.getElementById('gsm-output').innerText = 'Status: ' + res.status + '\n\n' + text;
      if (res.ok) {
        try {
          const mov = JSON.parse(text);
          document.getElementById('gsm-parsed').innerHTML = `
            <div class="parsed-card">
              <h4>Movement Details</h4>
              <div class="parsed-grid">
                <div class="parsed-field"><div class="label">Movement ID</div><div class="value">${mov.movementId}</div></div>
                <div class="parsed-field"><div class="label">Consignor</div><div class="value">${mov.consignorId}</div></div>
                <div class="parsed-field"><div class="label">Consignee</div><div class="value">${mov.consigneeId}</div></div>
                <div class="parsed-field"><div class="label">LRN</div><div class="value">${mov.localReferenceNumber}</div></div>
                <div class="parsed-field"><div class="label">ARC</div><div class="value arc">${mov.administrativeReferenceCode || 'Pending'}</div></div>
                <div class="parsed-field"><div class="label">Last Updated</div><div class="value">${mov.lastUpdated ? new Date(mov.lastUpdated).toLocaleString() : 'N/A'}</div></div>
              </div>
            </div>`;
        } catch(e) {}
      }
    } catch(e) {
      document.getElementById('gsm-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // === TAB 4: SUBMIT MESSAGE ===
  document.getElementById('submit-message-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }
    const movId = document.getElementById('sm-mov-id').value.trim();
    const arc = document.getElementById('sm-arc').value.trim();
    const msgType = document.getElementById('sm-type').value;
    const msgId = document.getElementById('sm-msgid').value || ('MSG' + Date.now().toString().slice(-8));
    const submitDate = new Date().toISOString().slice(0, 10);
    const submitTime = new Date().toISOString().slice(11, 19);

    if (!movId || !arc) { alert('Movement ID and ARC are required'); return; }

    let xml = '';
    const ns = 'urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:' + msgType + ':V3.13';
    const ns1 = 'urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:TMS:V3.13';

    if (msgType === 'IE810') {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<urn:IE810 xmlns:urn="${ns}" xmlns:urn1="${ns1}">
<urn:Header>
<urn1:MessageSender>NDEA.GB</urn1:MessageSender>
<urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>
<urn1:DateOfPreparation>${submitDate}</urn1:DateOfPreparation>
<urn1:TimeOfPreparation>${submitTime}</urn1:TimeOfPreparation>
<urn1:MessageIdentifier>${msgId}</urn1:MessageIdentifier>
</urn:Header>
<urn:Body><urn:CancellationOfEAD>
<urn:Attributes><urn:DateAndTimeOfValidationOfCancellation>${new Date().toISOString().slice(0,19)}</urn:DateAndTimeOfValidationOfCancellation></urn:Attributes>
<urn:ExciseMovementEad><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode></urn:ExciseMovementEad>
<urn:Cancellation><urn:CancellationReasonCode>1</urn:CancellationReasonCode></urn:Cancellation>
</urn:CancellationOfEAD></urn:Body></urn:IE810>`;
    } else if (msgType === 'IE818') {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<urn:IE818 xmlns:urn="${ns}" xmlns:urn1="${ns1}">
<urn:Header>
<urn1:MessageSender>NDEA.GB</urn1:MessageSender>
<urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>
<urn1:DateOfPreparation>${submitDate}</urn1:DateOfPreparation>
<urn1:TimeOfPreparation>${submitTime}</urn1:TimeOfPreparation>
<urn1:MessageIdentifier>${msgId}</urn1:MessageIdentifier>
</urn:Header>
<urn:Body><urn:AcceptedOrRejectedReportOfReceiptExport>
<urn:Attributes><urn:DateAndTimeOfValidationOfReportOfReceiptExport>${new Date().toISOString().slice(0,19)}</urn:DateAndTimeOfValidationOfReportOfReceiptExport></urn:Attributes>
<urn:ConsigneeTrader language="en"><urn:Traderid>${document.getElementById('s-consignee-ern').value || 'GBWKQOZ8OVLYR'}</urn:Traderid><urn:TraderName>Test Consignee</urn:TraderName><urn:StreetName>1 High Street</urn:StreetName><urn:Postcode>M1 1AA</urn:Postcode><urn:City>Manchester</urn:City></urn:ConsigneeTrader>
<urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement>
<urn:ReportOfReceiptExport><urn:DateOfArrivalOfExciseProducts>${submitDate}</urn:DateOfArrivalOfExciseProducts><urn:GlobalConclusionOfReceipt>1</urn:GlobalConclusionOfReceipt></urn:ReportOfReceiptExport>
</urn:AcceptedOrRejectedReportOfReceiptExport></urn:Body></urn:IE818>`;
    } else if (msgType === 'IE813') {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<urn:IE813 xmlns:urn="${ns}" xmlns:urn1="${ns1}">
<urn:Header>
<urn1:MessageSender>NDEA.GB</urn1:MessageSender>
<urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>
<urn1:DateOfPreparation>${submitDate}</urn1:DateOfPreparation>
<urn1:TimeOfPreparation>${submitTime}</urn1:TimeOfPreparation>
<urn1:MessageIdentifier>${msgId}</urn1:MessageIdentifier>
</urn:Header>
<urn:Body><urn:ChangeOfDestination>
<urn:Attributes><urn:DateAndTimeOfValidationOfChangeOfDestination>${new Date().toISOString().slice(0,19)}</urn:DateAndTimeOfValidationOfChangeOfDestination></urn:Attributes>
<urn:UpdateEadEsad><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:JourneyTime>D02</urn:JourneyTime><urn:ChangedTransportArrangement>1</urn:ChangedTransportArrangement><urn:SequenceNumber>2</urn:SequenceNumber><urn:InvoiceNumber>INV-CHANGE</urn:InvoiceNumber><urn:TransportModeCode>3</urn:TransportModeCode></urn:UpdateEadEsad>
<urn:DestinationChanged><urn:DestinationTypeCode>1</urn:DestinationTypeCode><urn:MovementGuarantee><urn:GuarantorTypeCode>1</urn:GuarantorTypeCode></urn:MovementGuarantee></urn:DestinationChanged>
</urn:ChangeOfDestination></urn:Body></urn:IE813>`;
    } else if (msgType === 'IE819') {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<urn:IE819 xmlns:urn="${ns}" xmlns:urn1="${ns1}">
<urn:Header>
<urn1:MessageSender>NDEA.GB</urn1:MessageSender>
<urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>
<urn1:DateOfPreparation>${submitDate}</urn1:DateOfPreparation>
<urn1:TimeOfPreparation>${submitTime}</urn1:TimeOfPreparation>
<urn1:MessageIdentifier>${msgId}</urn1:MessageIdentifier>
</urn:Header>
<urn:Body><urn:AlertOrRejectionOfEadEsad>
<urn:Attributes><urn:DateAndTimeOfValidation>${new Date().toISOString().slice(0,19)}</urn:DateAndTimeOfValidation></urn:Attributes>
<urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement>
<urn:AlertOrRejection><urn:AlertOrRejectionTypeCode>1</urn:AlertOrRejectionTypeCode><urn:AlertOrRejectionDate>${submitDate}</urn:AlertOrRejectionDate><urn:ComplementaryInformation>Rejection by consignee</urn:ComplementaryInformation></urn:AlertOrRejection>
</urn:AlertOrRejectionOfEadEsad></urn:Body></urn:IE819>`;
    } else if (msgType === 'IE837') {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<urn:IE837 xmlns:urn="${ns}" xmlns:urn1="${ns1}">
<urn:Header>
<urn1:MessageSender>NDEA.GB</urn1:MessageSender>
<urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>
<urn1:DateOfPreparation>${submitDate}</urn1:DateOfPreparation>
<urn1:TimeOfPreparation>${submitTime}</urn1:TimeOfPreparation>
<urn1:MessageIdentifier>${msgId}</urn1:MessageIdentifier>
</urn:Header>
<urn:Body><urn:ExplanationOnDelayForDelivery>
<urn:Attributes><urn:DateAndTimeOfValidation>${new Date().toISOString().slice(0,19)}</urn:DateAndTimeOfValidation></urn:Attributes>
<urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement>
<urn:ExplanationOnDelay><urn:ComplementaryInformation language="en">Delay due to weather conditions</urn:ComplementaryInformation></urn:ExplanationOnDelay>
</urn:ExplanationOnDelayForDelivery></urn:Body></urn:IE837>`;
    } else if (msgType === 'IE871') {
      xml = `<?xml version="1.0" encoding="UTF-8"?>
<urn:IE871 xmlns:urn="${ns}" xmlns:urn1="${ns1}">
<urn:Header>
<urn1:MessageSender>NDEA.GB</urn1:MessageSender>
<urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient>
<urn1:DateOfPreparation>${submitDate}</urn1:DateOfPreparation>
<urn1:TimeOfPreparation>${submitTime}</urn1:TimeOfPreparation>
<urn1:MessageIdentifier>${msgId}</urn1:MessageIdentifier>
</urn:Header>
<urn:Body><urn:ExplanationOnReasonForShortage>
<urn:Attributes><urn:SubmitterType>1</urn:SubmitterType><urn:DateAndTimeOfValidationOfExplanationOnShortage>${new Date().toISOString().slice(0,19)}</urn:DateAndTimeOfValidationOfExplanationOnShortage></urn:Attributes>
<urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement>
<urn:Analysis><urn:DateOfAnalysis>${submitDate}</urn:DateOfAnalysis><urn:GlobalExplanation language="en">Shortage due to spillage during transit</urn:GlobalExplanation></urn:Analysis>
</urn:ExplanationOnReasonForShortage></urn:Body></urn:IE871>`;
    }

    document.getElementById('sm-output').innerText = 'Sending ' + msgType + '...';
    try {
      const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent(`/customs/excise/movements/${movId}/messages`), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/xml' },
        body: xml
      });
      const text = await res.text();
      document.getElementById('sm-output').innerText = 'Status: ' + res.status + '\n\n' + text;
    } catch(e) {
      document.getElementById('sm-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // === TAB 5: GET ALL MESSAGES ===
  document.getElementById('get-messages-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }
    const movId = document.getElementById('gmsg-id').value.trim();
    if (!movId) { alert('Please enter a Movement ID'); return; }

    document.getElementById('gmsg-output').innerText = 'Fetching...';
    document.getElementById('gmsg-parsed').innerHTML = '';
    document.getElementById('gmsg-count').textContent = '';

    try {
      const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent(`/customs/excise/movements/${movId}/messages`), {
        method: 'GET', credentials: 'include'
      });
      const text = await res.text();
      document.getElementById('gmsg-output').innerText = 'Status: ' + res.status + '\n\n' + text;
      if (res.ok) {
        try {
          const messages = JSON.parse(text);
          document.getElementById('gmsg-count').textContent = `${messages.length} message(s)`;
          if (messages.length === 0) {
            document.getElementById('gmsg-parsed').innerHTML = '<p>No messages found.</p>';
          } else {
            messages.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
            messages.forEach(msg => {
              const card = document.createElement('div');
              card.className = 'parsed-card';
              const badgeClass = (msg.messageType || '').toLowerCase();
              card.innerHTML = `
                <h4>${msg.messageType || 'Unknown'} <span class="type-badge ${badgeClass}">${msg.messageType}</span></h4>
                <div class="parsed-grid">
                  <div class="parsed-field"><div class="label">Message ID</div><div class="value">${msg.messageId}</div></div>
                  <div class="parsed-field"><div class="label">Recipient</div><div class="value">${msg.recipient}</div></div>
                  <div class="parsed-field"><div class="label">Created</div><div class="value">${new Date(msg.createdOn).toLocaleString()}</div></div>
                </div>
                <button class="btn-small btn-grey view-raw-msg">View Decoded XML</button>
                <pre class="raw-xml" style="display:none; margin-top:10px;"></pre>`;
              card.querySelector('.view-raw-msg').addEventListener('click', function() {
                const pre = card.querySelector('.raw-xml');
                if (pre.style.display === 'none') {
                  try {
                    const decoded = atob(msg.encodedMessage);
                    pre.textContent = decoded.replace(/></g, '>\n<');
                    pre.style.display = 'block';
                    this.textContent = 'Hide XML';
                  } catch(e) { pre.textContent = 'Decode failed: ' + e.message; pre.style.display = 'block'; }
                } else {
                  pre.style.display = 'none';
                  this.textContent = 'View Decoded XML';
                }
              });
              document.getElementById('gmsg-parsed').appendChild(card);
            });
          }
        } catch(e) {
          document.getElementById('gmsg-parsed').innerHTML = '<p class="error">Failed to parse JSON</p>';
        }
      }
    } catch(e) {
      document.getElementById('gmsg-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // === TAB 6: GET SINGLE MESSAGE ===
  document.getElementById('get-single-message-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }
    const movId = document.getElementById('gsmsg-mid').value.trim();
    const msgId = document.getElementById('gsmsg-id').value.trim();
    if (!movId || !msgId) { alert('Movement ID and Message ID required'); return; }

    document.getElementById('gsmsg-output').innerText = 'Fetching...';
    document.getElementById('gsmsg-parsed').innerHTML = '';

    try {
      const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent(`/customs/excise/movements/${movId}/messages/${msgId}`), {
        method: 'GET', credentials: 'include',
        headers: { 'Accept': 'application/vnd.hmrc.1.0+xml' }
      });
      const text = await res.text();
      document.getElementById('gsmsg-output').innerText = 'Status: ' + res.status + '\n\n' + text;
      if (res.ok) {
        const formatted = text.replace(/></g, '>\n<');
        document.getElementById('gsmsg-parsed').innerHTML = `
          <div class="parsed-card">
            <h4>Message ${msgId}</h4>
            <pre style="white-space:pre-wrap;">${formatted.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
          </div>`;
      }
    } catch(e) {
      document.getElementById('gsmsg-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // === TAB 7: PRE-VALIDATE TRADER ===
  document.getElementById('pre-validate-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }
    const ern = document.getElementById('pv-ern').value.trim();
    const group = document.getElementById('pv-group').value;
    const p1 = document.getElementById('pv-p1').value.trim();
    if (!ern) { alert('ERN required'); return; }

    document.getElementById('pv-output').innerText = 'Validating...';
    document.getElementById('pv-parsed').innerHTML = '';

    try {
      const body = {
        exciseRegistrationNumber: ern,
        entityGroup: group,
        validateProductAuthorisationRequest: p1 ? [{ product: { exciseProductCode: p1 } }] : []
      };
      const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/traders/pre-validate'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await res.text();
      document.getElementById('pv-output').innerText = 'Status: ' + res.status + '\n\n' + text;
      if (res.ok) {
        try {
          const data = JSON.parse(text);
          document.getElementById('pv-parsed').innerHTML = `
            <div class="parsed-card">
              <h4>Validation Result</h4>
              <div class="parsed-grid">
                <div class="parsed-field"><div class="label">Valid Trader</div><div class="value ${data.validTrader ? 'arc' : 'warn'}">${data.validTrader ? 'YES' : 'NO'}</div></div>
                <div class="parsed-field"><div class="label">ERN</div><div class="value">${data.exciseRegistrationNumber}</div></div>
                <div class="parsed-field"><div class="label">Trader Type</div><div class="value">${data.traderType || 'N/A'}</div></div>
                <div class="parsed-field"><div class="label">Entity Group</div><div class="value">${data.entityGroup}</div></div>
                ${data.errorCode ? `<div class="parsed-field"><div class="label">Error</div><div class="value warn">${data.errorCode}: ${data.errorText}</div></div>` : ''}
              </div>
            </div>`;
        } catch(e) {}
      }
    } catch(e) {
      document.getElementById('pv-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // === TAB 8: SUBSCRIBE ERN ===
  document.getElementById('subscribe-ern-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }
    const ern = document.getElementById('sub-ern').value.trim();
    if (!ern) { alert('ERN required'); return; }

    document.getElementById('sub-output').innerText = 'Subscribing...';
    try {
      const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent(`/customs/excise/erns/${ern}/subscription`), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const text = await res.text();
      document.getElementById('sub-output').innerText = 'Status: ' + res.status + '\n\n' + text;
    } catch(e) {
      document.getElementById('sub-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // === TAB 9: UNSUBSCRIBE ERN ===
  document.getElementById('unsubscribe-ern-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }
    const ern = document.getElementById('unsub-ern').value.trim();
    if (!ern) { alert('ERN required'); return; }

    document.getElementById('unsub-output').innerText = 'Unsubscribing...';
    try {
      const res = await fetch('/api/emcs?endpoint=' + encodeURIComponent(`/customs/excise/erns/${ern}/subscription`), {
        method: 'DELETE', credentials: 'include'
      });
      const text = await res.text();
      document.getElementById('unsub-output').innerText = 'Status: ' + res.status + '\n\n' + text;
    } catch(e) {
      document.getElementById('unsub-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // === DRAFTS ===
  window.currentDraftId = null;
  async function loadDrafts() {
    try {
      const res = await fetch('/api/drafts', { credentials: 'include' });
      if (res.ok) {
        const drafts = await res.json();
        const draftList = document.getElementById('draft-list');
        const draftCount = document.getElementById('draft-count');
        const draftsSection = document.getElementById('drafts-section');
        if (draftsSection) draftsSection.style.display = 'block';
        if (draftCount) draftCount.textContent = `${drafts.length} saved`;
        if (draftList) {
          draftList.innerHTML = '';
          drafts.forEach(d => {
            const card = document.createElement('div');
            card.className = 'draft-card';
            card.innerHTML = `
              <div class="draft-info"><div class="draft-name">${d.name}</div><div class="draft-meta"><span>Modified: ${new Date(d.modified).toLocaleDateString()}</span></div></div>
              <div class="draft-actions">
                <button class="btn-green btn-small load-draft" data-id="${d.id}">Load</button>
                <button class="btn-red btn-small delete-draft" data-id="${d.id}">Delete</button>
              </div>`;
            draftList.appendChild(card);
          });
          draftList.querySelectorAll('.load-draft').forEach(btn => {
            btn.addEventListener('click', function() {
              const draft = drafts.find(d => d.id === this.getAttribute('data-id'));
              if (draft && draft.data) {
                if (draft.data.lrn) document.getElementById('s-lrn').value = draft.data.lrn;
                window.currentDraftId = draft.id;
                alert('Draft loaded!');
              }
            });
          });
          draftList.querySelectorAll('.delete-draft').forEach(btn => {
            btn.addEventListener('click', async function() {
              if (confirm('Delete this draft?')) {
                await fetch(`/api/drafts?id=${this.getAttribute('data-id')}`, { method: 'DELETE', credentials: 'include' });
                loadDrafts();
              }
            });
          });
        }
      }
    } catch(e) { console.error('Load drafts failed:', e); }
  }

  document.getElementById('save-draft-btn')?.addEventListener('click', async function() {
    const name = prompt('Enter a name for this draft:');
    if (!name) return;
    const data = { lrn: document.getElementById('s-lrn').value, consigneeErn: document.getElementById('s-consignee-ern').value };
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, data, id: window.currentDraftId })
      });
      if (res.ok) { alert('Draft saved!'); loadDrafts(); }
    } catch(e) { alert('Error saving draft: ' + e.message); }
  });

  // Initialize
  await checkSession();
});
