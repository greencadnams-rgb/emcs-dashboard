document.addEventListener('DOMContentLoaded', async function() {
  console.log('App.js loaded - All 10 tabs + Drafts/Templates');

  function xmlField(tag, value) { return value ? `<urn:${tag}>${value}</urn:${tag}>` : ''; }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
  function updateHmrcStatus(auth) {
    const b = document.getElementById('hmrc-status');
    const l = document.getElementById('hmrc-login-link');
    if (b && l) {
      b.textContent = auth ? 'HMRC: Logged In' : 'HMRC: Not Logged In';
      b.className = 'token-status ' + (auth ? 'token-ok' : 'token-missing');
      l.textContent = auth ? 'Refresh HMRC Token' : 'Login to HMRC';
    }
  }

  async function checkSession() {
    try {
      const res = await fetch('/api/session', { credentials: 'include' });
      if (res.ok) {
        const s = await res.json();
        if (s.authenticated) {
          showDashboard();
          updateHmrcStatus(s.hmrcAuthenticated);
          await loadProfiles();
          await loadTemplates();
          return s;
        }
      }
    } catch(e) { console.error('Session check failed:', e); }
    showLoginScreen();
    return null;
  }

  // === FORM DATA COLLECTION/POPULATION ===
  function collectFormData() {
    const data = {};
    const simpleFields = ['s-dest-type','s-journey-time','s-transport-arrangement',
      's-consignor-ern','s-consignor-name','s-consignor-street','s-consignor-street-num','s-consignor-postcode','s-consignor-city',
      's-dispatch-warehouse','s-dispatch-name','s-dispatch-street','s-dispatch-street-num','s-dispatch-postcode','s-dispatch-city',
      's-consignee-ern','s-consignee-name','s-consignee-street','s-consignee-street-num','s-consignee-postcode','s-consignee-city',
      's-delivery-trader-id','s-delivery-name','s-delivery-street','s-delivery-street-num','s-delivery-postcode','s-delivery-city',
      's-lrn','s-invoice-number','s-invoice-date','s-origin-type','s-date','s-time',
      's-dispatch-office','s-guarantor-type','s-transport-mode','s-transporter-vat','s-transporter-name','s-transporter-city'];
    simpleFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) data[id] = el.value;
    });
    
    data.transportUnits = [];
    document.querySelectorAll('#transport-units-container .transport-unit-field').forEach(unit => {
      data.transportUnits.push({
        code: unit.querySelector('.s-transport-unit-code').value,
        identity: unit.querySelector('.s-identity-transport').value
      });
    });
    
    data.goodsItems = [];
    document.querySelectorAll('#goods-items-container .item-field').forEach(item => {
      data.goodsItems.push({
        productCode: item.querySelector('.s-product-code').value,
        cnCode: item.querySelector('.s-cn-code').value,
        qty: item.querySelector('.s-qty').value,
        weight: item.querySelector('.s-weight').value,
        netWeight: item.querySelector('.s-net-weight').value,
        abv: item.querySelector('.s-abv').value,
        commDesc: item.querySelector('.s-comm-desc').value,
        brand: item.querySelector('.s-brand').value,
        packageKind: item.querySelector('.s-package-kind').value,
        packageCount: item.querySelector('.s-package-count').value,
        shipMark: item.querySelector('.s-ship-mark').value
      });
    });
    
    return data;
  }

  function populateFormData(data) {
    if (!data) return;
    document.getElementById('transport-units-container').innerHTML = '';
    document.getElementById('goods-items-container').innerHTML = '';
    
    Object.keys(data).forEach(key => {
      if (key === 'transportUnits' || key === 'goodsItems') return;
      const el = document.getElementById(key);
      if (el && data[key] !== undefined && data[key] !== null) el.value = data[key];
    });
    
    if (data.transportUnits && data.transportUnits.length > 0) {
      data.transportUnits.forEach(tu => {
        document.getElementById('add-transport-unit-btn').click();
        const units = document.querySelectorAll('#transport-units-container .transport-unit-field');
        const last = units[units.length - 1];
        if (last) {
          last.querySelector('.s-transport-unit-code').value = tu.code || '';
          last.querySelector('.s-identity-transport').value = tu.identity || '';
        }
      });
    }
    
    if (data.goodsItems && data.goodsItems.length > 0) {
      data.goodsItems.forEach(gi => {
        document.getElementById('add-goods-item-btn').click();
        const items = document.querySelectorAll('#goods-items-container .item-field');
        const last = items[items.length - 1];
        if (last) {
          last.querySelector('.s-product-code').value = gi.productCode || '';
          last.querySelector('.s-cn-code').value = gi.cnCode || '';
          last.querySelector('.s-qty').value = gi.qty || '';
          last.querySelector('.s-weight').value = gi.weight || '';
          last.querySelector('.s-net-weight').value = gi.netWeight || '';
          last.querySelector('.s-abv').value = gi.abv || '';
          last.querySelector('.s-comm-desc').value = gi.commDesc || '';
          last.querySelector('.s-brand').value = gi.brand || '';
          last.querySelector('.s-package-kind').value = gi.packageKind || '';
          last.querySelector('.s-package-count').value = gi.packageCount || '';
          last.querySelector('.s-ship-mark').value = gi.shipMark || '';
        }
      });
    }
  }

  // === AUTH ===
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', async function() {
    const pw = document.getElementById('password').value;
    const totp = document.getElementById('totp-code').value;
    const err = document.getElementById('login-error');
    if (!pw) { if(err){err.textContent='Enter password';err.style.display='block';} return; }
    try {
      const r = await fetch('/api/login', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:pw,totpCode:totp}) });
      const d = await r.json();
      if (d.requires2FA) { if(err){err.textContent='2FA enabled. Enter 6-digit code.';err.style.display='block';} document.getElementById('totp-code').style.display='block'; document.getElementById('totp-code').focus(); return; }
      if (r.ok) { if(err)err.style.display='none'; await checkSession(); }
      else { if(err){err.textContent=d.error||'Login failed';err.style.display='block';} }
    } catch(e) { if(err){err.textContent='Error: '+e.message;err.style.display='block';} }
  });

  const setup2faBtn = document.getElementById('setup-2fa-btn');
  if (setup2faBtn) setup2faBtn.addEventListener('click', async function() {
    const pw = document.getElementById('password').value;
    if (!pw) { alert('Enter password first'); return; }
    try {
      const r = await fetch('/api/setup-2fa', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:pw}) });
      if (r.ok) { const d=await r.json(); document.getElementById('2fa-setup').style.display='block'; document.getElementById('qr-code').src=d.qrCode; document.getElementById('secret-text').textContent=d.secret; }
      else { const d=await r.json(); alert('Failed: '+(d.error||'Unknown')); }
    } catch(e) { alert('Error: '+e.message); }
  });

  const verify2faBtn = document.getElementById('verify-2fa-btn');
  if (verify2faBtn) verify2faBtn.addEventListener('click', function() {
    const t = document.getElementById('verify-code').value;
    if (!t||t.length!==6) { alert('Enter valid 6-digit code'); return; }
    alert('Add TOTP_SECRET="'+document.getElementById('secret-text').textContent+'" to Vercel env vars.');
    document.getElementById('2fa-result').textContent='Success!';
    document.getElementById('2fa-result').style.color='green';
  });

  const logoutBtn = document.getElementById('logout-link')||document.getElementById('logout-btn');
  if (logoutBtn) logoutBtn.addEventListener('click', async function(e) { e.preventDefault(); await fetch('/api/logout',{method:'POST',credentials:'include'}); showLoginScreen(); });

  const hmrcLoginBtn = document.getElementById('hmrc-login-link');
  if (hmrcLoginBtn) hmrcLoginBtn.addEventListener('click', function(e) { e.preventDefault(); window.location.href='/api/auth'; });

  // === TAB NAV ===
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      this.classList.add('active');
      const id=this.getAttribute('data-tab');
      if(id) document.getElementById(id).classList.add('active');
      
      if (id === 'tab-monitor') {
        document.getElementById('mon-refresh')?.click();
      }
    });
  });

  // === PROFILES ===
  async function loadProfiles() {
    try {
      const r = await fetch('/api/profiles', { credentials:'include' });
      if (!r.ok) return;
      const profiles = await r.json();
      const sel = document.getElementById('active-profile-select');
      const chips = document.getElementById('profile-chips');
      if (sel) {
        sel.innerHTML='<option value="">Select profile...</option>';
        profiles.forEach(p => { const o=document.createElement('option'); o.value=p.id; o.textContent=`${p.name} (${p.ern})`; sel.appendChild(o); });
        sel.onchange=function() {
          const s=profiles.find(p=>p.id==this.value);
          if(s) {
            document.getElementById('s-consignor-ern').value=s.ern;
            document.getElementById('s-consignor-name').value=s.traderName||'';
            document.getElementById('s-consignor-street').value=s.street||'';
            document.getElementById('s-consignor-postcode').value=s.postcode||'';
            document.getElementById('s-consignor-city').value=s.city||'';
            document.getElementById('s-dispatch-office').value=s.office||'GB004098';
          }
        };
      }
      if (chips) {
        chips.innerHTML='';
        profiles.forEach(p => {
          const c=document.createElement('div'); c.className='profile-chip';
          c.innerHTML=`<span>${p.name} (${p.ern})</span> <span class="del-prof" data-id="${p.id}">&times;</span>`;
          chips.appendChild(c);
        });
        chips.querySelectorAll('.del-prof').forEach(d => d.addEventListener('click', async function() {
          if(confirm('Delete?')) { await fetch(`/api/profiles?id=${this.getAttribute('data-id')}`,{method:'DELETE',credentials:'include'}); loadProfiles(); }
        }));
      }
    } catch(e) { console.error('Load profiles error:', e); }
  }

  const createProfileBtn = document.getElementById('create-profile-btn');
  if (createProfileBtn) createProfileBtn.addEventListener('click', async function() {
    const d = { name:document.getElementById('prof-name').value, type:document.getElementById('prof-type').value, ern:document.getElementById('prof-ern').value, traderName:document.getElementById('prof-trader-name').value, street:document.getElementById('prof-street').value, postcode:document.getElementById('prof-postcode').value, city:document.getElementById('prof-city').value, office:document.getElementById('prof-office').value };
    if(!d.name||!d.ern) { alert('Name and ERN required'); return; }
    try {
      const r = await fetch('/api/profiles', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(d) });
      if(r.ok) { alert('Profile created!'); ['prof-name','prof-ern','prof-trader-name','prof-street','prof-postcode','prof-city'].forEach(id=>document.getElementById(id).value=''); loadProfiles(); }
      else { const e=await r.json(); alert('Error: '+e.error); }
    } catch(e) { alert('Error: '+e.message); }
  });

  // === DYNAMIC FORMS ===
  document.getElementById('add-transport-unit-btn')?.addEventListener('click', function() {
    const c=document.getElementById('transport-units-container'); const d=document.createElement('div'); d.className='transport-unit-field';
    d.innerHTML=`<div class="form-grid"><div class="field"><label>Unit Code</label><input type="text" class="s-transport-unit-code" maxlength="2"></div><div class="field"><label>Identity</label><input type="text" class="s-identity-transport" maxlength="35"></div></div><button type="button" class="btn-red btn-small remove-unit">Remove</button>`;
    c.appendChild(d); d.querySelector('.remove-unit').addEventListener('click',()=>d.remove());
  });

  document.getElementById('add-goods-item-btn')?.addEventListener('click', function() {
    const c=document.getElementById('goods-items-container'); const d=document.createElement('div'); d.className='item-field';
    d.innerHTML=`<div class="item-header"><h4>Goods Item</h4><button type="button" class="btn-red btn-small remove-item">Remove</button></div><div class="form-grid"><div class="field"><label>EPC *</label><input type="text" class="s-product-code" maxlength="4" required></div><div class="field"><label>CN Code *</label><input type="text" class="s-cn-code" maxlength="8" required></div><div class="field"><label>Qty *</label><input type="number" class="s-qty" step="0.001" required></div><div class="field"><label>Gross Mass *</label><input type="number" class="s-weight" step="0.01" required></div><div class="field"><label>Net Mass</label><input type="number" class="s-net-weight" step="0.01"></div><div class="field"><label>ABV%</label><input type="number" class="s-abv" step="0.1"></div><div class="field"><label>Description</label><input type="text" class="s-comm-desc" maxlength="300"></div><div class="field"><label>Brand</label><input type="text" class="s-brand" maxlength="50"></div><div class="field"><label>Package Kind *</label><input type="text" class="s-package-kind" maxlength="2" required></div><div class="field"><label>Package Count *</label><input type="number" class="s-package-count" required></div><div class="field"><label>Shipping Marks</label><input type="text" class="s-ship-mark" maxlength="35"></div></div>`;
    c.appendChild(d); d.querySelector('.remove-item').addEventListener('click',()=>d.remove());
    d.querySelector('.s-product-code').addEventListener('change',function(){ const m={'B000':'22030001','W200':'22042100','W300':'22041000','S200':'22089000','E410':'27101231','E420':'27101231'}; if(m[this.value.toUpperCase()]) d.querySelector('.s-cn-code').value=m[this.value.toUpperCase()]; });
  });

  // === TEMPLATES ===
  let templatesCache = [];
  
  async function loadTemplates() {
    try {
      console.log('Loading templates...');
      const r = await fetch('/api/templates', { credentials: 'include' });
      if (!r.ok) {
        console.error('Templates fetch failed:', r.status);
        return;
      }
      templatesCache = await r.json();
      console.log('Loaded', templatesCache.length, 'templates');
      
      const sel = document.getElementById('template-select');
      if (sel) {
        sel.innerHTML = '<option value="">-- Select a template --</option>';
        templatesCache.forEach(t => {
          const o = document.createElement('option');
          o.value = t.id;
          o.textContent = t.name;
          sel.appendChild(o);
        });
      }
    } catch(e) { 
      console.error('Load templates error:', e); 
    }
  }

  const loadTemplateBtn = document.getElementById('load-template-btn');
  if (loadTemplateBtn) {
    loadTemplateBtn.addEventListener('click', function() {
      const sel = document.getElementById('template-select');
      const id = sel?.value;
      if (!id) { alert('Select a template first'); return; }
      const t = templatesCache.find(x => x.id === id);
      if (t && t.data) {
        populateFormData(t.data);
        window.currentDraftId = null;
        alert('Template "' + t.name + '" loaded into form.\n\nYou can now:\n• Edit and click "Submit Live"\n• Edit and click "Save as Draft"\n• Click "Save as Template" to create a new template');
      } else {
        alert('Template data not found');
      }
    });
  }

  const deleteTemplateBtn = document.getElementById('delete-template-btn');
  if (deleteTemplateBtn) {
    deleteTemplateBtn.addEventListener('click', async function() {
      const sel = document.getElementById('template-select');
      const id = sel?.value;
      if (!id) { alert('Select a template first'); return; }
      if (!confirm('Delete this template?')) return;
      try {
        const r = await fetch('/api/templates?id=' + id, { method: 'DELETE', credentials: 'include' });
        if (r.ok) { alert('Template deleted'); await loadTemplates(); } 
        else { const e = await r.json(); alert('Error: ' + e.error); }
      } catch(e) { alert('Error: ' + e.message); }
    });
  }

  const saveTemplateBtn = document.getElementById('save-template-btn');
  if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', async function() {
      const name = prompt('Template name:');
      if (!name) return;
      const data = collectFormData();
      try {
        const r = await fetch('/api/templates', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, data })
        });
        if (r.ok) { alert('Template "' + name + '" saved!'); await loadTemplates(); } 
        else { const e = await r.json(); alert('Error: ' + e.error); }
      } catch(e) { alert('Error: ' + e.message); }
    });
  }

  // === DRAFTS ===
  window.currentDraftId = null;
  let draftsCache = [];
  async function loadDraftsList() {
    try {
      const r = await fetch('/api/drafts', { credentials:'include' });
      if (!r.ok) return [];
      draftsCache = await r.json();
      return draftsCache;
    } catch(e) { console.error('Drafts error:', e); return []; }
  }

  document.getElementById('save-draft-btn')?.addEventListener('click', async function() {
    const existingId = window.currentDraftId;
    const defaultName = existingId ? (draftsCache.find(d => d.id === existingId)?.name || 'Draft') : '';
    const name = prompt('Draft name:', defaultName);
    if (!name) return;
    const data = collectFormData();
    try {
      const r = await fetch('/api/drafts', {
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name, data, id: existingId })
      });
      if (r.ok) {
        const result = await r.json();
        window.currentDraftId = result.id;
        alert(existingId ? 'Draft updated!' : 'Draft saved!');
      } else { const e = await r.json(); alert('Error: ' + e.error); }
    } catch(e) { alert('Error: ' + e.message); }
  });

  // === TAB 2: SUBMIT IE815 ===
  document.getElementById('submit-movement-btn')?.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    const lrn = document.getElementById('s-lrn').value || ('LRN' + Date.now().toString().slice(-10));
    const dt = document.getElementById('s-date').value || new Date().toISOString().slice(0,10);
    const tm = new Date().toISOString().slice(11,19);
    let body = '';
    document.querySelectorAll('#goods-items-container .item-field').forEach(function(it,i){
      const nw = it.querySelector('.s-net-weight').value || it.querySelector('.s-weight').value;
      const pc = it.querySelector('.s-product-code').value; const q = it.querySelector('.s-qty').value;
      const abv = it.querySelector('.s-abv').value; const cd = it.querySelector('.s-comm-desc').value;
      const br = it.querySelector('.s-brand').value; const sm = it.querySelector('.s-ship-mark').value;
      body += '<urn:BodyEadEsad><urn:BodyRecordUniqueReference>'+(i+1)+'</urn:BodyRecordUniqueReference><urn:ExciseProductCode>'+pc+'</urn:ExciseProductCode><urn:CnCode>'+it.querySelector('.s-cn-code').value+'</urn:CnCode><urn:Quantity>'+q+'</urn:Quantity><urn:GrossMass>'+it.querySelector('.s-weight').value+'</urn:GrossMass><urn:NetMass>'+nw+'</urn:NetMass>'+(abv?'<urn:AlcoholicStrengthByVolumeInPercentage>'+abv+'</urn:AlcoholicStrengthByVolumeInPercentage>':'')+'<urn:FiscalMarkUsedFlag>0</urn:FiscalMarkUsedFlag>'+(cd?'<urn:CommercialDescription>'+cd+'</urn:CommercialDescription>':'')+(br?'<urn:BrandNameOfProducts>'+br+'</urn:BrandNameOfProducts>':'')+'<urn:Package><urn:KindOfPackages>'+it.querySelector('.s-package-kind').value+'</urn:KindOfPackages><urn:NumberOfPackages>'+it.querySelector('.s-package-count').value+'</urn:NumberOfPackages>'+(sm?'<urn:ShippingMarks>'+sm+'</urn:ShippingMarks>':'')+'</urn:Package></urn:BodyEadEsad>';
    });
    let xml = '<?xml version="1.0" encoding="UTF-8"?><urn:IE815 xmlns:urn="urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:IE815:V3.13" xmlns:urn1="urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:TMS:V3.13"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>'+dt+'</urn1:DateOfPreparation><urn1:TimeOfPreparation>'+tm+'</urn1:TimeOfPreparation><urn1:MessageIdentifier>'+lrn+'</urn1:MessageIdentifier><urn1:CorrelationIdentifier>PORTAL'+lrn+'</urn1:CorrelationIdentifier></urn:Header><urn:Body><urn:SubmittedDraftOfEADESAD><urn:Attributes><urn:SubmissionMessageType>1</urn:SubmissionMessageType></urn:Attributes><urn:ConsigneeTrader language="en"><urn:Traderid>'+document.getElementById('s-consignee-ern').value+'</urn:Traderid><urn:TraderName>'+document.getElementById('s-consignee-name').value+'</urn:TraderName><urn:StreetName>'+document.getElementById('s-consignee-street').value+'</urn:StreetName>'+xmlField('StreetNumber',document.getElementById('s-consignee-street-num').value)+'<urn:Postcode>'+document.getElementById('s-consignee-postcode').value+'</urn:Postcode><urn:City>'+document.getElementById('s-consignee-city').value+'</urn:City></urn:ConsigneeTrader><urn:ConsignorTrader language="en"><urn:TraderExciseNumber>'+document.getElementById('s-consignor-ern').value+'</urn:TraderExciseNumber><urn:TraderName>'+document.getElementById('s-consignor-name').value+'</urn:TraderName><urn:StreetName>'+document.getElementById('s-consignor-street').value+'</urn:StreetName>'+xmlField('StreetNumber',document.getElementById('s-consignor-street-num').value)+'<urn:Postcode>'+document.getElementById('s-consignor-postcode').value+'</urn:Postcode><urn:City>'+document.getElementById('s-consignor-city').value+'</urn:City></urn:ConsignorTrader>';
    const dw = document.getElementById('s-dispatch-warehouse').value.trim();
    if(dw) xml += '<urn:PlaceOfDispatchTrader language="en"><urn:ReferenceOfTaxWarehouse>'+dw+'</urn:ReferenceOfTaxWarehouse>'+xmlField('TraderName',document.getElementById('s-dispatch-name').value)+xmlField('StreetName',document.getElementById('s-dispatch-street').value)+xmlField('StreetNumber',document.getElementById('s-dispatch-street-num').value)+xmlField('Postcode',document.getElementById('s-dispatch-postcode').value)+xmlField('City',document.getElementById('s-dispatch-city').value)+'</urn:PlaceOfDispatchTrader>';
    xml += '<urn:DeliveryPlaceTrader language="en"><urn:Traderid>'+document.getElementById('s-delivery-trader-id').value+'</urn:Traderid><urn:TraderName>'+document.getElementById('s-delivery-name').value+'</urn:TraderName><urn:StreetName>'+document.getElementById('s-delivery-street').value+'</urn:StreetName>'+xmlField('StreetNumber',document.getElementById('s-delivery-street-num').value)+'<urn:Postcode>'+document.getElementById('s-delivery-postcode').value+'</urn:Postcode><urn:City>'+document.getElementById('s-delivery-city').value+'</urn:City></urn:DeliveryPlaceTrader><urn:CompetentAuthorityDispatchOffice><urn:ReferenceNumber>'+document.getElementById('s-dispatch-office').value+'</urn:ReferenceNumber></urn:CompetentAuthorityDispatchOffice><urn:FirstTransporterTrader language="en"><urn:VatNumber>'+document.getElementById('s-transporter-vat').value+'</urn:VatNumber><urn:TraderName>'+document.getElementById('s-transporter-name').value+'</urn:TraderName><urn:StreetName>Logistics Way</urn:StreetName><urn:StreetNumber>5</urn:StreetNumber><urn:Postcode>FR5 4RN</urn:Postcode><urn:City>'+document.getElementById('s-transporter-city').value+'</urn:City></urn:FirstTransporterTrader><urn:HeaderEadEsad><urn:DestinationTypeCode>'+document.getElementById('s-dest-type').value+'</urn:DestinationTypeCode><urn:JourneyTime>'+document.getElementById('s-journey-time').value+'</urn:JourneyTime><urn:TransportArrangement>'+document.getElementById('s-transport-arrangement').value+'</urn:TransportArrangement></urn:HeaderEadEsad><urn:TransportMode><urn:TransportModeCode>'+document.getElementById('s-transport-mode').value+'</urn:TransportModeCode></urn:TransportMode><urn:MovementGuarantee><urn:GuarantorTypeCode>'+document.getElementById('s-guarantor-type').value+'</urn:GuarantorTypeCode></urn:MovementGuarantee>'+body+'<urn:EadEsadDraft><urn:LocalReferenceNumber>'+lrn+'</urn:LocalReferenceNumber><urn:InvoiceNumber>'+document.getElementById('s-invoice-number').value+'</urn:InvoiceNumber><urn:InvoiceDate>'+document.getElementById('s-invoice-date').value+'</urn:InvoiceDate><urn:OriginTypeCode>'+document.getElementById('s-origin-type').value+'</urn:OriginTypeCode><urn:DateOfDispatch>'+dt+'</urn:DateOfDispatch><urn:TimeOfDispatch>'+(document.getElementById('s-time').value||'12:00')+':00</urn:TimeOfDispatch></urn:EadEsadDraft>';
    document.querySelectorAll('.transport-unit-field').forEach(function(u){ const c=u.querySelector('.s-transport-unit-code').value; const i=u.querySelector('.s-identity-transport').value; if(c&&i) xml += '<urn:TransportDetails><urn:TransportUnitCode>'+c+'</urn:TransportUnitCode><urn:IdentityOfTransportUnits>'+i+'</urn:IdentityOfTransportUnits></urn:TransportDetails>'; });
    xml += '</urn:SubmittedDraftOfEADESAD></urn:Body></urn:IE815>';
    document.getElementById('submit-output').innerText = 'Sending...';
    try {
      const r = await fetch('/api/emcs?endpoint='+encodeURIComponent('/customs/excise/movements'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/xml'},body:xml});
      const t = await r.text(); document.getElementById('submit-output').innerText = 'Status: '+r.status+'\n\n'+t;
      if (r.status === 202) {
        try {
          const p = JSON.parse(t);
          if (p.movementId) {
            if (window.currentDraftId) {
              await fetch('/api/drafts?id=' + window.currentDraftId, { method:'DELETE', credentials:'include' });
              window.currentDraftId = null;
            }
            localStorage.setItem('emcs_last_submission', JSON.stringify({movementId:p.movementId, arc:p.administrativeReferenceCode||'', lrn:p.localReferenceNumber||lrn}));
            document.getElementById('export-last-csv-btn').style.display = 'inline-block';
          }
        } catch(e) {}
      }
    } catch(e) { document.getElementById('submit-output').innerText = 'Error: '+e.message; }
  });

  // === TAB 1: MONITOR (with drafts as rows) ===
  const monRefreshBtn = document.getElementById('mon-refresh');
  
  // FIX: Wire up filter buttons
  document.getElementById('mon-apply-filters')?.addEventListener('click', () => {
    monRefreshBtn?.click();
  });
  document.getElementById('mon-clear-filters')?.addEventListener('click', () => {
    document.getElementById('mon-direction').value = '';
    document.getElementById('mon-status').value = '';
    document.getElementById('mon-epc').value = '';
    document.getElementById('mon-disp-from').value = '';
    document.getElementById('mon-disp-to').value = '';
    monRefreshBtn?.click();
  });

  if (monRefreshBtn) monRefreshBtn.addEventListener('click', async function() {
    const session = await checkSession();
    if (!session || !session.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    
    const loading = document.getElementById('mon-loading');
    const noRes = document.getElementById('mon-no-results');
    const table = document.getElementById('mon-table');
    const tbody = document.getElementById('mon-tbody');
    
    // FIX: Define sourceFilter so it doesn't throw "sourceFilter is not defined"
    const sourceFilter = 'all';
    
    if (loading) loading.style.display = 'block';
    if (noRes) noRes.style.display = 'none';
    if (table) table.style.display = 'none';
    tbody.innerHTML = '';
    
    try {
      const [draftsResult, liveResult] = await Promise.all([
        fetch('/api/drafts', { credentials:'include' }).then(r => r.ok ? r.json() : []),
        fetch('/api/emcs?endpoint='+encodeURIComponent('/customs/excise/movements'), { method:'GET', credentials:'include' }).then(r => r.ok ? r.json() : [])
      ]);
      
      draftsCache = draftsResult;
      const allRows = [];
      
      if (sourceFilter === 'all' || sourceFilter === 'draft') {
        draftsResult.forEach(d => {
          allRows.push({
            source: 'draft', id: d.id, name: d.name,
            lrn: d.data?.['s-lrn'] || d.id.slice(0, 8),
            consignorErn: d.data?.['s-consignor-ern'] || '',
            consigneeErn: d.data?.['s-consignee-ern'] || '',
            modified: d.modified_at, data: d.data
          });
        });
      }
      
      if (sourceFilter === 'all' || sourceFilter === 'live') {
        if (Array.isArray(liveResult)) {
          liveResult.forEach(mov => {
            allRows.push({
              source: 'live', id: mov.movementId, arc: mov.administrativeReferenceCode,
              lrn: mov.localReferenceNumber, consignorId: mov.consignorId,
              consigneeId: mov.consigneeId, lastUpdated: mov.lastUpdated, data: mov
            });
          });
        }
      }
      
      if (allRows.length === 0) {
        if (noRes) noRes.style.display = 'block';
        if (loading) loading.style.display = 'none';
        return;
      }
      
      if (table) table.style.display = 'table';
      const sel = document.getElementById('active-profile-select');
      const so = sel ? sel.options[sel.selectedIndex] : null;
      const myErn = so ? so.text.match(/\(([^)]+)\)/)?.[1] : '';
      const statusMap = {
        'IE801':['Accepted','dot-green'],'IE818':['Receipted','dot-blue'],'IE810':['Cancelled','dot-red'],
        'IE813':['Changed','dot-amber'],'IE819':['Rejected','dot-red'],'IE839':['Custom Rejected','dot-red'],
        'IE807':['Interrupted','dot-amber'],'IE881':['Closed','dot-grey'],'IE905':['Status Update','dot-blue'],
        'IE802':['Reminder','dot-amber']
      };
      
      allRows.filter(r => r.source === 'draft').forEach((draft) => {
        const days = draft.modified ? Math.floor((Date.now() - new Date(draft.modified).getTime()) / 86400000) : 0;
        const tr = document.createElement('tr');
        tr.style.backgroundColor = '#fff8e1';
        tr.style.cursor = 'pointer';
        tr.innerHTML = `
          <td class="arc-cell"><span class="arc-value" style="color:#ef6c00;">📝 DRAFT</span><span class="lrn">${esc(draft.name)} | LRN: ${esc(draft.lrn)}</span></td>
          <td><span style="background:#ef6c00;color:white;padding:2px 8px;border-radius:3px;font-size:11px;">DRAFT</span></td>
          <td>${esc(draft.consigneeErn || '—')}</td>
          <td>${draft.modified ? new Date(draft.modified).toLocaleDateString() : 'N/A'}</td>
          <td><span class="status-indicator"><span class="status-dot dot-amber"></span> Draft</span></td>
          <td>—</td>
          <td style="text-align:center">${days}</td>
          <td class="actions-cell">
            <button class="btn-small btn-green edit-draft" data-id="${draft.id}">Edit</button>
            <button class="btn-small btn-red delete-draft-row" data-id="${draft.id}">Delete</button>
          </td>`;
        tbody.appendChild(tr);
        tr.querySelector('.edit-draft').addEventListener('click', function(e) { e.stopPropagation(); openDraftForEdit(draft.id); });
        tr.querySelector('.delete-draft-row').addEventListener('click', async function(e) {
          e.stopPropagation();
          if (!confirm('Delete this draft?')) return;
          await fetch('/api/drafts?id=' + draft.id, { method:'DELETE', credentials:'include' });
          monRefreshBtn.click();
        });
        tr.addEventListener('click', function() { openDraftForEdit(draft.id); });
      });
      
      const liveRows = allRows.filter(r => r.source === 'live');
      liveRows.forEach((mov, idx) => {
        const isOut = mov.consignorId === myErn || (myErn && mov.consigneeId !== myErn);
        const days = mov.lastUpdated ? Math.floor((Date.now() - new Date(mov.lastUpdated).getTime()) / 86400000) : 0;
        const tr = document.createElement('tr');
        tr.id = 'live-row-' + idx;
        tr.innerHTML = `
          <td class="arc-cell"><span class="arc-value">${mov.arc || 'Pending'}</span><span class="lrn">LRN: ${mov.lrn}</span></td>
          <td>${isOut ? 'Out' : 'In'}</td>
          <td>${isOut ? (mov.consigneeId || '?') : (mov.consignorId || '?')}</td>
          <td>${mov.lastUpdated ? new Date(mov.lastUpdated).toLocaleDateString() : 'N/A'}</td>
          <td><span class="status-indicator"><span class="status-dot dot-amber"></span> Loading...</span></td>
          <td>...</td>
          <td style="text-align:center">${days}</td>
          <td class="actions-cell"><button class="btn-small btn-grey view-movement" data-id="${mov.id}">View</button></td>`;
        tbody.appendChild(tr);
        tr.querySelector('.view-movement').addEventListener('click', function(e) {
          e.stopPropagation();
          document.querySelector('[data-tab="tab-get-messages"]').click();
          document.getElementById('gmsg-id').value = mov.id;
          document.getElementById('get-messages-btn').click();
        });
      });
      
      if (loading) loading.style.display = 'none';
      
      for (let i = 0; i < liveRows.length; i++) {
        try {
          const mr = await fetch(`/api/emcs?endpoint=${encodeURIComponent('/customs/excise/movements/' + liveRows[i].id + '/messages')}`, { method:'GET', credentials:'include' });
          if (mr.ok) {
            const msgs = await mr.json();
            if (msgs && msgs.length > 0) {
              msgs.sort((a,b) => new Date(b.createdOn) - new Date(a.createdOn));
              const lt = msgs[0].messageType || '?';
              const sm = statusMap[lt] || ['Unknown','dot-grey'];
              const row = document.getElementById('live-row-' + i);
              if (row) {
                row.children[4].innerHTML = `<span class="status-indicator"><span class="status-dot ${sm[1]}"></span> ${sm[0]}</span>`;
                row.children[5].textContent = lt;
                const isOut = liveRows[i].consignorId === myErn || (myErn && liveRows[i].consigneeId !== myErn);
                if (isOut && (sm[0] === 'Accepted' || sm[0] === 'Pending')) {
                  const cb = document.createElement('button');
                  cb.className = 'btn-small btn-red cancel-movement';
                  cb.textContent = 'Cancel';
                  cb.addEventListener('click', function(e) {
                    e.stopPropagation();
                    if (!confirm('Cancel?')) return;
                    document.querySelector('[data-tab="tab-submit-msg"]').click();
                    document.getElementById('sm-mov-id').value = liveRows[i].id;
                    document.getElementById('sm-arc').value = liveRows[i].arc || '';
                    document.getElementById('sm-type').value = 'IE810';
                    alert('Loaded into Submit Message tab.');
                  });
                  row.children[7].appendChild(cb);
                }
              }
            } else {
              const row = document.getElementById('live-row-' + i);
              if (row) {
                row.children[4].innerHTML = '<span class="status-indicator"><span class="status-dot dot-grey"></span> Pending</span>';
                row.children[5].textContent = 'None';
              }
            }
          }
        } catch(e) { console.error('Msg fetch failed for row', i, e); }
        await sleep(350);
      }
    } catch(e) {
      alert('Error: ' + e.message);
      if (loading) loading.style.display = 'none';
    }
  });

  function openDraftForEdit(draftId) {
    const draft = draftsCache.find(d => d.id === draftId);
    if (!draft) { alert('Draft not found'); return; }
    document.querySelector('[data-tab="tab-submit"]').click();
    populateFormData(draft.data);
    window.currentDraftId = draftId;
    alert('Draft "' + draft.name + '" loaded. Edit and click "Submit Live" or "Save as Draft" to update.');
  }

  // === TAB 3: GET MOVEMENT ===
  document.getElementById('get-single-movement-btn')?.addEventListener('click', async function() {
    const s = await checkSession(); if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    const id = document.getElementById('gsm-id').value.trim(); if (!id) { alert('Enter Movement ID'); return; }
    document.getElementById('gsm-output').innerText = 'Fetching...'; document.getElementById('gsm-parsed').innerHTML = '';
    try {
      const r = await fetch('/api/emcs?endpoint='+encodeURIComponent('/customs/excise/movements/'+id), { method:'GET', credentials:'include' });
      const t = await r.text(); document.getElementById('gsm-output').innerText = 'Status: '+r.status+'\n\n'+t;
      if (r.ok) { try { const m = JSON.parse(t); document.getElementById('gsm-parsed').innerHTML = `<div class="parsed-card"><h4>Movement</h4><div class="parsed-grid"><div class="parsed-field"><div class="label">ID</div><div class="value">${m.movementId}</div></div><div class="parsed-field"><div class="label">Consignor</div><div class="value">${m.consignorId}</div></div><div class="parsed-field"><div class="label">Consignee</div><div class="value">${m.consigneeId}</div></div><div class="parsed-field"><div class="label">LRN</div><div class="value">${m.localReferenceNumber}</div></div><div class="parsed-field"><div class="label">ARC</div><div class="value arc">${m.administrativeReferenceCode||'Pending'}</div></div><div class="parsed-field"><div class="label">Updated</div><div class="value">${m.lastUpdated?new Date(m.lastUpdated).toLocaleString():'N/A'}</div></div></div></div>`; } catch(e) {} }
    } catch(e) { document.getElementById('gsm-output').innerText = 'Error: '+e.message; }
  });

  // === TAB 4: SUBMIT MESSAGE ===
  // FIX: Add IE818 section toggle
  const smTypeSelect = document.getElementById('sm-type');
  if (smTypeSelect) {
    smTypeSelect.addEventListener('change', function() {
      const ie818Section = document.getElementById('ie818-section');
      if (ie818Section) {
        ie818Section.style.display = this.value === 'IE818' ? 'block' : 'none';
      }
    });
  }

  document.getElementById('submit-message-btn')?.addEventListener('click', async function() {
    const s = await checkSession(); if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    const mid = document.getElementById('sm-mov-id').value.trim(); const arc = document.getElementById('sm-arc').value.trim();
    const mt = document.getElementById('sm-type').value; const msgid = document.getElementById('sm-msgid').value || ('MSG'+Date.now().toString().slice(-8));
    if (!mid || !arc) { alert('Movement ID and ARC required'); return; }
    const dt = new Date().toISOString().slice(0,10); const tm = new Date().toISOString().slice(11,19); const now = new Date().toISOString().slice(0,19);
    const ns = 'urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:'+mt+':V3.13'; const ns1 = 'urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:TMS:V3.13';
    let xml = '';
    if (mt === 'IE810') xml = `<?xml version="1.0" encoding="UTF-8"?><urn:IE810 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:CancellationOfEAD><urn:Attributes><urn:DateAndTimeOfValidationOfCancellation>${now}</urn:DateAndTimeOfValidationOfCancellation></urn:Attributes><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode></urn:ExciseMovement><urn:Cancellation><urn:CancellationReasonCode>1</urn:CancellationReasonCode></urn:Cancellation></urn:CancellationOfEAD></urn:Body></urn:IE810>`;
    else if (mt === 'IE818') xml = `<?xml version="1.0" encoding="UTF-8"?><urn:IE818 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:AcceptedOrRejectedReportOfReceiptExport><urn:Attributes><urn:DateAndTimeOfValidationOfReportOfReceiptExport>${now}</urn:DateAndTimeOfValidationOfReportOfReceiptExport></urn:Attributes><urn:ConsigneeTrader language="en"><urn:Traderid>${document.getElementById('s-consignee-ern')?.value||'GBWKQOZ8OVLYR'}</urn:Traderid><urn:TraderName>Consignee</urn:TraderName><urn:StreetName>1 Street</urn:StreetName><urn:Postcode>M1 1AA</urn:Postcode><urn:City>City</urn:City></urn:ConsigneeTrader><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement><urn:ReportOfReceiptExport><urn:DateOfArrivalOfExciseProducts>${dt}</urn:DateOfArrivalOfExciseProducts><urn:GlobalConclusionOfReceipt>1</urn:GlobalConclusionOfReceipt></urn:ReportOfReceiptExport></urn:AcceptedOrRejectedReportOfReceiptExport></urn:Body></urn:IE818>`;
    else if (mt === 'IE813') xml = `<?xml version="1.0" encoding="UTF-8"?><urn:IE813 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:ChangeOfDestination><urn:Attributes><urn:DateAndTimeOfValidationOfChangeOfDestination>${now}</urn:DateAndTimeOfValidationOfChangeOfDestination></urn:Attributes><urn:UpdateEadEsad><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:JourneyTime>D02</urn:JourneyTime><urn:ChangedTransportArrangement>1</urn:ChangedTransportArrangement><urn:SequenceNumber>2</urn:SequenceNumber><urn:InvoiceNumber>INV-CHG</urn:InvoiceNumber><urn:TransportModeCode>3</urn:TransportModeCode></urn:UpdateEadEsad><urn:DestinationChanged><urn:DestinationTypeCode>1</urn:DestinationTypeCode><urn:MovementGuarantee><urn:GuarantorTypeCode>1</urn:GuarantorTypeCode></urn:MovementGuarantee></urn:DestinationChanged></urn:ChangeOfDestination></urn:Body></urn:IE813>`;
    else if (mt === 'IE819') xml = `<?xml version="1.0" encoding="UTF-8"?><urn:IE819 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:AlertOrRejectionOfEadEsad><urn:Attributes><urn:DateAndTimeOfValidation>${now}</urn:DateAndTimeOfValidation></urn:Attributes><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement><urn:AlertOrRejection><urn:AlertOrRejectionTypeCode>1</urn:AlertOrRejectionTypeCode><urn:AlertOrRejectionDate>${dt}</urn:AlertOrRejectionDate><urn:ComplementaryInformation>Rejected</urn:ComplementaryInformation></urn:AlertOrRejection></urn:AlertOrRejectionOfEadEsad></urn:Body></urn:IE819>`;
    else if (mt === 'IE837') xml = `<?xml version="1.0" encoding="UTF-8"?><urn:IE837 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:ExplanationOnDelayForDelivery><urn:Attributes><urn:DateAndTimeOfValidation>${now}</urn:DateAndTimeOfValidation></urn:Attributes><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement><urn:ExplanationOnDelay><urn:ComplementaryInformation language="en">Delay due to weather</urn:ComplementaryInformation></urn:ExplanationOnDelay></urn:ExplanationOnDelayForDelivery></urn:Body></urn:IE837>`;
    else if (mt === 'IE871') xml = `<?xml version="1.0" encoding="UTF-8"?><urn:IE871 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:ExplanationOnReasonForShortage><urn:Attributes><urn:SubmitterType>1</urn:SubmitterType><urn:DateAndTimeOfValidationOfExplanationOnShortage>${now}</urn:DateAndTimeOfValidationOfExplanationOnShortage></urn:Attributes><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement><urn:Analysis><urn:DateOfAnalysis>${dt}</urn:DateOfAnalysis><urn:GlobalExplanation language="en">Shortage due to spillage</urn:GlobalExplanation></urn:Analysis></urn:ExplanationOnReasonForShortage></urn:Body></urn:IE871>`;
    document.getElementById('sm-output').innerText = 'Sending '+mt+'...';
    try { const r = await fetch('/api/emcs?endpoint='+encodeURIComponent('/customs/excise/movements/'+mid+'/messages'), { method:'POST', credentials:'include', headers:{'Content-Type':'application/xml'}, body:xml }); const t = await r.text(); document.getElementById('sm-output').innerText = 'Status: '+r.status+'\n\n'+t; } catch(e) { document.getElementById('sm-output').innerText = 'Error: '+e.message; }
  });

  // === TAB 5: GET MESSAGES ===
  const getMessagesBtn = document.getElementById('get-messages-btn');
  if (getMessagesBtn) {
    getMessagesBtn.replaceWith(getMessagesBtn.cloneNode(true));
    const freshBtn = document.getElementById('get-messages-btn');
    freshBtn.addEventListener('click', async function() {
      const s = await checkSession(); if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
      const id = document.getElementById('gmsg-id').value.trim(); if (!id) { alert('Enter Movement ID'); return; }
      document.getElementById('gmsg-output').innerText = 'Fetching...';
      const container = document.getElementById('gmsg-parsed'); container.innerHTML = '';
      document.getElementById('gmsg-count').textContent = '';
      try {
        const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/movements/' + id + '/messages'), { method:'GET', credentials:'include' });
        const t = await r.text(); document.getElementById('gmsg-output').innerText = 'Status: '+r.status+'\n\n'+t;
        if (r.ok) {
          try {
            const msgs = JSON.parse(t);
            document.getElementById('gmsg-count').textContent = msgs.length + ' message(s)';
            if (!msgs.length) { container.innerHTML = '<p>No messages found.</p>'; }
            else {
              msgs.sort((a,b) => new Date(b.createdOn) - new Date(a.createdOn));
              msgs.forEach(m => {
                const c = document.createElement('div'); c.className = 'parsed-card';
                const bc = (m.messageType || '').toLowerCase();
                c.innerHTML = `<h4>${m.messageType} <span class="type-badge ${bc}">${m.messageType}</span></h4><div class="parsed-grid"><div class="parsed-field"><div class="label">Message ID</div><div class="value">${m.messageId}</div></div><div class="parsed-field"><div class="label">Message Type</div><div class="value">${m.messageType}</div></div><div class="parsed-field"><div class="label">Recipient</div><div class="value">${m.recipient}</div></div><div class="parsed-field"><div class="label">Created</div><div class="value">${new Date(m.createdOn).toLocaleString()}</div></div></div><button class="btn-small btn-grey view-raw-msg">View Decoded XML</button><pre class="raw-xml" style="display:none;margin-top:10px;"></pre>`;
                c.querySelector('.view-raw-msg').addEventListener('click', function() {
                  const p = c.querySelector('.raw-xml');
                  if (p.style.display === 'none') {
                    try { p.textContent = atob(m.encodedMessage).replace(/></g, '>\n<'); p.style.display = 'block'; this.textContent = 'Hide XML'; }
                    catch(e) { p.textContent = 'Decode failed: ' + e.message; p.style.display = 'block'; }
                  } else { p.style.display = 'none'; this.textContent = 'View Decoded XML'; }
                });
                container.appendChild(c);
              });
            }
          } catch(e) { container.innerHTML = '<p class="error">Parse failed: ' + e.message + '</p>'; }
        }
      } catch(e) { document.getElementById('gmsg-output').innerText = 'Error: '+e.message; }
    });
  }

  // === TAB 6: GET SINGLE MESSAGE ===
  document.getElementById('get-single-message-btn')?.addEventListener('click', async function() {
    const s = await checkSession(); if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    const mid = document.getElementById('gsmsg-mid').value.trim();
    const msgid = document.getElementById('gsmsg-id').value.trim();
    if (!mid || !msgid) { alert('Both Movement ID and Message ID required.'); return; }
    if (/^IE\d{3}$/i.test(msgid)) { alert('⚠️ "' + msgid + '" looks like a message TYPE, not a Message ID.\n\nUse Tab 5 to find the actual Message ID.'); return; }
    const outputPre = document.getElementById('gsmsg-output');
    const parsedDiv = document.getElementById('gsmsg-parsed');
    outputPre.innerText = 'Fetching...'; parsedDiv.innerHTML = '';
    try {
      const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/movements/' + mid + '/messages/' + msgid) + '&accept=xml', { method:'GET', credentials:'include' });
      const t = await r.text(); outputPre.innerText = 'Status: '+r.status+'\n\n'+t;
      if (r.ok) {
        const formatted = esc(t).replace(/(&lt;\/?)([a-zA-Z0-9:]+)/g, '$1<span style="color:#005ea5;font-weight:bold;">$2</span>').replace(/(&gt;)/g, '<span style="color:#005ea5;">$1</span>').replace(/(>)(<)/g, '$1\n$2');
        parsedDiv.innerHTML = `<div class="parsed-card"><h4>Message ${msgid} <span class="type-badge ie801">XML</span></h4><pre style="white-space:pre-wrap;font-size:12px;line-height:1.5;background:#f8f9fa;color:#333;padding:15px;border-radius:5px;border:1px solid #e0e0e0;">${formatted}</pre></div>`;
      } else if (r.status === 404) {
        parsedDiv.innerHTML = `<div class="parsed-card"><h4 style="color:#d4351c;">❌ Message Not Found</h4><p style="margin:10px 0;">Message ID <code>${esc(msgid)}</code> not found.</p><p style="color:#666;font-size:13px;"><strong>💡 Tip:</strong> Use Tab 5 to find the correct Message ID.</p></div>`;
      } else {
        parsedDiv.innerHTML = `<div class="parsed-card"><h4 style="color:#d4351c;">Error ${r.status}</h4><pre>${esc(t)}</pre></div>`;
      }
    } catch(e) { outputPre.innerText = 'Error: '+e.message; parsedDiv.innerHTML = `<p class="error">Network error: ${e.message}</p>`; }
  });

  // === TAB 7: PRE-VALIDATE ===
  document.getElementById('pre-validate-btn')?.addEventListener('click', async function() {
    const s = await checkSession(); 
    if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    
    const ern = document.getElementById('pv-ern').value.trim();
    const group = document.getElementById('pv-group').value;
    const p1 = (document.getElementById('pv-p1').value.trim() || 'B000').toUpperCase();
    
    if (!ern) { alert('ERN is required'); return; }
    
    document.getElementById('pv-output').innerText = 'Validating...';
    document.getElementById('pv-parsed').innerHTML = '';
    
    try {
      const body = {
        exciseTraderValidationRequest: {
          exciseTraderRequest: {
            exciseRegistrationNumber: ern,
            entityGroup: group,
            validateProductAuthorisationRequest: [
              {
                product: {
                  exciseProductCode: p1
                }
              }
            ]
          }
        }
      };
      
      const endpoint = '/customs/excise/traders/pre-validate';
      const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent(endpoint), { 
        method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) 
      });
      
      const t = await r.text(); 
      document.getElementById('pv-output').innerText = 'Status: ' + r.status + '\n\n' + t;
      
      if (r.ok) {
        try {
          const d = JSON.parse(t);
          const response = d.exciseTraderValidationResponse || d;
          const valid = response.validTrader;
          
          let html = `<div class="parsed-card">
            <h4>${valid ? '✅ Valid Trader' : '❌ Invalid Trader'} 
              <span class="type-badge ${valid ? 'ie801' : 'ie810'}">${valid ? 'VALID' : 'INVALID'}</span>
            </h4>
            <div class="parsed-grid">
              <div class="parsed-field"><div class="label">ERN</div><div class="value">${response.exciseRegistrationNumber || ern}</div></div>
              <div class="parsed-field"><div class="label">Entity Group</div><div class="value">${response.entityGroup || group}</div></div>
              <div class="parsed-field"><div class="label">Trader Type</div><div class="value">${response.traderType || 'N/A'}</div></div>
              ${response.errorCode ? `<div class="parsed-field"><div class="label">Error Code</div><div class="value warn">${response.errorCode}</div></div>` : ''}
              ${response.errorText ? `<div class="parsed-field"><div class="label">Error Text</div><div class="value warn">${response.errorText}</div></div>` : ''}
            </div>
          </div>`;
          
          if (response.validateProductAuthorisationResponse) {
            const prodResp = response.validateProductAuthorisationResponse;
            if (prodResp.productError && prodResp.productError.length > 0) {
              html += `<div class="parsed-card"><h4>⚠️ Product Authorisation Errors</h4><div class="parsed-grid">`;
              prodResp.productError.forEach(pe => {
                html += `<div class="parsed-field"><div class="label">Product Code</div><div class="value">${pe.exciseProductCode}</div></div>
                         <div class="parsed-field"><div class="label">Error</div><div class="value warn">${pe.errorText} (${pe.errorCode})</div></div>`;
              });
              html += `</div></div>`;
            } else {
              html += `<div class="parsed-card"><h4>✅ Product Authorisation</h4><div class="parsed-grid"><div class="parsed-field"><div class="label">Valid</div><div class="value" style="color:#00703c;">${prodResp.valid ? 'Yes' : 'No'}</div></div></div></div>`;
            }
          }
          document.getElementById('pv-parsed').innerHTML = html;
        } catch(e) { document.getElementById('pv-parsed').innerHTML = `<p>Parse error: ${e.message}</p><pre>${esc(t)}</pre>`; }
      } else {
        try {
          const err = JSON.parse(t);
          document.getElementById('pv-parsed').innerHTML = `<div class="parsed-card"><h4 style="color:#d4351c;">❌ API Error (${r.status})</h4><div class="parsed-grid"><div class="parsed-field"><div class="label">Message</div><div class="value warn">${err.message || 'Unknown'}</div></div>${err.debugMessage ? `<div class="parsed-field"><div class="label">Details</div><div class="value warn">${err.debugMessage}</div></div>` : ''}</div></div>`;
        } catch(e) { document.getElementById('pv-parsed').innerHTML = `<p class="error">Error ${r.status}: ${esc(t)}</p>`; }
      }
    } catch(e) { document.getElementById('pv-output').innerText = 'Network Error: ' + e.message; }
  });

  // === TAB 8: SUBSCRIBE ===
  document.getElementById('subscribe-ern-btn')?.addEventListener('click', async function() {
    const s = await checkSession(); if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    const ern = document.getElementById('sub-ern').value.trim(); if (!ern) { alert('ERN required'); return; }
    document.getElementById('sub-output').innerText = 'Subscribing...';
    try {
      const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/erns/' + ern + '/subscription'), { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body:JSON.stringify({}) });
      const t = await r.text(); document.getElementById('sub-output').innerText = 'Status: '+r.status+'\n\n'+t;
    } catch(e) { document.getElementById('sub-output').innerText = 'Error: '+e.message; }
  });

  // === TAB 9: UNSUBSCRIBE ===
  document.getElementById('unsubscribe-ern-btn')?.addEventListener('click', async function() {
    const s = await checkSession(); if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    const ern = document.getElementById('unsub-ern').value.trim(); if (!ern) { alert('ERN required'); return; }
    document.getElementById('unsub-output').innerText = 'Unsubscribing...';
    try {
      const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/erns/' + ern + '/subscription'), { method:'DELETE', credentials:'include' });
      const t = await r.text(); document.getElementById('unsub-output').innerText = 'Status: '+r.status+'\n\n'+(t || '(No content)');
    } catch(e) { document.getElementById('unsub-output').innerText = 'Error: '+e.message; }
  });

  await checkSession();
});
