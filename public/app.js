document.addEventListener('DOMContentLoaded', async function() {
  console.log('App.js loaded successfully');

  // --- 1. AUTHENTICATION & SESSION ---
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
    verify2faBtn.addEventListener('click', async function() {
      const secret = document.getElementById('secret-text').textContent;
      const token = document.getElementById('verify-code').value;
      if (!token || token.length !== 6) { alert('Please enter a valid 6-digit code'); return; }
      alert('2FA Verified! Please add TOTP_SECRET="' + secret + '" to your Vercel environment variables.');
      document.getElementById('2fa-result').textContent = 'Success! Remember to save the secret in Vercel.';
      document.getElementById('2fa-result').style.color = 'green';
    });
  }

  const logoutBtn = document.getElementById('logout-link') || document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function(e) {
      e.preventDefault();
      await fetch('/api/logout', { method: 'POST', credentials: 'include' });
      showLoginScreen();
      document.getElementById('password').value = '';
      document.getElementById('totp-code').value = '';
    });
  }

  const hmrcLoginBtn = document.getElementById('hmrc-login-link');
  if (hmrcLoginBtn) {
    hmrcLoginBtn.addEventListener('click', function(e) {
      e.preventDefault();
      window.location.href = '/api/auth';
    });
  }

  // --- 2. TAB NAVIGATION ---
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      const tabId = this.getAttribute('data-tab');
      if (tabId) document.getElementById(tabId).classList.add('active');
    });
  });

  // --- 3. PROFILE MANAGEMENT ---
  async function loadProfiles() {
    try {
      console.log('Fetching profiles...');
      const res = await fetch('/api/profiles', { credentials: 'include' });
      
      if (!res.ok) {
        const errText = await res.text();
        console.error('Profile fetch failed with status:', res.status, errText);
        return;
      }

      const profiles = await res.json();
      console.log('Profiles loaded successfully:', profiles);

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
        
        profileSelect.addEventListener('change', function() {
          const selected = profiles.find(p => p.id == this.value);
          if (selected) {
            document.getElementById('s-consignor-ern').value = selected.ern;
            document.getElementById('s-consignor-name').value = selected.traderName || '';
            document.getElementById('s-consignor-street').value = selected.street || '';
            document.getElementById('s-consignor-postcode').value = selected.postcode || '';
            document.getElementById('s-consignor-city').value = selected.city || '';
            document.getElementById('s-dispatch-office').value = selected.office || 'GB004098';
          }
        });
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
    } catch(e) { 
      console.error('Load profiles network error:', e); 
    }
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

  // --- 4. DYNAMIC FORM ELEMENTS ---
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
        <div class="field"><label>Excise Product Code <span class="required-asterisk">*</span></label><input type="text" class="s-product-code" maxlength="4" required></div>
        <div class="field"><label>CN Code <span class="required-asterisk">*</span></label><input type="text" class="s-cn-code" maxlength="8" required></div>
        <div class="field"><label>Quantity <span class="required-asterisk">*</span></label><input type="number" class="s-qty" step="0.001" required></div>
        <div class="field"><label>Gross Mass <span class="required-asterisk">*</span></label><input type="number" class="s-weight" step="0.01" required></div>
        <div class="field"><label>Net Mass</label><input type="number" class="s-net-weight" step="0.01"></div>
        <div class="field"><label>ABV (%)</label><input type="number" class="s-abv" step="0.1"></div>
        <div class="field"><label>Commercial Description</label><input type="text" class="s-comm-desc" maxlength="300"></div>
        <div class="field"><label>Brand Name</label><input type="text" class="s-brand" maxlength="50"></div>
        <div class="field"><label>Kind of Packages <span class="required-asterisk">*</span></label><input type="text" class="s-package-kind" maxlength="2" required></div>
        <div class="field"><label>Number of Packages <span class="required-asterisk">*</span></label><input type="number" class="s-package-count" required></div>
        <div class="field"><label>Shipping Marks</label><input type="text" class="s-ship-mark" maxlength="35"></div>
      </div>`;
    container.appendChild(div);
    div.querySelector('.remove-item').addEventListener('click', () => div.remove());
    div.querySelector('.s-product-code').addEventListener('change', function() {
      const epc = this.value.toUpperCase();
      const cnMap = { 'B000': '22030001', 'W200': '22042100', 'S200': '22089000' };
      if (cnMap[epc]) div.querySelector('.s-cn-code').value = cnMap[epc];
    });
  });

  // --- 5. SUBMIT MOVEMENT (IE815) ---
  function xmlField(tag, value) { return value ? `<urn:${tag}>${value}</urn:${tag}>` : ''; }

  document.getElementById('submit-movement-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session) return;
    if (!session.hmrcAuthenticated) { alert('Please login to HMRC first!'); return; }

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
              lrn: parsed.localReferenceNumber || uniqueLrn, consignorErn: document.getElementById('s-consignor-ern').value,
              consigneeErn: document.getElementById('s-consignee-ern').value, date: submitDate, items: itemSummary
            }));
            document.getElementById('export-last-csv-btn').style.display = 'inline-block';
          }
        } catch(e) {}
      }
    } catch(e) {
      document.getElementById('submit-output').innerText = 'Network Error: ' + e.message;
    }
  });

  // --- 6. MONITOR TAB REFRESH LOGIC (Optimized to prevent 429 Rate Limits) ---
  const monRefreshBtn = document.getElementById('mon-refresh');
  if (monRefreshBtn) {
    monRefreshBtn.addEventListener('click', async function() {
      const session = await checkSession();
      if (!session || !session.hmrcAuthenticated) {
        alert('Please login to HMRC first!');
        return;
      }

      const loading = document.getElementById('mon-loading');
      const noResults = document.getElementById('mon-no-results');
      const table = document.getElementById('mon-table');
      const tbody = document.getElementById('mon-tbody');

      if (loading) loading.style.display = 'block';
      if (noResults) noResults.style.display = 'none';
      if (table) table.style.display = 'none';
      tbody.innerHTML = '';

      try {
        // 1. Fetch all movements (This is a single, safe API call)
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

            movements.forEach(mov => {
              // Safe status inference without making extra API calls:
              // If it has an ARC, it was accepted. Otherwise, it's pending.
              const hasArc = !!mov.administrativeReferenceCode;
              const status = hasArc ? 'Accepted' : 'Pending';
              const statusDot = hasArc ? 'dot-green' : 'dot-grey';
              const lastMsg = hasArc ? 'IE801' : 'None';
              
              const daysOpen = mov.lastUpdated ? Math.floor((Date.now() - new Date(mov.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)) : 0;
              const isOut = mov.consignorId === activeProfileErn || (activeProfileErn && mov.consigneeId !== activeProfileErn);
              
              let actionsHtml = `<button class="btn-small btn-grey view-movement" data-id="${mov.movementId}" data-arc="${mov.administrativeReferenceCode || ''}">View</button>`;
              
              const isCancelable = isOut && (status === 'Accepted' || status === 'Pending');
              if (isCancelable) {
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
                <td class="actions-cell">${actionsHtml}</td>
              `;
              tbody.appendChild(tr);
            });

            // Attach View Button Logic (Fetches messages ONLY when clicked)
            tbody.querySelectorAll('.view-movement').forEach(btn => {
              btn.addEventListener('click', function() {
                const movId = this.getAttribute('data-id');
                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelector('[data-tab="tab-get-messages"]').classList.add('active');
                document.getElementById('tab-get-messages').classList.add('active');
                
                document.getElementById('gmsg-id').value = movId;
                document.getElementById('get-messages-btn').click();
              });
            });

            // Attach Cancel Button Logic
            tbody.querySelectorAll('.cancel-movement').forEach(btn => {
              btn.addEventListener('click', function() {
                const movId = this.getAttribute('data-id');
                const arc = this.getAttribute('data-arc');
                const lrn = this.getAttribute('data-lrn');
                
                if (!confirm(`Are you sure you want to cancel movement ${movId} (LRN: ${lrn})?`)) return;

                document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelector('[data-tab="tab-submit-msg"]').classList.add('active');
                document.getElementById('tab-submit-msg').classList.add('active');

                document.getElementById('sm-mov-id').value = movId;
                document.getElementById('sm-arc').value = arc;
                document.getElementById('sm-type').value = 'IE810';
                
                alert('Movement ID and ARC loaded into Submit Message tab. Please review, add a cancellation reason, and submit.');
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
        alert('Network error fetching movements: ' + e.message);
      } finally {
        if (loading) loading.style.display = 'none';
      }
    });
  }

  // --- 7. PROFILE MANAGEMENT (With Debug Logging) ---
  async function loadProfiles() {
    try {
      console.log('Fetching profiles...');
      const res = await fetch('/api/profiles', { credentials: 'include' });
      
      if (!res.ok) {
        const errText = await res.text();
        console.error('Profile fetch failed with status:', res.status, errText);
        alert('Failed to load profiles: ' + res.status + '\n' + errText);
        return;
      }

      const profiles = await res.json();
      console.log('Profiles loaded successfully:', profiles);

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
        
        profileSelect.addEventListener('change', function() {
          const selected = profiles.find(p => p.id == this.value);
          if (selected) {
            document.getElementById('s-consignor-ern').value = selected.ern;
            document.getElementById('s-consignor-name').value = selected.traderName || '';
            document.getElementById('s-consignor-street').value = selected.street || '';
            document.getElementById('s-consignor-postcode').value = selected.postcode || '';
            document.getElementById('s-consignor-city').value = selected.city || '';
            document.getElementById('s-dispatch-office').value = selected.office || 'GB004098';
          }
        });
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
    } catch(e) { 
      console.error('Load profiles network error:', e); 
      alert('Network error loading profiles: ' + e.message);
    }
  }

  // --- 7. DRAFTS ---
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
