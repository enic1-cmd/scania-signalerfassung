(function(){
  'use strict';
  const state={mode:'create',username:'',admin:'',data:null,deleteUser:'',requests:[],requestFilter:'pending',approveId:'',rejectId:'',mail:null};
  const fmt=new Intl.NumberFormat('de-DE');
  const dateTime=new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'});
  const userList=document.getElementById('user-list');
  const userDialog=document.getElementById('user-dialog');
  const deleteDialog=document.getElementById('delete-dialog');
  const approveDialog=document.getElementById('approve-dialog');
  const rejectDialog=document.getElementById('reject-dialog');
  const form=document.getElementById('user-form');
  const toast=document.getElementById('toast');
  const eventMeta={
    page_view:{label:'Seite aufgerufen',icon:'i-eye'},
    app_open:{label:'Analyse-App geöffnet',icon:'i-activity'},
    file_upload:{label:'Datei ausgewertet',icon:'i-file'},
    excel_export:{label:'Excel exportiert',icon:'i-export'},
    pdf_export:{label:'PDF exportiert',icon:'i-export'}
  };

  async function api(url,options={}){
    const response=await fetch(url,{cache:'no-store',...options,headers:{'Content-Type':'application/json','X-Requested-With':'signalerfassung-admin',...(options.headers||{})}});
    const data=response.status===204?{}:await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Die Anfrage ist fehlgeschlagen.');
    return data;
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function showToast(message,error=false){toast.textContent=message;toast.className='toast show'+(error?' error':'');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.className='toast',3200);}
  function dateLabel(value){return value?dateTime.format(new Date(value)):'Noch keine Nutzung';}
  function relativeDate(value){
    if(!value)return 'Noch nie aktiv';
    const minutes=Math.floor((Date.now()-Date.parse(value))/60000);
    if(minutes<1)return 'Gerade eben';
    if(minutes<60)return `Vor ${minutes} Min.`;
    if(minutes<1440)return `Vor ${Math.floor(minutes/60)} Std.`;
    if(minutes<10080)return `Vor ${Math.floor(minutes/1440)} Tagen`;
    return dateLabel(value);
  }
  function trend(current,previous){
    if(previous===0)return current===0?{text:'Keine Veränderung',className:''}:{text:'Neu im Zeitraum',className:'trend-up'};
    const percent=Math.round(((current-previous)/previous)*100);
    if(percent===0)return {text:'Unverändert zu vorher',className:''};
    return {text:`${percent>0?'↑':'↓'} ${Math.abs(percent)} % zum Zeitraum davor`,className:percent>0?'trend-up':'trend-down'};
  }
  function setTrend(id,current,previous){const node=document.getElementById(id),value=trend(current,previous);node.textContent=value.text;node.className=value.className;}

  function renderMetrics(data){
    const totals=data.totals,previous=data.previous||{};
    document.getElementById('metric-users').textContent=fmt.format(totals.users);
    document.getElementById('metric-active').textContent=fmt.format(totals.activeUsers||0);
    document.getElementById('metric-views').textContent=fmt.format(totals.pageViews);
    document.getElementById('metric-uploads').textContent=fmt.format(totals.uploads);
    document.getElementById('metric-exports').textContent=fmt.format(totals.exports);
    document.getElementById('metric-requests').textContent=fmt.format(totals.pendingRequests||0);
    setTrend('trend-active',totals.activeUsers||0,previous.activeUsers||0);
    setTrend('trend-views',totals.pageViews,previous.pageViews||0);
    setTrend('trend-uploads',totals.uploads,previous.uploads||0);
    setTrend('trend-exports',totals.exports,previous.exports||0);
  }
  function filteredUsers(){
    if(!state.data)return [];
    const query=document.getElementById('user-search').value.trim().toLocaleLowerCase('de-DE');
    const sort=document.getElementById('user-sort').value;
    const users=state.data.users.filter(user=>user.username.toLocaleLowerCase('de-DE').includes(query));
    users.sort((a,b)=>{
      if(sort==='recent')return String(b.lastSeen||'').localeCompare(String(a.lastSeen||''))||a.username.localeCompare(b.username,'de');
      if(sort==='activity')return b.totalActions-a.totalActions||a.username.localeCompare(b.username,'de');
      return a.username.localeCompare(b.username,'de');
    });
    return users;
  }
  function renderUsers(){
    const users=filteredUsers();
    document.getElementById('result-count').textContent=`${fmt.format(users.length)} ${users.length===1?'Konto':'Konten'}`;
    if(!users.length){userList.innerHTML='<div class="empty-state">Keine passenden Benutzer gefunden.</div>';return;}
    userList.innerHTML=users.map(user=>`<article class="user-row" data-user="${esc(user.username)}">
      <div class="user-name"><span class="avatar">${esc(user.username.slice(0,2))}</span><div><strong>${esc(user.username)}</strong>${user.username===state.admin?'<span class="admin-badge">Administrator</span>':''}</div></div>
      <span class="user-status ${user.totalActions?'active':''}">${user.totalActions?'Aktiv':'Ohne Aktivität'}</span>
      <div class="user-stat"><span class="cell-label">Aufrufe</span><span class="count">${fmt.format(user.pageViews)}</span></div>
      <div class="user-stat"><span class="cell-label">Dateien</span><span class="count">${fmt.format(user.uploads)}</span></div>
      <div class="user-stat"><span class="cell-label">Exporte</span><span class="count">${fmt.format(user.exports)}</span></div>
      <div class="last-seen" title="${esc(dateLabel(user.lastSeen))}"><span class="cell-label">Zuletzt aktiv</span>${esc(relativeDate(user.lastSeen))}</div>
      <div class="row-menu"><button class="menu-trigger" type="button" aria-label="Aktionen für ${esc(user.username)}" aria-expanded="false">•••</button><div class="row-actions"><button type="button" data-reset="${esc(user.username)}"><svg><use href="#i-key"/></svg>Passwort ändern</button>${user.username===state.admin?'':`<button class="danger" type="button" data-delete="${esc(user.username)}"><svg><use href="#i-trash"/></svg>Zugang löschen</button>`}</div></div>
    </article>`).join('');
  }
  function dateKey(date){const copy=new Date(date);copy.setHours(12,0,0,0);return copy.toISOString().slice(0,10);}
  function renderChart(){
    if(!state.data)return;
    const days=state.data.days,series=document.getElementById('chart-series').value;
    const map=new Map(state.data.daily.map(item=>[item.date,item]));
    const values=[];
    for(let offset=days-1;offset>=0;offset--){const date=new Date();date.setDate(date.getDate()-offset);const key=dateKey(date),item=map.get(key)||{};values.push({date:key,count:Number(item[series]||0)});}
    const max=Math.max(1,...values.map(item=>item.count));
    document.getElementById('chart').innerHTML=values.map(item=>`<div class="bar-wrap"><div class="bar" style="height:${Math.max(2,(item.count/max)*100)}%"></div><span class="bar-tip">${new Date(item.date+'T12:00:00').toLocaleDateString('de-DE')} · ${fmt.format(item.count)}</span></div>`).join('');
    document.getElementById('chart-start').textContent=new Date(values[0].date+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});
    const totals=state.data.totals;
    document.getElementById('breakdown').innerHTML=[['App-Starts',totals.appOpens],['Dateien',totals.uploads],['Exporte',totals.exports],['Aktionen',totals.totalActions]].map(([label,value])=>`<div class="breakdown-item"><span>${label}</span><strong>${fmt.format(value||0)}</strong></div>`).join('');
  }
  function renderSystem(system){
    const bytes=system.storageBytes||0;
    document.getElementById('system-storage').textContent=bytes<1024?`${bytes} Byte`:bytes<1048576?`${(bytes/1024).toFixed(1).replace('.',',')} KB`:`${(bytes/1048576).toFixed(1).replace('.',',')} MB`;
    document.getElementById('system-retention').textContent=`${system.retentionDays} Tage`;
    document.getElementById('system-updated').textContent=new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(system.generatedAt));
    const mail=system.mail||state.mail||{};
    document.getElementById('system-mail').innerHTML=mail.configured?'<svg><use href="#i-check"/></svg>Bereit':'Nicht konfiguriert';
  }

  function requestStatusLabel(status){return status==='approved'?'Freigegeben':status==='rejected'?'Abgelehnt':'Offen';}
  function renderRequests(){
    const list=document.getElementById('request-list');
    const pending=state.requests.filter(item=>item.status==='pending').length;
    document.getElementById('pending-count').textContent=fmt.format(pending);
    const mailNode=document.getElementById('mail-status');
    mailNode.textContent=state.mail&&state.mail.configured?'E-Mail-Versand bereit':'E-Mail noch nicht konfiguriert';
    mailNode.className='mail-pill '+(state.mail&&state.mail.configured?'ready':'error');
    const items=state.requests.filter(item=>state.requestFilter==='all'||item.status===state.requestFilter);
    if(!items.length){list.innerHTML=`<div class="empty-state">${state.requestFilter==='pending'?'Keine offenen Zugangsanfragen.':'Keine Anfragen in dieser Ansicht.'}</div>`;return;}
    list.innerHTML=items.map(item=>`<article class="request-card ${esc(item.status)}" data-request-id="${esc(item.id)}">
      <div class="request-card-top"><div class="request-person"><span class="avatar">${esc(item.name.split(/\s+/).map(part=>part[0]).join('').slice(0,2))}</span><div><strong>${esc(item.name)}</strong><a href="mailto:${esc(item.email)}">${esc(item.email)}</a></div></div><span class="request-status">${requestStatusLabel(item.status)}</span></div>
      <div class="request-meta"><span>${esc(dateLabel(item.createdAt))} · Sprache: <strong>${item.language==='en'?'EN':'DE'}</strong></span>${item.username?`<span>Zugang: <strong>${esc(item.username)}</strong></span>`:''}</div>
      ${item.lastError?`<p class="request-mail-warning">E-Mail: ${esc(item.lastError)}</p>`:''}
      <div class="request-actions">${item.status==='pending'?`<button class="btn btn-primary" type="button" data-approve-request="${esc(item.id)}"><svg><use href="#i-check"/></svg>Freigeben</button><button class="btn btn-soft" type="button" data-reject-request="${esc(item.id)}">Ablehnen</button>${item.confirmationMailStatus==='failed'?`<button class="btn btn-soft" type="button" data-notify-requester="${esc(item.id)}">Bestätigung erneut</button>`:''}${item.adminMailStatus==='failed'?`<button class="btn btn-soft" type="button" data-notify-admin="${esc(item.id)}">Admin-Info erneut</button>`:''}`:''}</div>
    </article>`).join('');
  }
  function renderRecent(items){
    const list=document.getElementById('recent-list');
    if(!items.length){list.innerHTML='<div class="empty-state">Im gewählten Zeitraum wurden noch keine Aktivitäten erfasst.</div>';return;}
    list.innerHTML=items.map(item=>{const meta=eventMeta[item.event]||{label:'Aktivität',icon:'i-activity'};return `<article class="recent-item"><span class="recent-icon"><svg><use href="#${meta.icon}"/></svg></span><div><strong>${esc(item.user)}</strong><span>${meta.label}</span><time datetime="${esc(item.at)}">${esc(relativeDate(item.at))}</time></div></article>`;}).join('');
  }
  function renderAll(){renderMetrics(state.data);renderRequests();renderUsers();renderChart();renderRecent(state.data.recent||[]);renderSystem(state.data.system);}

  async function load(showSuccess=false){
    const button=document.getElementById('refresh');button.disabled=true;button.classList.add('loading');
    try{
      if(!state.admin){const session=await api('/admin/api/session');state.admin=session.username;document.getElementById('current-user').textContent=session.username;}
      const days=Number(document.getElementById('range').value);
      const [stats,requests]=await Promise.all([api('/admin/api/stats?days='+days),api('/admin/api/access-requests')]);
      state.data=stats;state.requests=requests.requests||[];state.mail=requests.mail||stats.system.mail||null;renderAll();if(showSuccess)showToast('Dashboard wurde aktualisiert.');
    }catch(error){userList.innerHTML=`<div class="empty-state">${esc(error.message)}</div>`;showToast(error.message,true);}
    finally{button.disabled=false;button.classList.remove('loading');}
  }
  function openDialog(mode,username=''){
    state.mode=mode;state.username=username;form.reset();updateStrength();
    document.getElementById('dialog-title').textContent=mode==='create'?'Benutzer anlegen':'Passwort ändern';
    document.getElementById('dialog-subtitle').textContent=mode==='create'?'Neuen Zugang zur Analyse-App einrichten.':`Neues Passwort für ${username} festlegen.`;
    document.getElementById('username-field').hidden=mode!=='create';document.getElementById('username').required=mode==='create';
    document.getElementById('password').type='password';document.getElementById('toggle-password').textContent='Anzeigen';userDialog.showModal();
    setTimeout(()=>document.getElementById(mode==='create'?'username':'password').focus(),30);
  }
  function securePassword(){
    const groups=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnopqrstuvwxyz','23456789','!?#%+-_'];
    const all=groups.join('');const pick=chars=>chars[crypto.getRandomValues(new Uint32Array(1))[0]%chars.length];
    const chars=groups.map(pick);while(chars.length<20)chars.push(pick(all));
    for(let index=chars.length-1;index>0;index--){const target=crypto.getRandomValues(new Uint32Array(1))[0]%(index+1);[chars[index],chars[target]]=[chars[target],chars[index]];}
    return chars.join('');
  }
  function usernameSuggestion(request){
    const source=(request.email.split('@')[0]||request.name).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9._-]+/g,'.').replace(/^[._-]+|[._-]+$/g,'');
    return (source.length>=3?source:`user.${source}`).slice(0,32);
  }
  function openApprove(id){
    const request=state.requests.find(item=>item.id===id);if(!request)return;
    if(!state.mail||!state.mail.configured){showToast('Zuerst den E-Mail-Versand konfigurieren. Es wurde kein Konto angelegt.',true);return;}
    state.approveId=id;
    document.getElementById('approve-name').textContent=request.name;
    document.getElementById('approve-email').textContent=request.email;
    document.getElementById('approve-username').value=usernameSuggestion(request);
    document.getElementById('approve-password').value=securePassword();
    approveDialog.showModal();
    setTimeout(()=>document.getElementById('approve-username').focus(),30);
  }
  async function copyValue(input,message){
    try{await navigator.clipboard.writeText(input.value);}catch{input.select();document.execCommand('copy');}
    showToast(message);
  }
  function updateStrength(){
    const value=document.getElementById('password').value;let score=0;
    if(value.length>=10)score++;if(value.length>=16)score++;if(/[A-Z]/.test(value)&&/[a-z]/.test(value))score++;if(/\d/.test(value)&&/[^A-Za-z0-9]/.test(value))score++;
    const widths=['0%','25%','50%','75%','100%'],labels=['Mindestens 10 Zeichen verwenden.','Schwach','Solide','Stark','Sehr stark'],colors=['#c73535','#c73535','#e79b13','#1681d1','#16864a'];
    const bar=document.getElementById('strength-bar');bar.style.width=widths[score];bar.style.background=colors[score];document.getElementById('strength-label').textContent=labels[score];
  }
  function csvCell(value){return `"${String(value??'').replace(/"/g,'""')}"`;}
  function exportCsv(){
    if(!state.data)return;
    const rows=[['Benutzer','Administrator','Seitenaufrufe','App-Starts','Datei-Auswertungen','Exporte','Aktionen gesamt','Zuletzt aktiv'],...state.data.users.map(user=>[user.username,user.username===state.admin?'Ja':'Nein',user.pageViews,user.appOpens,user.uploads,user.exports,user.totalActions,user.lastSeen||''])];
    const content='\ufeff'+rows.map(row=>row.map(csvCell).join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([content],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`Signalerfassung_Admin_${state.data.days}_Tage.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('CSV-Auswertung wurde erstellt.');
  }

  document.getElementById('add-user').addEventListener('click',()=>openDialog('create'));
  document.querySelectorAll('[data-close-user]').forEach(button=>button.addEventListener('click',()=>userDialog.close()));
  document.getElementById('range').addEventListener('change',()=>load());
  document.getElementById('refresh').addEventListener('click',()=>load(true));
  document.getElementById('export-csv').addEventListener('click',exportCsv);
  document.getElementById('user-search').addEventListener('input',renderUsers);
  document.getElementById('user-sort').addEventListener('change',renderUsers);
  document.getElementById('chart-series').addEventListener('change',renderChart);
  document.querySelectorAll('[data-request-filter]').forEach(button=>button.addEventListener('click',()=>{state.requestFilter=button.dataset.requestFilter;document.querySelectorAll('[data-request-filter]').forEach(item=>item.classList.toggle('active',item===button));renderRequests();}));
  document.getElementById('request-list').addEventListener('click',async event=>{
    const approve=event.target.closest('[data-approve-request]');if(approve){openApprove(approve.dataset.approveRequest);return;}
    const reject=event.target.closest('[data-reject-request]');if(reject){state.rejectId=reject.dataset.rejectRequest;const request=state.requests.find(item=>item.id===state.rejectId);document.getElementById('reject-copy').textContent=`Die Anfrage von ${request?request.name:'diesem Nutzer'} wird als abgelehnt archiviert. Es wird kein Konto angelegt.`;rejectDialog.showModal();return;}
    const notifyRequester=event.target.closest('[data-notify-requester]');if(notifyRequester){notifyRequester.disabled=true;try{await api('/admin/api/access-requests/'+encodeURIComponent(notifyRequester.dataset.notifyRequester)+'/notify',{method:'POST',body:JSON.stringify({target:'requester'})});showToast('Bestätigung wurde erneut an den Anfragenden gesendet.');await load();}catch(error){showToast(error.message,true);}finally{notifyRequester.disabled=false;}return;}
    const notifyAdmin=event.target.closest('[data-notify-admin]');if(notifyAdmin){notifyAdmin.disabled=true;try{await api('/admin/api/access-requests/'+encodeURIComponent(notifyAdmin.dataset.notifyAdmin)+'/notify',{method:'POST',body:JSON.stringify({target:'admin'})});showToast('Admin-Benachrichtigung wurde erneut gesendet.');await load();}catch(error){showToast(error.message,true);}finally{notifyAdmin.disabled=false;}}
  });
  document.querySelectorAll('[data-close-approve]').forEach(button=>button.addEventListener('click',()=>approveDialog.close()));
  document.getElementById('generate-approve-password').addEventListener('click',()=>{document.getElementById('approve-password').value=securePassword();showToast('Neues Startpasswort wurde erzeugt.');});
  document.getElementById('copy-approve-password').addEventListener('click',()=>copyValue(document.getElementById('approve-password'),'Startpasswort wurde kopiert.'));
  document.getElementById('approve-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=document.getElementById('approve-submit');button.disabled=true;
    try{await api('/admin/api/access-requests/'+encodeURIComponent(state.approveId)+'/approve',{method:'POST',body:JSON.stringify({username:document.getElementById('approve-username').value,password:document.getElementById('approve-password').value})});approveDialog.close();showToast('Zugang wurde angelegt und per E-Mail versendet.');await load();}catch(error){showToast(error.message,true);}finally{button.disabled=false;}
  });
  document.getElementById('cancel-reject').addEventListener('click',()=>rejectDialog.close());
  document.getElementById('confirm-reject').addEventListener('click',async()=>{const button=document.getElementById('confirm-reject');button.disabled=true;try{await api('/admin/api/access-requests/'+encodeURIComponent(state.rejectId)+'/reject',{method:'POST'});rejectDialog.close();showToast('Zugangsanfrage wurde abgelehnt.');await load();}catch(error){showToast(error.message,true);}finally{button.disabled=false;}});
  document.getElementById('generate-password').addEventListener('click',()=>{const value=securePassword();document.getElementById('password').value=value;document.getElementById('password-confirm').value=value;document.getElementById('password').type='text';document.getElementById('toggle-password').textContent='Verbergen';updateStrength();showToast('Sicheres Passwort wurde erzeugt.');});
  document.getElementById('toggle-password').addEventListener('click',()=>{const input=document.getElementById('password'),visible=input.type==='text';input.type=visible?'password':'text';document.getElementById('toggle-password').textContent=visible?'Anzeigen':'Verbergen';});
  document.getElementById('password').addEventListener('input',updateStrength);
  document.getElementById('copy-password').addEventListener('click',async()=>{const value=document.getElementById('password').value;if(!value){showToast('Zuerst ein Passwort eingeben oder erzeugen.',true);return;}try{await navigator.clipboard.writeText(value);showToast('Passwort wurde in die Zwischenablage kopiert.');}catch{document.getElementById('password').select();document.execCommand('copy');showToast('Passwort wurde kopiert.');}});
  userList.addEventListener('click',event=>{
    const trigger=event.target.closest('.menu-trigger');if(trigger){const menu=trigger.closest('.row-menu'),open=!menu.classList.contains('open');document.querySelectorAll('.row-menu.open').forEach(item=>{item.classList.remove('open');item.querySelector('.menu-trigger').setAttribute('aria-expanded','false');});menu.classList.toggle('open',open);trigger.setAttribute('aria-expanded',String(open));return;}
    const reset=event.target.closest('[data-reset]');if(reset){openDialog('reset',reset.dataset.reset);return;}
    const remove=event.target.closest('[data-delete]');if(remove){state.deleteUser=remove.dataset.delete;document.getElementById('delete-copy').textContent=`Der Zugang „${state.deleteUser}“ wird sofort gesperrt. Vorhandene Statistikdaten bleiben bis zum Ablauf der Aufbewahrungsfrist erhalten.`;deleteDialog.showModal();}
  });
  document.addEventListener('click',event=>{if(!event.target.closest('.row-menu'))document.querySelectorAll('.row-menu.open').forEach(item=>{item.classList.remove('open');item.querySelector('.menu-trigger').setAttribute('aria-expanded','false');});});
  document.getElementById('cancel-delete').addEventListener('click',()=>deleteDialog.close());
  document.getElementById('confirm-delete').addEventListener('click',async()=>{const button=document.getElementById('confirm-delete');button.disabled=true;try{await api('/admin/api/users/'+encodeURIComponent(state.deleteUser),{method:'DELETE'});deleteDialog.close();showToast('Benutzerzugang wurde gelöscht.');await load();}catch(error){showToast(error.message,true);}finally{button.disabled=false;}});
  form.addEventListener('submit',async event=>{
    event.preventDefault();const password=document.getElementById('password').value,confirmPassword=document.getElementById('password-confirm').value;
    if(password!==confirmPassword){showToast('Die Passwörter stimmen nicht überein.',true);return;}
    const button=document.getElementById('save-user');button.disabled=true;
    try{if(state.mode==='create')await api('/admin/api/users',{method:'POST',body:JSON.stringify({username:document.getElementById('username').value,password})});else await api('/admin/api/users/'+encodeURIComponent(state.username)+'/password',{method:'PUT',body:JSON.stringify({password})});userDialog.close();showToast(state.mode==='create'?'Benutzer wurde angelegt.':'Passwort wurde geändert.');await load();}catch(error){showToast(error.message,true);}finally{button.disabled=false;}
  });
  userDialog.addEventListener('click',event=>{if(event.target===userDialog)userDialog.close();});deleteDialog.addEventListener('click',event=>{if(event.target===deleteDialog)deleteDialog.close();});approveDialog.addEventListener('click',event=>{if(event.target===approveDialog)approveDialog.close();});rejectDialog.addEventListener('click',event=>{if(event.target===rejectDialog)rejectDialog.close();});
  load();
})();
