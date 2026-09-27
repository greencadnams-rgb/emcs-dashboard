document.addEventListener('DOMContentLoaded', async function() {
  console.log('App.js loaded - All 10 tabs functional');

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
          await loadDrafts();
          return s;
        }
      }
    } catch(e) { console.error('Session check failed:', e); }
    showLoginScreen();
    return null;
  }

  // AUTH
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

  // TAB NAV
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      this.classList.add('active');
      const id=this.getAttribute('data-tab');
      if(id) document.getElementById(id).classList.add('active');
    });
  });

  // PROFILES (Tab 10)
  async function loadProfiles() {
    try {
      const r = await fetch('/api/profiles', { credentials:'include' });
      if (!r.ok) { console.error('Profiles fetch failed:', r.status); return; }
      const profiles = await r.json();
      console.log('Loaded profiles:', profiles.length);
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

  // DYNAMIC FORMS
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

  // TAB 2: SUBMIT IE815
  document.getElementById('submit-movement-btn')?.addEventListener('click', async function() {
    const session=await checkSession(); if(!session||!session.hmrcAuthenticated){alert('Login to HMRC first!');return;}
    const lrn=document.getElementById('s-lrn').value||('LRN'+Date.now().toString().slice(-10));
    const dt=document.getElementById('s-date').value||new Date().toISOString().slice(0,10);
    const tm=new Date().toISOString().slice(11,19);
    let body=''; const items=[];
    document.querySelectorAll('#goods-items-container .item-field').forEach(function(it,i){
      const nw=it.querySelector('.s-net-weight').value||it.querySelector('.s-weight').value;
      const pc=it.querySelector('.s-product-code').value; const q=it.querySelector('.s-qty').value;
      const abv=it.querySelector('.s-abv').value; const cd=it.querySelector('.s-comm-desc').value;
      const br=it.querySelector('.s-brand').value; const sm=it.querySelector('.s-ship-mark').value;
      body+='<urn:BodyEadEsad><urn:BodyRecordUniqueReference>'+(i+1)+'</urn:BodyRecordUniqueReference><urn:ExciseProductCode>'+pc+'</urn:ExciseProductCode><urn:CnCode>'+it.querySelector('.s-cn-code').value+'</urn:CnCode><urn:Quantity>'+q+'</urn:Quantity><urn:GrossMass>'+it.querySelector('.s-weight').value+'</urn:GrossMass><urn:NetMass>'+nw+'</urn:NetMass>'+(abv?'<urn:AlcoholicStrengthByVolumeInPercentage>'+abv+'</urn:AlcoholicStrengthByVolumeInPercentage>':'')+'<urn:FiscalMarkUsedFlag>0</urn:FiscalMarkUsedFlag>'+(cd?'<urn:CommercialDescription>'+cd+'</urn:CommercialDescription>':'')+(br?'<urn:BrandNameOfProducts>'+br+'</urn:BrandNameOfProducts>':'')+'<urn:Package><urn:KindOfPackages>'+it.querySelector('.s-package-kind').value+'</urn:KindOfPackages><urn:NumberOfPackages>'+it.querySelector('.s-package-count').value+'</urn:NumberOfPackages>'+(sm?'<urn:ShippingMarks>'+sm+'</urn:ShippingMarks>':'')+'</urn:Package></urn:BodyEadEsad>';
      items.push({productCode:pc,qty:q});
    });
    let xml='<?xml version="1.0" encoding="UTF-8"?><urn:IE815 xmlns:urn="urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:IE815:V3.13" xmlns:urn1="urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:TMS:V3.13"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>'+dt+'</urn1:DateOfPreparation><urn1:TimeOfPreparation>'+tm+'</urn1:TimeOfPreparation><urn1:MessageIdentifier>'+lrn+'</urn1:MessageIdentifier><urn1:CorrelationIdentifier>PORTAL'+lrn+'</urn1:CorrelationIdentifier></urn:Header><urn:Body><urn:SubmittedDraftOfEADESAD><urn:Attributes><urn:SubmissionMessageType>1</urn:SubmissionMessageType></urn:Attributes><urn:ConsigneeTrader language="en"><urn:Traderid>'+document.getElementById('s-consignee-ern').value+'</urn:Traderid><urn:TraderName>'+document.getElementById('s-consignee-name').value+'</urn:TraderName><urn:StreetName>'+document.getElementById('s-consignee-street').value+'</urn:StreetName>'+xmlField('StreetNumber',document.getElementById('s-consignee-street-num').value)+'<urn:Postcode>'+document.getElementById('s-consignee-postcode').value+'</urn:Postcode><urn:City>'+document.getElementById('s-consignee-city').value+'</urn:City></urn:ConsigneeTrader><urn:ConsignorTrader language="en"><urn:TraderExciseNumber>'+document.getElementById('s-consignor-ern').value+'</urn:TraderExciseNumber><urn:TraderName>'+document.getElementById('s-consignor-name').value+'</urn:TraderName><urn:StreetName>'+document.getElementById('s-consignor-street').value+'</urn:StreetName>'+xmlField('StreetNumber',document.getElementById('s-consignor-street-num').value)+'<urn:Postcode>'+document.getElementById('s-consignor-postcode').value+'</urn:Postcode><urn:City>'+document.getElementById('s-consignor-city').value+'</urn:City></urn:ConsignorTrader>';
    const dw=document.getElementById('s-dispatch-warehouse').value.trim();
    if(dw) xml+='<urn:PlaceOfDispatchTrader language="en"><urn:ReferenceOfTaxWarehouse>'+dw+'</urn:ReferenceOfTaxWarehouse>'+xmlField('TraderName',document.getElementById('s-dispatch-name').value)+xmlField('StreetName',document.getElementById('s-dispatch-street').value)+xmlField('StreetNumber',document.getElementById('s-dispatch-street-num').value)+xmlField('Postcode',document.getElementById('s-dispatch-postcode').value)+xmlField('City',document.getElementById('s-dispatch-city').value)+'</urn:PlaceOfDispatchTrader>';
    xml+='<urn:DeliveryPlaceTrader language="en"><urn:Traderid>'+document.getElementById('s-delivery-trader-id').value+'</urn:Traderid><urn:TraderName>'+document.getElementById('s-delivery-name').value+'</urn:TraderName><urn:StreetName>'+document.getElementById('s-delivery-street').value+'</urn:StreetName>'+xmlField('StreetNumber',document.getElementById('s-delivery-street-num').value)+'<urn:Postcode>'+document.getElementById('s-delivery-postcode').value+'</urn:Postcode><urn:City>'+document.getElementById('s-delivery-city').value+'</urn:City></urn:DeliveryPlaceTrader><urn:CompetentAuthorityDispatchOffice><urn:ReferenceNumber>'+document.getElementById('s-dispatch-office').value+'</urn:ReferenceNumber></urn:CompetentAuthorityDispatchOffice><urn:FirstTransporterTrader language="en"><urn:VatNumber>'+document.getElementById('s-transporter-vat').value+'</urn:VatNumber><urn:TraderName>'+document.getElementById('s-transporter-name').value+'</urn:TraderName><urn:StreetName>Logistics Way</urn:StreetName><urn:StreetNumber>5</urn:StreetNumber><urn:Postcode>FR5 4RN</urn:Postcode><urn:City>'+document.getElementById('s-transporter-city').value+'</urn:City></urn:FirstTransporterTrader><urn:HeaderEadEsad><urn:DestinationTypeCode>'+document.getElementById('s-dest-type').value+'</urn:DestinationTypeCode><urn:JourneyTime>'+document.getElementById('s-journey-time').value+'</urn:JourneyTime><urn:TransportArrangement>'+document.getElementById('s-transport-arrangement').value+'</urn:TransportArrangement></urn:HeaderEadEsad><urn:TransportMode><urn:TransportModeCode>'+document.getElementById('s-transport-mode').value+'</urn:TransportModeCode></urn:TransportMode><urn:MovementGuarantee><urn:GuarantorTypeCode>'+document.getElementById('s-guarantor-type').value+'</urn:GuarantorTypeCode></urn:MovementGuarantee>'+body+'<urn:EadEsadDraft><urn:LocalReferenceNumber>'+lrn+'</urn:LocalReferenceNumber><urn:InvoiceNumber>'+document.getElementById('s-invoice-number').value+'</urn:InvoiceNumber><urn:InvoiceDate>'+document.getElementById('s-invoice-date').value+'</urn:InvoiceDate><urn:OriginTypeCode>'+document.getElementById('s-origin-type').value+'</urn:OriginTypeCode><urn:DateOfDispatch>'+dt+'</urn:DateOfDispatch><urn:TimeOfDispatch>'+(document.getElementById('s-time').value||'12:00')+':00</urn:TimeOfDispatch></urn:EadEsadDraft>';
    document.querySelectorAll('.transport-unit-field').forEach(function(u){ const c=u.querySelector('.s-transport-unit-code').value; const i=u.querySelector('.s-identity-transport').value; if(c&&i) xml+='<urn:TransportDetails><urn:TransportUnitCode>'+c+'</urn:TransportUnitCode><urn:IdentityOfTransportUnits>'+i+'</urn:IdentityOfTransportUnits></urn:TransportDetails>'; });
    xml+='</urn:SubmittedDraftOfEADESAD></urn:Body></urn:IE815>';
    document.getElementById('submit-output').innerText='Sending...';
    try {
      const r=await fetch('/api/emcs?endpoint='+encodeURIComponent('/customs/excise/movements'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/xml'},body:xml});
      const t=await r.text(); document.getElementById('submit-output').innerText='Status: '+r.status+'\n\n'+t;
      if(r.status===202){try{const p=JSON.parse(t);if(p.movementId){localStorage.setItem('emcs_last_submission',JSON.stringify({movementId:p.movementId,arc:p.administrativeReferenceCode||'',lrn:p.localReferenceNumber||lrn}));document.getElementById('export-last-csv-btn').style.display='inline-block';}}catch(e){}}
    } catch(e) { document.getElementById('submit-output').innerText='Error: '+e.message; }
  });

  // TAB 1: MONITOR
  const monRefreshBtn = document.getElementById('mon-refresh');
  if (monRefreshBtn) monRefreshBtn.addEventListener('click', async function() {
    const session=await checkSession(); if(!session||!session.hmrcAuthenticated){alert('Login to HMRC first!');return;}
    const loading=document.getElementById('mon-loading'); const noRes=document.getElementById('mon-no-results');
    const table=document.getElementById('mon-table'); const tbody=document.getElementById('mon-tbody');
    if(loading)loading.style.display='block'; if(noRes)noRes.style.display='none'; if(table)table.style.display='none'; tbody.innerHTML='';
    try {
      const r=await fetch('/api/emcs?endpoint='+encodeURIComponent('/customs/excise/movements'),{method:'GET',credentials:'include'});
      if(r.ok) {
        const movs=await r.json();
        if(movs&&movs.length>0) {
          if(table)table.style.display='table';
          const sel=document.getElementById('active-profile-select');
          const so=sel?sel.options[sel.selectedIndex]:null;
          const myErn=so?so.text.match(/\(([^)]+)\)/)?.[1]:'';
          const statusMap={'IE801':['Accepted','dot-green'],'IE818':['Receipted','dot-blue'],'IE810':['Cancelled','dot-red'],'IE813':['Changed','dot-amber'],'IE819':['Rejected','dot-red'],'IE839':['Custom Rejected','dot-red'],'IE807':['Interrupted','dot-amber'],'IE881':['Closed','dot-grey'],'IE905':['Status Update','dot-blue'],'IE802':['Reminder','dot-amber']};

          movs.forEach((mov,i) => {
            const isOut=mov.consignorId===myErn||(myErn&&mov.consigneeId!==myErn);
            const days=mov.lastUpdated?Math.floor((Date.now()-new Date(mov.lastUpdated).getTime())/(86400000)):0;
            const tr=document.createElement('tr'); tr.id='mov-row-'+i;
            tr.innerHTML=`<td class="arc-cell"><span class="arc-value">${mov.administrativeReferenceCode||'Pending'}</span><span class="lrn">LRN: ${mov.localReferenceNumber}</span></td><td>${isOut?'Out':'In'}</td><td>${isOut?(mov.consigneeId||'?'):(mov.consignorId||'?')}</td><td>${mov.lastUpdated?new Date(mov.lastUpdated).toLocaleDateString():'N/A'}</td><td><span class="status-indicator"><span class="status-dot dot-amber"></span> Loading...</span></td><td>...</td><td style="text-align:center">${days}</td><td class="actions-cell"><button class="btn-small btn-grey view-movement" data-id="${mov.movementId}">View</button></td>`;
            tbody.appendChild(tr);
            tr.querySelector('.view-movement').addEventListener('click',function(){ document.querySelector('[data-tab="tab-get-messages"]').click(); document.getElementById('gmsg-id').value=this.getAttribute('data-id'); document.getElementById('get-messages-btn').click(); });
          });
          if(loading)loading.style.display='none';

          for(let i=0;i<movs.length;i++) {
            try {
              const mr=await fetch(`/api/emcs?endpoint=${encodeURIComponent('/customs/excise/movements/'+movs[i].movementId+'/messages')}`,{method:'GET',credentials:'include'});
              if(mr.ok) {
                const msgs=await mr.json();
                if(msgs&&msgs.length>0) {
                  msgs.sort((a,b)=>new Date(b.createdOn)-new Date(a.createdOn));
                  const lt=msgs[0].messageType||'?';
                  const sm=statusMap[lt]||['Unknown','dot-grey'];
                  const row=document.getElementById('mov-row-'+i);
                  if(row) {
                    row.children[4].innerHTML=`<span class="status-indicator"><span class="status-dot ${sm[1]}"></span> ${sm[0]}</span>`;
                    row.children[5].textContent=lt;
                    const isOut=movs[i].consignorId===myErn||(myErn&&movs[i].consigneeId!==myErn);
                    if(isOut&&(sm[0]==='Accepted'||sm[0]==='Pending')) {
                      const cb=document.createElement('button'); cb.className='btn-small btn-red cancel-movement'; cb.textContent='Cancel';
                      cb.addEventListener('click',function(){ if(!confirm('Cancel?'))return; document.querySelector('[data-tab="tab-submit-msg"]').click(); document.getElementById('sm-mov-id').value=movs[i].movementId; document.getElementById('sm-arc').value=movs[i].administrativeReferenceCode||''; document.getElementById('sm-type').value='IE810'; alert('Loaded into Submit Message tab.'); });
                      row.children[7].appendChild(cb);
                    }
                  }
                } else {
                  const row=document.getElementById('mov-row-'+i);
                  if(row){row.children[4].innerHTML='<span class="status-indicator"><span class="status-dot dot-grey"></span> Pending</span>';row.children[5].textContent='None';}
                }
              }
            } catch(e) { console.error('Msg fetch failed for row',i,e); }
            await sleep(350);
          }
        } else { if(noRes)noRes.style.display='block'; if(loading)loading.style.display='none'; }
      } else { alert('Failed: '+r.status+'\n'+await r.text()); if(loading)loading.style.display='none'; }
    } catch(e) { alert('Error: '+e.message); if(loading)loading.style.display='none'; }
  });

  // TAB 3: GET MOVEMENT
  document.getElementById('get-single-movement-btn')?.addEventListener('click', async function() {
    const s=await checkSession(); if(!s||!s.hmrcAuthenticated){alert('Login to HMRC first!');return;}
    const id=document.getElementById('gsm-id').value.trim(); if(!id){alert('Enter Movement ID');return;}
    document.getElementById('gsm-output').innerText='Fetching...'; document.getElementById('gsm-parsed').innerHTML='';
    try {
      const r=await fetch('/api/emcs?endpoint='+encodeURIComponent('/customs/excise/movements/'+id),{method:'GET',credentials:'include'});
      const t=await r.text(); document.getElementById('gsm-output').innerText='Status: '+r.status+'\n\n'+t;
      if(r.ok){try{const m=JSON.parse(t);document.getElementById('gsm-parsed').innerHTML=`<div class="parsed-card"><h4>Movement</h4><div class="parsed-grid"><div class="parsed-field"><div class="label">ID</div><div class="value">${m.movementId}</div></div><div class="parsed-field"><div class="label">Consignor</div><div class="value">${m.consignorId}</div></div><div class="parsed-field"><div class="label">Consignee</div><div class="value">${m.consigneeId}</div></div><div class="parsed-field"><div class="label">LRN</div><div class="value">${m.localReferenceNumber}</div></div><div class="parsed-field"><div class="label">ARC</div><div class="value arc">${m.administrativeReferenceCode||'Pending'}</div></div><div class="parsed-field"><div class="label">Updated</div><div class="value">${m.lastUpdated?new Date(m.lastUpdated).toLocaleString():'N/A'}</div></div></div></div>`;}catch(e){}}
    } catch(e) { document.getElementById('gsm-output').innerText='Error: '+e.message; }
  });

  // TAB 4: SUBMIT MESSAGE
  document.getElementById('submit-message-btn')?.addEventListener('click', async function() {
    const s=await checkSession(); if(!s||!s.hmrcAuthenticated){alert('Login to HMRC first!');return;}
    const mid=document.getElementById('sm-mov-id').value.trim(); const arc=document.getElementById('sm-arc').value.trim();
    const mt=document.getElementById('sm-type').value; const msgid=document.getElementById('sm-msgid').value||('MSG'+Date.now().toString().slice(-8));
    if(!mid||!arc){alert('Movement ID and ARC required');return;}
    const dt=new Date().toISOString().slice(0,10); const tm=new Date().toISOString().slice(11,19); const now=new Date().toISOString().slice(0,19);
    const ns='urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:'+mt+':V3.13'; const ns1='urn:publicid:-:EC:DGTAXUD:EMCS:PHASE4:TMS:V3.13';
    let xml='';
    if(mt==='IE810') xml=`<?xml version="1.0" encoding="UTF-8"?><urn:IE810 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:CancellationOfEAD><urn:Attributes><urn:DateAndTimeOfValidationOfCancellation>${now}</urn:DateAndTimeOfValidationOfCancellation></urn:Attributes><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode></urn:ExciseMovement><urn:Cancellation><urn:CancellationReasonCode>1</urn:CancellationReasonCode></urn:Cancellation></urn:CancellationOfEAD></urn:Body></urn:IE810>`;
    else if(mt==='IE818') xml=`<?xml version="1.0" encoding="UTF-8"?><urn:IE818 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:AcceptedOrRejectedReportOfReceiptExport><urn:Attributes><urn:DateAndTimeOfValidationOfReportOfReceiptExport>${now}</urn:DateAndTimeOfValidationOfReportOfReceiptExport></urn:Attributes><urn:ConsigneeTrader language="en"><urn:Traderid>${document.getElementById('s-consignee-ern')?.value||'GBWKQOZ8OVLYR'}</urn:Traderid><urn:TraderName>Consignee</urn:TraderName><urn:StreetName>1 Street</urn:StreetName><urn:Postcode>M1 1AA</urn:Postcode><urn:City>City</urn:City></urn:ConsigneeTrader><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement><urn:ReportOfReceiptExport><urn:DateOfArrivalOfExciseProducts>${dt}</urn:DateOfArrivalOfExciseProducts><urn:GlobalConclusionOfReceipt>1</urn:GlobalConclusionOfReceipt></urn:ReportOfReceiptExport></urn:AcceptedOrRejectedReportOfReceiptExport></urn:Body></urn:IE818>`;
    else if(mt==='IE813') xml=`<?xml version="1.0" encoding="UTF-8"?><urn:IE813 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:ChangeOfDestination><urn:Attributes><urn:DateAndTimeOfValidationOfChangeOfDestination>${now}</urn:DateAndTimeOfValidationOfChangeOfDestination></urn:Attributes><urn:UpdateEadEsad><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:JourneyTime>D02</urn:JourneyTime><urn:ChangedTransportArrangement>1</urn:ChangedTransportArrangement><urn:SequenceNumber>2</urn:SequenceNumber><urn:InvoiceNumber>INV-CHG</urn:InvoiceNumber><urn:TransportModeCode>3</urn:TransportModeCode></urn:UpdateEadEsad><urn:DestinationChanged><urn:DestinationTypeCode>1</urn:DestinationTypeCode><urn:MovementGuarantee><urn:GuarantorTypeCode>1</urn:GuarantorTypeCode></urn:MovementGuarantee></urn:DestinationChanged></urn:ChangeOfDestination></urn:Body></urn:IE813>`;
    else if(mt==='IE819') xml=`<?xml version="1.0" encoding="UTF-8"?><urn:IE819 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:AlertOrRejectionOfEadEsad><urn:Attributes><urn:DateAndTimeOfValidation>${now}</urn:DateAndTimeOfValidation></urn:Attributes><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement><urn:AlertOrRejection><urn:AlertOrRejectionTypeCode>1</urn:AlertOrRejectionTypeCode><urn:AlertOrRejectionDate>${dt}</urn:AlertOrRejectionDate><urn:ComplementaryInformation>Rejected</urn:ComplementaryInformation></urn:AlertOrRejection></urn:AlertOrRejectionOfEadEsad></urn:Body></urn:IE819>`;
    else if(mt==='IE837') xml=`<?xml version="1.0" encoding="UTF-8"?><urn:IE837 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:ExplanationOnDelayForDelivery><urn:Attributes><urn:DateAndTimeOfValidation>${now}</urn:DateAndTimeOfValidation></urn:Attributes><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement><urn:ExplanationOnDelay><urn:ComplementaryInformation language="en">Delay due to weather</urn:ComplementaryInformation></urn:ExplanationOnDelay></urn:ExplanationOnDelayForDelivery></urn:Body></urn:IE837>`;
    else if(mt==='IE871') xml=`<?xml version="1.0" encoding="UTF-8"?><urn:IE871 xmlns:urn="${ns}" xmlns:urn1="${ns1}"><urn:Header><urn1:MessageSender>NDEA.GB</urn1:MessageSender><urn1:MessageRecipient>NDEA.GB</urn1:MessageRecipient><urn1:DateOfPreparation>${dt}</urn1:DateOfPreparation><urn1:TimeOfPreparation>${tm}</urn1:TimeOfPreparation><urn1:MessageIdentifier>${msgid}</urn1:MessageIdentifier></urn:Header><urn:Body><urn:ExplanationOnReasonForShortage><urn:Attributes><urn:SubmitterType>1</urn:SubmitterType><urn:DateAndTimeOfValidationOfExplanationOnShortage>${now}</urn:DateAndTimeOfValidationOfExplanationOnShortage></urn:Attributes><urn:ExciseMovement><urn:AdministrativeReferenceCode>${arc}</urn:AdministrativeReferenceCode><urn:SequenceNumber>1</urn:SequenceNumber></urn:ExciseMovement><urn:Analysis><urn:DateOfAnalysis>${dt}</urn:DateOfAnalysis><urn:GlobalExplanation language="en">Shortage due to spillage</urn:GlobalExplanation></urn:Analysis></urn:ExplanationOnReasonForShortage></urn:Body></urn:IE871>`;
    document.getElementById('sm-output').innerText='Sending '+mt+'...';
    try { const r=await fetch('/api/emcs?endpoint='+encodeURIComponent('/customs/excise/movements/'+mid+'/messages'),{method:'POST',credentials:'include',headers:{'Content-Type':'application/xml'},body:xml}); const t=await r.text(); document.getElementById('sm-output').innerText='Status: '+r.status+'\n\n'+t; } catch(e) { document.getElementById('sm-output').innerText='Error: '+e.message; }
  });

  // TAB 5: GET MESSAGES
  const getMessagesBtn = document.getElementById('get-messages-btn');
  if (getMessagesBtn) {
    getMessagesBtn.replaceWith(getMessagesBtn.cloneNode(true));
    const freshBtn = document.getElementById('get-messages-btn');
    
    freshBtn.addEventListener('click', async function() {
      const s = await checkSession();
      if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
      
      const id = document.getElementById('gmsg-id').value.trim();
      if (!id) { alert('Enter Movement ID'); return; }
      
      document.getElementById('gmsg-output').innerText = 'Fetching...';
      const container = document.getElementById('gmsg-parsed');
      container.innerHTML = '';
      document.getElementById('gmsg-count').textContent = '';
      
      try {
        const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/movements/' + id + '/messages'), {
          method: 'GET', credentials: 'include'
        });
        const t = await r.text();
        document.getElementById('gmsg-output').innerText = 'Status: ' + r.status + '\n\n' + t;
        
        if (r.ok) {
          try {
            const msgs = JSON.parse(t);
            document.getElementById('gmsg-count').textContent = msgs.length + ' message(s)';
            
            if (!msgs.length) {
              container.innerHTML = '<p>No messages found for this movement.</p>';
            } else {
              msgs.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
              
              msgs.forEach(m => {
                const c = document.createElement('div');
                c.className = 'parsed-card';
                const bc = (m.messageType || '').toLowerCase();
                
                c.innerHTML = `
                  <h4>${m.messageType} <span class="type-badge ${bc}">${m.messageType}</span></h4>
                  <div class="parsed-grid">
                    <div class="parsed-field">
                      <div class="label">Message ID (use this for Tab 6)</div>
                      <div class="value" style="color:#005ea5;font-weight:bold;">${m.messageId}
                        <button class="btn-small btn-grey use-msg-id" style="margin-left:10px;" data-msgid="${m.messageId}" data-movid="${id}">Use in Tab 6 →</button>
                      </div>
                    </div>
                    <div class="parsed-field"><div class="label">Message Type</div><div class="value">${m.messageType}</div></div>
                    <div class="parsed-field"><div class="label">Recipient</div><div class="value">${m.recipient}</div></div>
                    <div class="parsed-field"><div class="label">Created</div><div class="value">${new Date(m.createdOn).toLocaleString()}</div></div>
                  </div>
                  <button class="btn-small btn-grey view-raw-msg">View Decoded XML</button>
                  <pre class="raw-xml" style="display:none;margin-top:10px;"></pre>
                `;
                
                c.querySelector('.view-raw-msg').addEventListener('click', function() {
                  const p = c.querySelector('.raw-xml');
                  if (p.style.display === 'none') {
                    try {
                      p.textContent = atob(m.encodedMessage).replace(/></g, '>\n<');
                      p.style.display = 'block';
                      this.textContent = 'Hide XML';
                    } catch(e) { p.textContent = 'Decode failed: ' + e.message; p.style.display = 'block'; }
                  } else { p.style.display = 'none'; this.textContent = 'View Decoded XML'; }
                });
                
                c.querySelector('.use-msg-id').addEventListener('click', function() {
                  const msgId = this.getAttribute('data-msgid');
                  const movId = this.getAttribute('data-movid');
                  document.querySelector('[data-tab="tab-get-message"]').click();
                  document.getElementById('gsmsg-mid').value = movId;
                  document.getElementById('gsmsg-id').value = msgId;
                  document.getElementById('get-single-message-btn').click();
                });
                
                container.appendChild(c);
              });
            }
          } catch(e) {
            container.innerHTML = '<p class="error">Parse failed: ' + e.message + '</p>';
          }
        }
      } catch(e) {
        document.getElementById('gmsg-output').innerText = 'Error: ' + e.message;
      }
    });
  }

  // TAB 6: GET SINGLE MESSAGE (FIXED - proper XML display)
  document.getElementById('get-single-message-btn')?.addEventListener('click', async function() {
    const s = await checkSession();
    if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    
    const mid = document.getElementById('gsmsg-mid').value.trim();
    const msgid = document.getElementById('gsmsg-id').value.trim();
    
    if (!mid || !msgid) {
      alert('Both Movement ID and Message ID are required.\n\nTip: Use Tab 5 first, then click "Use in Tab 6 →" on any message.');
      return;
    }
    
    if (/^IE\d{3}$/i.test(msgid)) {
      alert('⚠️ "' + msgid + '" looks like a message TYPE (e.g., IE801, IE818), not a Message ID.\n\nMessage IDs look like: XI000002, XI004323, XI00432M\n\nUse Tab 5 first to find the actual Message ID, then click "Use in Tab 6 →" on any message.');
      return;
    }
    
    const outputPre = document.getElementById('gsmsg-output');
    const parsedDiv = document.getElementById('gsmsg-parsed');
    outputPre.innerText = 'Fetching...';
    parsedDiv.innerHTML = '';
    
    try {
      const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/movements/' + mid + '/messages/' + msgid) + '&accept=xml', {
        method: 'GET', credentials: 'include'
      });
      const t = await r.text();
      outputPre.innerText = 'Status: ' + r.status + '\n\n' + t;
      
      if (r.ok) {
        // Format XML with syntax highlighting
        const formatted = esc(t)
          .replace(/(&lt;\/?)([a-zA-Z0-9:]+)/g, '$1<span style="color:#005ea5;font-weight:bold;">$2</span>')
          .replace(/(&gt;)/g, '<span style="color:#005ea5;">$1</span>')
          .replace(/(>)(<)/g, '$1\n$2');
        
        parsedDiv.innerHTML = `
          <div class="parsed-card">
            <h4>Message ${msgid} <span class="type-badge ie801">XML</span></h4>
            <pre style="white-space:pre-wrap;font-size:12px;line-height:1.5;background:#f8f9fa;color:#333;padding:15px;border-radius:5px;border:1px solid #e0e0e0;">${formatted}</pre>
          </div>
        `;
      } else if (r.status === 404) {
        parsedDiv.innerHTML = `
          <div class="parsed-card">
            <h4 style="color:#d4351c;">❌ Message Not Found</h4>
            <p style="margin:10px 0;">The Message ID <code>${esc(msgid)}</code> does not exist for Movement <code>${esc(mid)}</code>.</p>
            <p style="color:#666;font-size:13px;"><strong>Common causes:</strong></p>
            <ul style="color:#666;font-size:13px;margin-left:20px;">
              <li>You entered a message TYPE (like IE818) instead of a Message ID (like XI000002)</li>
              <li>The Message ID has a typo</li>
              <li>The movement doesn't have any messages yet</li>
            </ul>
            <p style="margin-top:15px;"><strong>💡 Tip:</strong> Go to <strong>Tab 5 (Get Messages)</strong> first, enter the Movement ID, and click the <strong>"Use in Tab 6 →"</strong> button on any message to auto-fill this form.</p>
          </div>
        `;
      } else {
        parsedDiv.innerHTML = `<div class="parsed-card"><h4 style="color:#d4351c;">Error ${r.status}</h4><pre>${esc(t)}</pre></div>`;
      }
    } catch(e) {
      outputPre.innerText = 'Error: ' + e.message;
      parsedDiv.innerHTML = `<p class="error">Network error: ${e.message}</p>`;
    }
  });

  // TAB 7: PRE-VALIDATE
  document.getElementById('pre-validate-btn')?.addEventListener('click', async function() {
    const s = await checkSession();
    if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    
    const ern = document.getElementById('pv-ern').value.trim();
    const group = document.getElementById('pv-group').value;
    const p1 = document.getElementById('pv-p1').value.trim();
    
    if (!ern) { alert('ERN required'); return; }
    
    document.getElementById('pv-output').innerText = 'Validating...';
    document.getElementById('pv-parsed').innerHTML = '';
    
    try {
      const body = {
        exciseTraderValidationRequest: {
          exciseRegistrationNumber: ern,
          entityGroup: group
        }
      };
      
      if (p1) {
        body.exciseTraderValidationRequest.validateProductAuthorisationRequest = [
          { product: { exciseProductCode: p1 } }
        ];
      }
      
      const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/traders/pre-validate'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const t = await r.text();
      document.getElementById('pv-output').innerText = 'Status: ' + r.status + '\n\n' + t;
      
      if (r.ok) {
        try {
          const d = JSON.parse(t);
          const result = d.exciseTraderValidationResponse || d;
          const valid = result.validTrader;
          const trader = result.exciseTrader || {};
          
          document.getElementById('pv-parsed').innerHTML = `
            <div class="parsed-card">
              <h4>Validation Result</h4>
              <div class="parsed-grid">
                <div class="parsed-field">
                  <div class="label">Valid Trader</div>
                  <div class="value ${valid ? 'arc' : 'warn'}" style="font-weight:bold;font-size:16px;">${valid ? '✅ YES' : '❌ NO'}</div>
                </div>
                <div class="parsed-field"><div class="label">ERN</div><div class="value">${result.exciseRegistrationNumber || ern}</div></div>
                <div class="parsed-field"><div class="label">Trader Name</div><div class="value">${trader.traderName || 'N/A'}</div></div>
                <div class="parsed-field"><div class="label">Trader Type</div><div class="value">${trader.traderType || result.traderType || 'N/A'}</div></div>
                <div class="parsed-field"><div class="label">Entity Group</div><div class="value">${result.entityGroup || group}</div></div>
                <div class="parsed-field"><div class="label">Street</div><div class="value">${trader.streetName || 'N/A'}</div></div>
                <div class="parsed-field"><div class="label">Postcode</div><div class="value">${trader.postcode || 'N/A'}</div></div>
                <div class="parsed-field"><div class="label">City</div><div class="value">${trader.city || 'N/A'}</div></div>
              </div>
              ${result.validateProductAuthorisationResponse ? `
                <h4 style="margin-top:15px;">Product Authorisation</h4>
                <div class="parsed-grid">
                  ${result.validateProductAuthorisationResponse.map(p => `
                    <div class="parsed-field">
                      <div class="label">${p.product?.exciseProductCode || 'Product'}</div>
                      <div class="value ${p.authorised ? 'arc' : 'warn'}">${p.authorised ? '✅ Authorised' : '❌ Not Authorised'}</div>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          `;
        } catch(e) {
          document.getElementById('pv-parsed').innerHTML = `<p>Response received but couldn't be parsed: ${e.message}</p>`;
        }
      } else {
        try {
          const err = JSON.parse(t);
          document.getElementById('pv-parsed').innerHTML = `
            <div class="parsed-card">
              <h4 style="color:#d4351c;">❌ Validation Error</h4>
              <div class="parsed-grid">
                <div class="parsed-field"><div class="label">Message</div><div class="value warn">${err.message || 'Unknown error'}</div></div>
                ${err.debugMessage ? `<div class="parsed-field"><div class="label">Details</div><div class="value warn">${err.debugMessage}</div></div>` : ''}
              </div>
            </div>
          `;
        } catch(e) {
          document.getElementById('pv-parsed').innerHTML = `<p class="error">Error ${r.status}: ${esc(t)}</p>`;
        }
      }
    } catch(e) {
      document.getElementById('pv-output').innerText = 'Error: ' + e.message;
    }
  });

  // TAB 8: SUBSCRIBE (WITH PARSED VIEW)
  document.getElementById('subscribe-ern-btn')?.addEventListener('click', async function() {
    const s = await checkSession();
    if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    
    const ern = document.getElementById('sub-ern').value.trim();
    if (!ern) { alert('ERN required'); return; }
    
    document.getElementById('sub-output').innerText = 'Subscribing...';
    
    try {
      const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/erns/' + ern + '/subscription'), {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      
      const t = await r.text();
      document.getElementById('sub-output').innerText = 'Status: ' + r.status + '\n\n' + t;
      
      // Parse response
      if (r.ok) {
        try {
          const d = JSON.parse(t);
          document.getElementById('sub-output').innerHTML = `
            <div class="parsed-card" style="margin-top:15px;">
              <h4>✅ Subscription Successful</h4>
              <div class="parsed-grid">
                <div class="parsed-field"><div class="label">ERN</div><div class="value">${d.ern || ern}</div></div>
                <div class="parsed-field"><div class="label">Status</div><div class="value arc">Active</div></div>
                <div class="parsed-field"><div class="label">Created</div><div class="value">${d.createdAt ? new Date(d.createdAt).toLocaleString() : 'Now'}</div></div>
              </div>
              <p style="margin-top:15px;color:#666;font-size:13px;">Your ERN is now subscribed to receive automatic notifications for movement updates.</p>
            </div>
            <details style="margin-top:15px;"><summary style="cursor:pointer;color:#005ea5;">Show Raw Response</summary><pre style="margin-top:10px;">${esc(t)}</pre></details>
          `;
        } catch(e) {
          document.getElementById('sub-output').innerHTML += `<div class="parsed-card" style="margin-top:15px;"><h4>Response</h4><pre>${esc(t)}</pre></div>`;
        }
      } else {
        try {
          const err = JSON.parse(t);
          document.getElementById('sub-output').innerHTML = `
            <div class="parsed-card" style="margin-top:15px;">
              <h4 style="color:#d4351c;">❌ Subscription Failed</h4>
              <div class="parsed-grid">
                <div class="parsed-field"><div class="label">Error</div><div class="value warn">${err.message || 'Unknown error'}</div></div>
                ${err.debugMessage ? `<div class="parsed-field"><div class="label">Details</div><div class="value warn">${err.debugMessage}</div></div>` : ''}
              </div>
            </div>
          `;
        } catch(e) {
          document.getElementById('sub-output').innerHTML += `<p class="error">Error ${r.status}: ${esc(t)}</p>`;
        }
      }
    } catch(e) {
      document.getElementById('sub-output').innerText = 'Error: ' + e.message;
    }
  });

  // TAB 9: UNSUBSCRIBE (WITH PARSED VIEW)
  document.getElementById('unsubscribe-ern-btn')?.addEventListener('click', async function() {
    const s = await checkSession();
    if (!s || !s.hmrcAuthenticated) { alert('Login to HMRC first!'); return; }
    
    const ern = document.getElementById('unsub-ern').value.trim();
    if (!ern) { alert('ERN required'); return; }
    
    document.getElementById('unsub-output').innerText = 'Unsubscribing...';
    
    try {
      const r = await fetch('/api/emcs?endpoint=' + encodeURIComponent('/customs/excise/erns/' + ern + '/subscription'), {
        method: 'DELETE', credentials: 'include'
      });
      
      const t = await r.text();
      document.getElementById('unsub-output').innerText = 'Status: ' + r.status + '\n\n' + t;
      
      // Parse response
      if (r.ok || r.status === 204) {
        document.getElementById('unsub-output').innerHTML = `
          <div class="parsed-card" style="margin-top:15px;">
            <h4>✅ Unsubscribed Successfully</h4>
            <div class="parsed-grid">
              <div class="parsed-field"><div class="label">ERN</div><div class="value">${ern}</div></div>
              <div class="parsed-field"><div class="label">Status</div><div class="value">Removed</div></div>
            </div>
            <p style="margin-top:15px;color:#666;font-size:13px;">Your ERN will no longer receive automatic notifications. You can still manually fetch movements via the Monitor tab.</p>
          </div>
          ${t ? `<details style="margin-top:15px;"><summary style="cursor:pointer;color:#005ea5;">Show Raw Response</summary><pre style="margin-top:10px;">${esc(t)}</pre></details>` : ''}
        `;
      } else {
        try {
          const err = JSON.parse(t);
          document.getElementById('unsub-output').innerHTML = `
            <div class="parsed-card" style="margin-top:15px;">
              <h4 style="color:#d4351c;">❌ Unsubscribe Failed</h4>
              <div class="parsed-grid">
                <div class="parsed-field"><div class="label">Error</div><div class="value warn">${err.message || 'Unknown error'}</div></div>
                ${err.debugMessage ? `<div class="parsed-field"><div class="label">Details</div><div class="value warn">${err.debugMessage}</div></div>` : ''}
              </div>
            </div>
          `;
        } catch(e) {
          document.getElementById('unsub-output').innerHTML += `<p class="error">Error ${r.status}: ${esc(t)}</p>`;
        }
      }
    } catch(e) {
      document.getElementById('unsub-output').innerText = 'Error: ' + e.message;
    }
  });

  // DRAFTS
  window.currentDraftId=null;
  async function loadDrafts() {
    try {
      const r=await fetch('/api/drafts',{credentials:'include'});
      if(r.ok){const drafts=await r.json();const dl=document.getElementById('draft-list');const dc=document.getElementById('draft-count');const ds=document.getElementById('drafts-section');
        if(ds)ds.style.display='block';if(dc)dc.textContent=drafts.length+' saved';
        if(dl){dl.innerHTML='';drafts.forEach(d=>{const c=document.createElement('div');c.className='draft-card';c.innerHTML=`<div class="draft-info"><div class="draft-name">${d.name}</div><div class="draft-meta"><span>${new Date(d.modified).toLocaleDateString()}</span></div></div><div class="draft-actions"><button class="btn-green btn-small load-draft" data-id="${d.id}">Load</button><button class="btn-red btn-small delete-draft" data-id="${d.id}">Delete</button></div>`;dl.appendChild(c);});
          dl.querySelectorAll('.load-draft').forEach(b=>b.addEventListener('click',function(){const d=drafts.find(x=>x.id===this.getAttribute('data-id'));if(d?.data?.lrn)document.getElementById('s-lrn').value=d.data.lrn;window.currentDraftId=d.id;alert('Loaded!');}));
          dl.querySelectorAll('.delete-draft').forEach(b=>b.addEventListener('click',async function(){if(confirm('Delete?')){await fetch('/api/drafts?id='+this.getAttribute('data-id'),{method:'DELETE',credentials:'include'});loadDrafts();}}));
        }
      }
    } catch(e){console.error('Drafts error:',e);}
  }

  document.getElementById('save-draft-btn')?.addEventListener('click', async function() {
    const n=prompt('Draft name:'); if(!n)return;
    try{const r=await fetch('/api/drafts',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:n,data:{lrn:document.getElementById('s-lrn').value},id:window.currentDraftId})});if(r.ok){alert('Saved!');loadDrafts();}}catch(e){alert('Error: '+e.message);}
  });

  await checkSession();
});
