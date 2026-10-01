(function(){
  'use strict';
  const state={admin:'',data:null,requests:[],mail:null,feedback:[],audit:[],tab:'overview',requestFilter:'pending',userFilter:'all',feedbackFilter:'open',selectedFeedback:'',drawerUser:'',drawer:null,dialogMode:'create',dialogUser:'',approveId:'',replyId:''};
  const fmt=new Intl.NumberFormat('de-DE');
  const dateTime=new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short'});
  const dateShort=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});
  const $=id=>document.getElementById(id);
  const toast=$('toast');
  const EVENTS={page_view:['Seite aufgerufen','i-eye'],app_open:['Analyse-App geöffnet','i-activity'],file_upload:['Datei ausgewertet','i-file'],excel_export:['Excel exportiert','i-export'],pdf_export:['PDF exportiert','i-export']};
  const AUDIT={request_approved:['Zugang freigegeben','i-check'],request_rejected:['Anfrage abgelehnt','i-x'],user_created:['Benutzer angelegt','i-plus'],password_changed:['Passwort geändert','i-key'],user_updated:['Benutzerdaten geändert','i-users'],user_blocked:['Zugang gesperrt','i-lock'],user_unblocked:['Zugang entsperrt','i-unlock'],user_deleted:['Benutzer gelöscht','i-trash'],account_expired:['Zugang abgelaufen','i-clock'],feedback_reply:['Feedback beantwortet','i-reply'],feedback_deleted:['Feedback gelöscht','i-trash']};
  const SERIES=[['pageViews','Aufrufe','#9cc3e4'],['uploads','Dateien','#075ba7'],['exports','Exporte','#f5ad16']];

  async function api(url,options={}){
    const response=await fetch(url,{cache:'no-store',...options,headers:{'Content-Type':'application/json','X-Requested-With':'signalerfassung-admin',...(options.headers||{})}});
    const data=response.status===204?{}:await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Die Anfrage ist fehlgeschlagen.');
    return data;
  }
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function icon(id){return `<svg><use href="#${id}"/></svg>`;}
  function showToast(message,error=false){toast.textContent=message;toast.className='toast show'+(error?' error':'');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>toast.className='toast',3400);}
  function dateLabel(value){return value?dateTime.format(new Date(value)):'–';}
  function dayLabel(value){return value?dateShort.format(new Date(value)):'–';}
  function relative(value){
    if(!value)return 'Noch nie aktiv';
    const minutes=Math.floor((Date.now()-Date.parse(value))/60000);
    if(minutes<1)return 'Gerade eben';if(minutes<60)return `Vor ${minutes} Min.`;
    if(minutes<1440)return `Vor ${Math.floor(minutes/60)} Std.`;if(minutes<10080)return `Vor ${Math.floor(minutes/1440)} Tagen`;
    return dayLabel(value);
  }
  function inputDate(iso){if(!iso)return '';const d=new Date(iso);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function initials(text){return String(text||'?').trim().split(/[\s._-]+/).filter(Boolean).map(part=>part[0]).join('').slice(0,2)||'?';}
  function trend(current,previous){
    if(!previous)return current?{text:'neu im Zeitraum',cls:'up'}:{text:'keine Veränderung',cls:''};
    const p=Math.round((current-previous)/previous*100);
    return p===0?{text:'unverändert',cls:''}:{text:`${p>0?'↑':'↓'} ${Math.abs(p)} % zum Vorzeitraum`,cls:p>0?'up':'down'};
  }
  function displayName(user){return user.name||user.username;}
  function accountBadge(user){
    if(user.status==='blocked')return '<span class="badge blocked">Gesperrt</span>';
    if(user.status==='expired')return '<span class="badge expired">Abgelaufen</span>';
    if(user.expiresAt)return `<span class="badge limited" title="Befristet bis ${esc(dayLabel(user.expiresAt))}">bis ${esc(dayLabel(user.expiresAt))}</span>`;
    return '<span class="badge active">Aktiv</span>';
  }
  function setTrendNode(id,current,previous){const node=$(id),value=trend(current,previous);node.textContent=value.text;node.className=value.cls;}

  /* ---------- Tabs ---------- */
  function setTab(tab,updateHash=true){
    state.tab=tab;
    document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tab===tab)));
    document.querySelectorAll('.tab-panel').forEach(panel=>{panel.hidden=panel.id!=='panel-'+tab;});
    if(updateHash)history.replaceState(null,'','#'+tab);
    if(tab==='feedback'&&!state.selectedFeedback){const first=filteredFeedback()[0];if(first)selectFeedback(first.id,false);}
  }
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>setTab(button.dataset.tab)));
  document.querySelectorAll('[data-goto]').forEach(card=>card.addEventListener('click',()=>setTab(card.dataset.goto)));

  /* ---------- KPIs ---------- */
  function renderKpis(){
    const t=state.data.totals,p=state.data.previous||{};
    $('kpi-users').textContent=fmt.format(t.activeAccounts??t.users);
    $('kpi-users-sub').textContent=t.blockedAccounts?`aktiv · ${t.blockedAccounts} gesperrt/abgelaufen`:'aktive Zugänge';
    $('kpi-active').textContent=fmt.format(t.activeUsers||0);setTrendNode('kpi-active-sub',t.activeUsers||0,p.activeUsers||0);
    $('kpi-uploads').textContent=fmt.format(t.uploads);setTrendNode('kpi-uploads-sub',t.uploads,p.uploads||0);
    $('kpi-exports').textContent=fmt.format(t.exports);setTrendNode('kpi-exports-sub',t.exports,p.exports||0);
    const pending=state.requests.filter(r=>r.status==='pending').length,newFeedback=state.feedback.filter(f=>f.status==='new').length;
    $('kpi-requests').textContent=fmt.format(pending);$('kpi-requests').closest('.kpi').classList.toggle('has-items',pending>0);
    $('kpi-feedback').textContent=fmt.format(newFeedback);$('kpi-feedback').closest('.kpi').classList.toggle('has-items',newFeedback>0);
    $('kpi-feedback-sub').textContent=`${fmt.format(t.feedback||0)} im Zeitraum`;
    const counts={requests:pending,users:state.data.users.length,feedback:newFeedback};
    Object.keys(counts).forEach(key=>{const node=$('tab-count-'+key);node.textContent=fmt.format(counts[key]);if(key!=='users')node.classList.toggle('zero',!counts[key]);});
  }

  /* ---------- Overview ---------- */
  function niceMax(value){if(value<=4)return 4;const power=Math.pow(10,Math.floor(Math.log10(value))),steps=[1,2,2.5,5,10];return steps.map(s=>s*power).find(v=>v>=value)||value;}
  function renderUsage(){
    const days=state.data.days,map=new Map(state.data.daily.map(d=>[d.date,d])),list=[];
    for(let offset=days-1;offset>=0;offset--){const d=new Date();d.setDate(d.getDate()-offset);const key=inputDate(d.toISOString());list.push({date:key,...(map.get(key)||{})});}
    const max=niceMax(Math.max(1,...list.map(d=>SERIES.reduce((sum,s)=>sum+(d[s[0]]||0),0))));
    $('usage-legend').innerHTML=SERIES.map(s=>`<span><i style="background:${s[2]}"></i>${s[1]}</span>`).join('');
    $('usage-chart').innerHTML=`<div class="usage-axis"><span>${fmt.format(max)}</span><span>${fmt.format(max/2)}</span><span>0</span></div><div class="usage-plot"><div class="usage-bars">${list.map(d=>`<div class="usage-day" data-date="${d.date}">${SERIES.map(s=>`<i style="height:${(d[s[0]]||0)/max*100}%;background:${s[2]}"></i>`).join('')}</div>`).join('')}</div><div class="usage-dates"><span>${dayLabel(list[0].date+'T12:00:00')}</span><span>heute</span></div></div>`;
    const bars=$('usage-chart').querySelector('.usage-bars'),tip=document.createElement('div');tip.className='usage-tip';tip.hidden=true;$('usage-chart').appendChild(tip);
    bars.addEventListener('mousemove',event=>{
      const day=event.target.closest('.usage-day');if(!day){tip.hidden=true;return;}
      const d=list.find(item=>item.date===day.dataset.date)||{};
      tip.innerHTML=`<b>${dayLabel(d.date+'T12:00:00')}</b><br>${SERIES.map(s=>`${s[1]}: ${fmt.format(d[s[0]]||0)}`).join('<br>')}`;
      const box=$('usage-chart').getBoundingClientRect(),r=day.getBoundingClientRect();
      tip.hidden=false;tip.style.left=Math.min(box.width-tip.offsetWidth-8,Math.max(8,r.left-box.left-tip.offsetWidth/2+r.width/2))+'px';tip.style.top='6px';
    });
    bars.addEventListener('mouseleave',()=>{tip.hidden=true;});
  }
  function renderTodos(){
    const users=state.data.users,soon=Date.now()+14*86400000,items=[];
    const pending=state.requests.filter(r=>r.status==='pending');
    if(pending.length)items.push(['i-mail',`${pending.length} Zugangsanfrage${pending.length===1?'':'n'} offen`,pending.slice(0,2).map(r=>r.name).join(', ')+(pending.length>2?' …':''),pending.length,()=>setTab('requests')]);
    const fresh=state.feedback.filter(f=>f.status==='new');
    if(fresh.length)items.push(['i-chat',`${fresh.length} neues Feedback`,'Lesen und bei Bedarf antworten',fresh.length,()=>{state.feedbackFilter='open';syncPills('feedback-filter','open');setTab('feedback');}]);
    const expiring=users.filter(u=>u.status==='active'&&u.expiresAt&&Date.parse(u.expiresAt)<=soon);
    if(expiring.length)items.push(['i-clock',`${expiring.length} Zugang läuft bald ab`,expiring.map(u=>`${displayName(u)} (${dayLabel(u.expiresAt)})`).join(', '),expiring.length,()=>{state.userFilter='limited';syncPills('user-filter','limited');setTab('users');renderUsers();}]);
    const failed=state.requests.filter(r=>r.status==='pending'&&r.lastError);
    if(failed.length)items.push(['i-alert',`${failed.length} Mail${failed.length===1?'':'s'} fehlgeschlagen`,'Bei der Anfrage erneut senden',failed.length,()=>setTab('requests')]);
    const disabled=users.filter(u=>u.status!=='active');
    if(disabled.length)items.push(['i-lock',`${disabled.length} gesperrt oder abgelaufen`,disabled.map(displayName).join(', '),disabled.length,()=>{state.userFilter='disabled';syncPills('user-filter','disabled');setTab('users');renderUsers();}]);
    const list=$('todo-list');
    if(!items.length){list.innerHTML=`<li><span class="todo-icon ok">${icon('i-check')}</span><div><strong>Alles erledigt</strong><small>Keine offenen Anfragen, kein neues Feedback.</small></div></li>`;return;}
    list.innerHTML=items.map((item,i)=>`<li data-todo="${i}"><span class="todo-icon">${icon(item[0])}</span><div><strong>${esc(item[1])}</strong><small>${esc(item[2])}</small></div><span class="todo-count">${item[3]}</span></li>`).join('');
    list.querySelectorAll('[data-todo]').forEach(node=>node.addEventListener('click',()=>items[Number(node.dataset.todo)][4]()));
  }
  function renderAnalysis(){
    const t=state.data.totals,sessions=t.appOpens||0,max=Math.max(1,sessions,t.uploads,t.exports);
    const rows=[['App-Starts',sessions],['Dateien ausgewertet',t.uploads],['Exporte',t.exports]];
    $('funnel').innerHTML=rows.map(r=>`<div class="funnel-row"><span>${r[0]}</span><div class="funnel-bar"><i style="width:${r[1]/max*100}%"></i></div><strong>${fmt.format(r[1])}</strong></div>`).join('')+
      `<div class="funnel-ratios"><div class="ratio"><span>Dateien je Start</span><strong>${sessions?(t.uploads/sessions).toLocaleString('de-DE',{maximumFractionDigits:1}):'–'}</strong></div><div class="ratio"><span>Export-Quote</span><strong>${t.uploads?Math.round(t.exports/t.uploads*100)+' %':'–'}</strong></div><div class="ratio"><span>Ø je Nutzer</span><strong>${t.activeUsers?(t.totalActions/t.activeUsers).toLocaleString('de-DE',{maximumFractionDigits:0}):'–'}</strong></div></div>`;
    const pdf=(state.data.exportsByType||{}).pdf||0,excel=(state.data.exportsByType||{}).excel||0,all=pdf+excel;
    $('export-split').innerHTML=all?`<div class="split-bar"><i style="width:${pdf/all*100}%"></i><i style="width:${excel/all*100}%"></i></div><div class="split-labels"><span>PDF ${fmt.format(pdf)} (${Math.round(pdf/all*100)} %)</span><span>Excel ${fmt.format(excel)} (${Math.round(excel/all*100)} %)</span></div>`:'<div class="split-labels"><span>Noch keine Exporte im Zeitraum</span></div>';
    $('analysis-note').textContent=`letzte ${state.data.days} Tage`;
  }
  function renderHeatmap(){
    const heat=state.data.heatmap||[],max=Math.max(1,...heat.flat()),days=['Mo','Di','Mi','Do','Fr','Sa','So'];
    $('heatmap').innerHTML=`<div class="heat-grid">${heat.map((row,d)=>`<span>${days[d]}</span>${row.map((v,h)=>`<i title="${days[d]} ${h}:00 Uhr · ${v} Aktionen" style="${v?`background:rgba(7,91,167,${(.15+.85*v/max).toFixed(2)})`:''}"></i>`).join('')}`).join('')}</div><div class="heat-hours"><span></span>${Array.from({length:24},(_,h)=>`<span>${h%6===0?h:''}</span>`).join('')}</div>`;
  }
  function renderTopUsers(){
    const users=state.data.users.filter(u=>u.totalActions).sort((a,b)=>b.totalActions-a.totalActions).slice(0,6),max=Math.max(1,...users.map(u=>u.totalActions));
    $('top-users').innerHTML=users.length?users.map(u=>`<li data-user="${esc(u.username)}"><div><strong>${esc(displayName(u))}</strong><small>${esc(u.email||'@'+u.username)}</small></div><div class="bar"><i style="width:${u.totalActions/max*100}%"></i></div><b>${fmt.format(u.totalActions)}</b></li>`).join(''):'<li class="muted">Keine Aktivität im Zeitraum.</li>';
    $('top-users').querySelectorAll('[data-user]').forEach(node=>node.addEventListener('click',()=>openUser(node.dataset.user)));
  }
  function renderSystem(){
    const s=state.data.system,mail=state.mail||s.mail||{},bytes=s.storageBytes||0;
    const size=bytes<1048576?`${(bytes/1024).toFixed(1).replace('.',',')} KB`:`${(bytes/1048576).toFixed(1).replace('.',',')} MB`;
    $('system-strip').innerHTML=`<span><span class="status-dot"></span><b>Admin-API</b> erreichbar</span><span><span class="status-dot ${mail.configured?'':'off'}"></span><b>E-Mail</b> ${mail.configured?'bereit':'nicht konfiguriert'}</span><span><b>Statistik</b> ${fmt.format(s.storedEvents||0)} Ereignisse · ${size}</span><span><b>Aufbewahrung</b> ${s.retentionDays} Tage</span><span><b>Stand</b> ${new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(s.generatedAt))}</span>`;
  }

  /* ---------- Requests ---------- */
  function syncPills(attr,value){document.querySelectorAll(`[data-${attr}]`).forEach(b=>b.classList.toggle('active',b.dataset[attr.replace(/-([a-z])/g,(m,c)=>c.toUpperCase())]===value));}
  function requestStatus(r){return r.status==='approved'?'<span class="badge approved">Freigegeben</span>':r.status==='rejected'?'<span class="badge rejected">Abgelehnt</span>':'<span class="badge pending">Offen</span>';}
  function renderRequests(){
    const mail=$('mail-status'),ready=state.mail&&state.mail.configured;
    mail.textContent=ready?'E-Mail-Versand bereit':'E-Mail nicht konfiguriert';mail.className='mail-pill '+(ready?'ready':'error');
    const items=state.requests.filter(r=>state.requestFilter==='all'||r.status===state.requestFilter);
    const head='<div class="row head request-row"><span>Anfrage</span><span>Sprache</span><span>Eingang</span><span>Status</span><span></span></div>';
    if(!items.length){$('request-table').innerHTML=head+`<div class="empty-state">${state.requestFilter==='pending'?'Keine offenen Zugangsanfragen.':'Keine Anfragen in dieser Ansicht.'}</div>`;return;}
    $('request-table').innerHTML=head+items.map(r=>`<div class="row request-row"><div class="person"><span class="avatar">${esc(initials(r.name))}</span><div class="person-text"><strong>${esc(r.name)}</strong><a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.username?`<small>Zugang: @${esc(r.username)}</small>`:''}</div></div><span class="num">${r.language==='en'?'EN':'DE'}</span><span title="${esc(dateLabel(r.createdAt))}">${esc(relative(r.createdAt))}</span>${requestStatus(r)}<div class="row-actions">${r.status==='pending'?`<button class="btn btn-primary btn-small" type="button" data-approve="${esc(r.id)}">${icon('i-check')}Freigeben</button><button class="btn btn-soft btn-small" type="button" data-reject="${esc(r.id)}">Ablehnen</button>${r.confirmationMailStatus==='failed'?`<button class="btn btn-soft btn-small" type="button" data-notify="${esc(r.id)}" data-target="requester">Bestätigung erneut</button>`:''}${r.adminMailStatus==='failed'?`<button class="btn btn-soft btn-small" type="button" data-notify="${esc(r.id)}" data-target="admin">Admin-Info erneut</button>`:''}`:(r.username?`<button class="btn btn-soft btn-small" type="button" data-open-user="${esc(r.username)}">Benutzer öffnen</button>`:'')}</div>${r.lastError?`<span class="row-hint">E-Mail: ${esc(r.lastError)}</span>`:''}</div>`).join('');
  }

  /* ---------- Users ---------- */
  function filteredUsers(){
    if(!state.data)return [];
    const q=$('user-search').value.trim().toLocaleLowerCase('de-DE'),sort=$('user-sort').value;
    const users=state.data.users.filter(u=>{
      if(q&&![u.username,u.name,u.email].join(' ').toLocaleLowerCase('de-DE').includes(q))return false;
      if(state.userFilter==='active')return u.status==='active';
      if(state.userFilter==='limited')return u.status==='active'&&!!u.expiresAt;
      if(state.userFilter==='disabled')return u.status!=='active';
      return true;
    });
    users.sort((a,b)=>sort==='recent'?String(b.lastSeen||'').localeCompare(String(a.lastSeen||'')):sort==='activity'?b.totalActions-a.totalActions:displayName(a).localeCompare(displayName(b),'de'));
    return users;
  }
  function renderUsers(){
    const users=filteredUsers();
    const head='<div class="row head"><span>Benutzer</span><span>Status</span><span>Aufrufe</span><span>Dateien</span><span>Exporte</span><span class="last-col">Zuletzt aktiv</span><span></span></div>';
    $('user-table').innerHTML=head+(users.length?users.map(u=>`<div class="row" data-user="${esc(u.username)}" tabindex="0" role="button" aria-label="Details zu ${esc(displayName(u))}"><div class="person"><span class="avatar">${esc(initials(u.name||u.username))}</span><div class="person-text"><strong>${esc(displayName(u))} ${u.isAdmin?'<span class="badge admin">Admin</span>':''}</strong>${u.email?`<small>${esc(u.email)}</small>`:'<small class="missing">keine E-Mail hinterlegt</small>'}<small>@${esc(u.username)}</small></div></div>${accountBadge(u)}<span class="num">${fmt.format(u.pageViews)}</span><span class="num">${fmt.format(u.uploads)}</span><span class="num">${fmt.format(u.exports)}</span><span class="last-col" title="${esc(dateLabel(u.lastSeen))}">${esc(relative(u.lastSeen))}</span><span class="muted">${icon('i-chevron')}</span></div>`).join(''):'<div class="empty-state">Keine passenden Benutzer.</div>');
  }
  $('user-table').addEventListener('click',event=>{const row=event.target.closest('[data-user]');if(row)openUser(row.dataset.user);});
  $('user-table').addEventListener('keydown',event=>{if(event.key==='Enter'){const row=event.target.closest('[data-user]');if(row)openUser(row.dataset.user);}});

  /* ---------- User detail drawer ---------- */
  async function openUser(username){
    state.drawerUser=username;
    $('drawer-layer').hidden=false;
    $('user-drawer').innerHTML='<div class="empty-state">Benutzer wird geladen…</div>';
    try{state.drawer=await api('/admin/api/users/'+encodeURIComponent(username));renderDrawer();}
    catch(error){$('user-drawer').innerHTML=`<div class="empty-state">${esc(error.message)}</div>`;}
  }
  function closeDrawer(){$('drawer-layer').hidden=true;state.drawerUser='';state.drawer=null;}
  function renderDrawer(){
    const d=state.drawer,a=d.account,days=60,map=new Map(d.daily.map(x=>[x.date,x.count])),series=[];
    for(let o=days-1;o>=0;o--){const x=new Date();x.setDate(x.getDate()-o);series.push(map.get(inputDate(x.toISOString()))||0);}
    const max=Math.max(1,...series);
    const statusLine=a.status==='blocked'?`Gesperrt seit ${dayLabel(a.blockedAt)}${a.blockReason?` · ${a.blockReason}`:''}`:a.status==='expired'?`Abgelaufen am ${dayLabel(a.expiresAt)}`:a.expiresAt?`Aktiv, befristet bis ${dayLabel(a.expiresAt)}`:'Aktiv, unbefristet';
    $('user-drawer').innerHTML=`
      <div class="drawer-head"><span class="avatar">${esc(initials(a.name||a.username))}</span><div><h2 id="drawer-title">${esc(a.name||a.username)}</h2><p>${esc(a.email||'keine E-Mail hinterlegt')} · @${esc(a.username)}</p></div><button class="icon-button" type="button" data-drawer-close aria-label="Schließen">${icon('i-x')}</button></div>
      <div class="drawer-actions">${accountBadge(a)}${a.isAdmin?'<span class="badge admin">Administrator</span>':''}<span style="flex:1"></span>
        <button class="btn btn-soft btn-small" type="button" data-drawer-password>${icon('i-key')}Passwort ändern</button>
        ${a.isAdmin?'':a.status==='active'?`<button class="btn btn-soft btn-small" type="button" data-drawer-block>${icon('i-lock')}Sperren</button>`:a.status==='blocked'?`<button class="btn btn-soft btn-small" type="button" data-drawer-unblock>${icon('i-unlock')}Entsperren</button>`:''}
        ${a.isAdmin?'':`<button class="btn btn-danger-soft btn-small" type="button" data-drawer-delete>${icon('i-trash')}Löschen</button>`}</div>
      <div class="drawer-body">
        <section class="drawer-section"><h3>Kontakt &amp; Zugang</h3><div class="section-body">
          <form id="profile-form" class="field-grid">
            <label class="field">Name<input id="profile-name" maxlength="100" value="${esc(a.name)}" placeholder="Vor- und Nachname"></label>
            <label class="field">E-Mail<input id="profile-email" type="email" maxlength="254" value="${esc(a.email)}" placeholder="name@werkstatt.de"></label>
            <label class="field">Sprache der Mails<select id="profile-language"><option value="de"${a.language==='de'?' selected':''}>Deutsch</option><option value="en"${a.language==='en'?' selected':''}>English</option></select></label>
            <label class="field">Befristet bis${a.isAdmin?' <span class="optional">(nicht für Admins)</span>':''}<input id="profile-expiry" type="date" value="${esc(inputDate(a.expiresAt))}"${a.isAdmin?' disabled':''}><small>Leer lassen = unbefristet. Nach Ablauf wird automatisch gesperrt.</small></label>
          </form>
          <div class="save-row"><small>${esc(statusLine)}</small><button class="btn btn-primary btn-small" type="button" data-profile-save>${icon('i-check')}Speichern</button></div>
          <dl class="kv" style="margin-top:12px"><dt>Angelegt</dt><dd>${esc(dayLabel(a.createdAt))} · ${a.source==='request'?'über Zugangsanfrage':'manuell'}</dd>${d.request?`<dt>Anfrage</dt><dd>${esc(d.request.name)} &lt;${esc(d.request.email)}&gt; vom ${esc(dayLabel(d.request.createdAt))}</dd>`:''}</dl>
        </div></section>
        <section class="drawer-section"><h3>Nutzung · letzte ${d.retentionDays} Tage</h3><div class="section-body">
          <div class="facts"><div class="fact"><span>Aufrufe</span><strong>${fmt.format(d.totals.pageViews)}</strong></div><div class="fact"><span>Dateien</span><strong>${fmt.format(d.totals.uploads)}</strong></div><div class="fact"><span>Exporte</span><strong>${fmt.format(d.totals.exports)}</strong></div><div class="fact"><span>Aktive Tage</span><strong>${fmt.format(d.activeDays)}</strong></div></div>
          <div class="mini-chart" title="Aktionen pro Tag, letzte ${days} Tage">${series.map(v=>`<i class="${v?'':'empty'}" style="height:${v?Math.max(6,v/max*100):4}%"></i>`).join('')}</div>
          <div class="mini-dates"><span>vor ${days} Tagen</span><span>Zuerst ${esc(dayLabel(d.firstSeen))} · zuletzt ${esc(relative(d.lastSeen))}</span><span>heute</span></div>
        </div></section>
        <section class="drawer-section"><h3>Letzte Aktionen</h3><div class="section-body"><ul class="compact-list">${d.recent.length?d.recent.slice(0,12).map(e=>`<li><span>${esc((EVENTS[e.event]||['Aktivität'])[0])}</span><time>${esc(dateLabel(e.at))}</time></li>`).join(''):'<li class="muted">Noch keine Aktivität.</li>'}</ul></div></section>
        ${d.feedback.length?`<section class="drawer-section"><h3>Feedback</h3><div class="section-body"><ul class="compact-list">${d.feedback.map(f=>`<li><a href="#feedback" data-goto-feedback="${esc(f.id)}">Feedbackbogen vom ${esc(dayLabel(f.receivedAt))}</a><span class="badge ${esc(f.status)}">${f.status==='new'?'Neu':f.status==='done'?'Beantwortet':'Gelesen'}</span></li>`).join('')}</ul></div></section>`:''}
        ${d.messages.length?`<section class="drawer-section"><h3>Gesendete Antworten</h3><div class="section-body"><ul class="compact-list">${d.messages.map(m=>`<li><span>${esc(m.subject)}</span><time>${esc(dateLabel(m.at))}</time></li>`).join('')}</ul></div></section>`:''}
        <section class="drawer-section"><h3>Verlauf</h3><div class="section-body"><ul class="compact-list">${d.audit.length?d.audit.map(e=>`<li><span>${esc((AUDIT[e.action]||[e.action])[0])}${e.detail?` · ${esc(e.detail)}`:''}</span><time>${esc(dateLabel(e.at))}</time></li>`).join(''):'<li class="muted">Keine Admin-Aktionen protokolliert.</li>'}</ul></div></section>
      </div>`;
  }
  $('user-drawer').addEventListener('click',async event=>{
    const a=state.drawer&&state.drawer.account;if(!a)return;
    if(event.target.closest('[data-drawer-close]')){closeDrawer();return;}
    if(event.target.closest('[data-drawer-password]')){openUserDialog('password',a);return;}
    if(event.target.closest('[data-drawer-block]')){
      const result=await confirmAction({title:'Zugang sperren?',copy:`„${a.name||a.username}“ kann sich sofort nicht mehr anmelden. Passwort und Daten bleiben erhalten, Entsperren ist jederzeit möglich.`,ok:'Sperren',reason:true});
      if(result!==false)await mutate(()=>api(`/admin/api/users/${encodeURIComponent(a.username)}/block`,{method:'POST',body:JSON.stringify({reason:result})}),'Zugang wurde gesperrt.');return;
    }
    if(event.target.closest('[data-drawer-unblock]')){await mutate(()=>api(`/admin/api/users/${encodeURIComponent(a.username)}/unblock`,{method:'POST',body:'{}'}),'Zugang wurde entsperrt.');return;}
    if(event.target.closest('[data-drawer-delete]')){
      const ok=await confirmAction({title:'Benutzer löschen?',copy:`Der Zugang „${a.username}“ wird endgültig gelöscht. Statistikdaten bleiben bis zum Ablauf der Aufbewahrungsfrist erhalten.`,ok:'Endgültig löschen'});
      if(ok!==false){await mutate(()=>api('/admin/api/users/'+encodeURIComponent(a.username),{method:'DELETE'}),'Benutzer wurde gelöscht.',false);closeDrawer();}return;
    }
    if(event.target.closest('[data-profile-save]')){
      const body={name:$('profile-name').value,email:$('profile-email').value,language:$('profile-language').value};
      if(!a.isAdmin)body.expiresAt=$('profile-expiry').value||null;
      await mutate(()=>api('/admin/api/users/'+encodeURIComponent(a.username),{method:'PATCH',body:JSON.stringify(body)}),'Benutzerdaten wurden gespeichert.');return;
    }
    const fb=event.target.closest('[data-goto-feedback]');if(fb){event.preventDefault();closeDrawer();state.feedbackFilter='all';syncPills('feedback-filter','all');setTab('feedback');selectFeedback(fb.dataset.gotoFeedback);}
  });
  document.querySelector('.drawer-backdrop').addEventListener('click',closeDrawer);
  async function mutate(action,message,reopen=true){
    try{await action();showToast(message);await load();if(reopen&&state.drawerUser)await openUser(state.drawerUser);}
    catch(error){showToast(error.message,true);}
  }

  /* ---------- Feedback ---------- */
  function filteredFeedback(){return state.feedback.filter(f=>state.feedbackFilter==='all'||(state.feedbackFilter==='done'?f.status==='done':f.status!=='done'));}
  function feedbackStatus(f){return f.status==='new'?'<span class="badge new">Neu</span>':f.status==='done'?'<span class="badge done">Beantwortet</span>':'<span class="badge read">Gelesen</span>';}
  function feedbackTitle(f){return f.anonymous?'Anonymes Feedback':(f.name||'Ohne Namen');}
  function preview(text){return String(text||'').split('\n').map(l=>l.replace(/^[-*]\s*/,'').trim()).filter(l=>l&&!/^[A-ZÄÖÜ -]{6,}$/.test(l)).slice(0,3).join(' · ');}
  function renderFeedbackList(){
    const items=filteredFeedback();
    $('feedback-list').innerHTML=items.length?items.map(f=>`<button type="button" class="feedback-item ${f.status==='new'?'unread':''} ${f.id===state.selectedFeedback?'selected':''}" data-feedback="${esc(f.id)}"><div class="feedback-item-top"><strong>${esc(feedbackTitle(f))}</strong>${feedbackStatus(f)}</div><small>${esc([f.workshop,dateLabel(f.receivedAt),f.attachments&&f.attachments.length?`${f.attachments.length} ${f.attachments.length===1?'Anhang':'Anhänge'}`:''].filter(Boolean).join(' · '))}</small><p>${esc(preview(f.report))}</p></button>`).join(''):'<div class="empty-state">Kein Feedback in dieser Ansicht.</div>';
  }
  $('feedback-list').addEventListener('click',event=>{const item=event.target.closest('[data-feedback]');if(item)selectFeedback(item.dataset.feedback);});
  /* Opening the tab only shows the first form; it counts as read once it is clicked. */
  async function selectFeedback(id,markRead=true){
    state.selectedFeedback=id;renderFeedbackList();renderFeedbackReader();
    const f=state.feedback.find(x=>x.id===id);
    if(markRead&&f&&f.status==='new'){try{const r=await api('/admin/api/feedback/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status:'read'})});Object.assign(f,r.feedback);renderFeedbackList();renderFeedbackReader();renderKpis();renderTodos();}catch(error){showToast(error.message,true);}}
  }
  function renderFeedbackReader(){
    const f=state.feedback.find(x=>x.id===state.selectedFeedback),reader=$('feedback-reader');
    if(!f){reader.innerHTML='<div class="empty-state">Feedback in der Liste auswählen.</div>';return;}
    const meta=[f.workshop&&`Werkstatt: ${esc(f.workshop)}`,f.role&&esc(f.role),f.testDate&&`Testdatum: ${esc(dayLabel(f.testDate+'T12:00:00'))}`,`Eingang: ${esc(dateLabel(f.receivedAt))}`,`Sprache: ${f.language==='en'?'EN':'DE'}`].filter(Boolean);
    reader.innerHTML=`<div class="reader-head"><div><h2>${esc(feedbackTitle(f))}</h2><div class="reader-meta">${f.email?`<a href="mailto:${esc(f.email)}">${esc(f.email)}</a>`:'<span>keine E-Mail-Adresse</span>'}${meta.map(m=>`<span>${m}</span>`).join('')}</div></div><div class="reader-actions">${feedbackStatus(f)}</div></div>
      <div class="reader-body">
        <div class="reader-actions" style="justify-content:flex-start"><button class="btn btn-primary" type="button" data-reply ${f.email?'':'disabled'}>${icon('i-reply')}Antworten</button>${f.status==='done'?'<button class="btn btn-soft" type="button" data-feedback-status="read">Wieder öffnen</button>':'<button class="btn btn-soft" type="button" data-feedback-status="done">Als erledigt markieren</button>'}<button class="btn btn-danger-soft" type="button" data-feedback-delete>${icon('i-trash')}Löschen</button></div>
        ${f.email?'':`<p class="reader-note">${f.anonymous?'Anonym abgegeben':'Ohne E-Mail-Adresse abgegeben'}: eine Antwort ist nicht möglich.</p>`}
        ${f.mailOk===false?'<p class="reader-note">Die Benachrichtigungsmail zu diesem Feedback konnte nicht versendet werden. Der Bericht liegt nur hier vor.</p>':''}
        ${(f.replies||[]).length?`<div class="replies">${f.replies.map(r=>`<div class="reply-item">${icon('i-reply')}<span>Beantwortet am ${esc(dateLabel(r.at))}: <b>${esc(r.subject)}</b></span></div>`).join('')}</div>`:''}
        ${(f.attachments||[]).length?`<div class="chips">${f.attachments.map(a=>`<span class="chip">${icon('i-paperclip')}${esc(a.filename)} · ${fmt.format(Math.max(1,Math.round(a.size/1024)))} KB</span>`).join('')}<span class="chip">Dateien liegen der Feedback-Mail bei</span></div>`:''}
        <pre class="reader-report">${esc(f.report)}</pre>
      </div>`;
  }
  $('feedback-reader').addEventListener('click',async event=>{
    const f=state.feedback.find(x=>x.id===state.selectedFeedback);if(!f)return;
    if(event.target.closest('[data-reply]')){openReply(f);return;}
    const status=event.target.closest('[data-feedback-status]');
    if(status){try{const r=await api('/admin/api/feedback/'+encodeURIComponent(f.id),{method:'PATCH',body:JSON.stringify({status:status.dataset.feedbackStatus})});Object.assign(f,r.feedback);renderAllFeedback();showToast(f.status==='done'?'Als erledigt markiert.':'Wieder geöffnet.');}catch(error){showToast(error.message,true);}return;}
    if(event.target.closest('[data-feedback-delete]')){
      const ok=await confirmAction({title:'Feedback löschen?',copy:'Der Feedbackbogen wird aus dem Admin Hub entfernt. Die ursprüngliche E-Mail mit den Anhängen bleibt in deinem Postfach.',ok:'Löschen'});
      if(ok===false)return;
      try{await api('/admin/api/feedback/'+encodeURIComponent(f.id),{method:'DELETE'});state.feedback=state.feedback.filter(x=>x.id!==f.id);state.selectedFeedback='';renderAllFeedback();showToast('Feedback wurde gelöscht.');}catch(error){showToast(error.message,true);}
    }
  });
  function renderAllFeedback(){renderFeedbackList();renderFeedbackReader();renderKpis();renderTodos();}
  document.querySelectorAll('[data-feedback-filter]').forEach(b=>b.addEventListener('click',()=>{state.feedbackFilter=b.dataset.feedbackFilter;syncPills('feedback-filter',state.feedbackFilter);renderFeedbackList();}));

  /* ---------- Reply to feedback ---------- */
  const TEMPLATES={
    de:{
      thanks:['Danke für dein Feedback','Hallo {name},\n\nvielen Dank, dass du dir die Zeit für den Feedbackbogen genommen hast. Deine Hinweise helfen mir sehr, das Analyse-Tool für den Werkstattalltag besser zu machen.\n\nIch melde mich, sobald deine Punkte umgesetzt sind.\n\nViele Grüße\nDavid'],
      question:['Rückfrage zu deinem Feedback','Hallo {name},\n\nvielen Dank für dein Feedback. Zu einem Punkt habe ich noch eine kurze Rückfrage:\n\n\n\nViele Grüße\nDavid'],
      done:['Dein Wunsch ist umgesetzt','Hallo {name},\n\ngute Nachrichten: Dein Vorschlag aus dem Feedbackbogen ist jetzt im Analyse-Tool umgesetzt.\n\n\n\nProbier es gern aus und sag mir, ob es so passt.\n\nViele Grüße\nDavid']
    },
    en:{
      thanks:['Thank you for your feedback','Hello {name},\n\nthank you for taking the time to fill in the feedback form. Your input really helps me improve the analysis tool for everyday workshop use.\n\nI will get back to you as soon as your points have been implemented.\n\nBest regards\nDavid'],
      question:['A question about your feedback','Hello {name},\n\nthank you for your feedback. I have a short question about one point:\n\n\n\nBest regards\nDavid'],
      done:['Your request has been implemented','Hello {name},\n\ngood news: your suggestion from the feedback form is now available in the analysis tool.\n\n\n\nPlease give it a try and let me know whether it works for you.\n\nBest regards\nDavid']
    }
  };
  let previewTimer=0;
  function firstName(f){return String(f.name||'').trim().split(/\s+/)[0]||'';}
  function applyTemplate(){
    const f=state.feedback.find(x=>x.id===state.replyId),key=$('reply-template').value,lang=$('reply-language').value;if(!f||!key)return;
    const t=TEMPLATES[lang][key];$('reply-subject').value=t[0];$('reply-message').value=t[1].replace('{name}',firstName(f)||(lang==='en'?'there':'zusammen'));schedulePreview(0);
  }
  function openReply(f){
    state.replyId=f.id;
    $('reply-recipient').textContent=`An ${f.name?f.name+' ':''}<${f.email}>`;
    $('reply-language').value=f.language==='en'?'en':'de';$('reply-template').value='thanks';applyTemplate();
    $('reply-dialog').showModal();setTimeout(()=>$('reply-message').focus(),40);
  }
  function schedulePreview(delay=450){clearTimeout(previewTimer);previewTimer=setTimeout(updatePreview,delay);}
  async function updatePreview(){
    if(!state.replyId)return;
    const subject=$('reply-subject').value.trim(),message=$('reply-message').value.trim();
    if(subject.length<2||message.length<2){$('reply-preview').srcdoc='<p style="font:13px sans-serif;color:#66778e;padding:20px">Betreff und Nachricht eingeben, um die Vorschau zu sehen.</p>';return;}
    try{const r=await api(`/admin/api/feedback/${encodeURIComponent(state.replyId)}/reply-preview`,{method:'POST',body:JSON.stringify({subject,message,language:$('reply-language').value})});$('reply-preview').srcdoc=r.html;}
    catch(error){$('reply-preview').srcdoc=`<p style="font:13px sans-serif;color:#c73535;padding:20px">${esc(error.message)}</p>`;}
  }
  $('reply-template').addEventListener('change',applyTemplate);
  $('reply-language').addEventListener('change',()=>{if($('reply-template').value)applyTemplate();else schedulePreview(0);});
  ['reply-subject','reply-message'].forEach(id=>$(id).addEventListener('input',()=>schedulePreview()));
  $('reply-refresh-preview').addEventListener('click',()=>updatePreview());
  $('reply-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('reply-send');button.disabled=true;
    try{
      const r=await api(`/admin/api/feedback/${encodeURIComponent(state.replyId)}/reply`,{method:'POST',body:JSON.stringify({subject:$('reply-subject').value,message:$('reply-message').value,language:$('reply-language').value})});
      const f=state.feedback.find(x=>x.id===state.replyId);if(f)Object.assign(f,r.feedback);
      $('reply-dialog').close();renderAllFeedback();showToast('Antwort wurde gesendet.');loadAudit();
    }catch(error){showToast(error.message,true);}finally{button.disabled=false;}
  });

  /* ---------- Log ---------- */
  function renderLog(){
    $('audit-list').innerHTML=state.audit.length?state.audit.map(e=>{const m=AUDIT[e.action]||[e.action,'i-activity'];return `<li><span class="log-icon">${icon(m[1])}</span><div><strong>${esc(m[0])}</strong><small>${esc(e.target)}${e.detail?' · '+esc(e.detail):''} · von ${esc(e.admin)}</small></div><time title="${esc(dateLabel(e.at))}">${esc(relative(e.at))}</time></li>`;}).join(''):'<li class="muted">Noch keine Admin-Aktionen protokolliert.</li>';
    const recent=(state.data&&state.data.recent)||[];
    $('recent-list').innerHTML=recent.length?recent.map(e=>{const m=EVENTS[e.event]||['Aktivität','i-activity'];const u=state.data.users.find(x=>x.username===e.user);return `<li><span class="log-icon">${icon(m[1])}</span><div><strong>${esc(u?displayName(u):e.user)}</strong><small>${esc(m[0])}</small></div><time title="${esc(dateLabel(e.at))}">${esc(relative(e.at))}</time></li>`;}).join(''):'<li class="muted">Keine Aktivitäten im Zeitraum.</li>';
  }
  async function loadAudit(){try{const r=await api('/admin/api/audit?limit=150');state.audit=r.entries||[];renderLog();}catch{}}

  /* ---------- Load ---------- */
  function renderAll(){renderKpis();renderUsage();renderTodos();renderAnalysis();renderHeatmap();renderTopUsers();renderSystem();renderRequests();renderUsers();renderFeedbackList();renderFeedbackReader();renderLog();}
  async function load(showSuccess=false){
    const button=$('refresh');button.disabled=true;button.classList.add('loading');
    try{
      if(!state.admin){const session=await api('/admin/api/session');state.admin=session.username;$('current-user').textContent=session.username;}
      const days=Number($('range').value);
      const [stats,requests,feedback,audit]=await Promise.all([api('/admin/api/stats?days='+days),api('/admin/api/access-requests'),api('/admin/api/feedback'),api('/admin/api/audit?limit=150')]);
      state.data=stats;state.requests=requests.requests||[];state.mail=requests.mail||stats.system.mail||null;state.feedback=feedback.feedback||[];state.audit=audit.entries||[];
      renderAll();if(showSuccess)showToast('Daten wurden aktualisiert.');
    }catch(error){showToast(error.message,true);$('user-table').innerHTML=`<div class="empty-state">${esc(error.message)}</div>`;}
    finally{button.disabled=false;button.classList.remove('loading');}
  }

  /* ---------- Dialogs ---------- */
  document.querySelectorAll('dialog').forEach(dialog=>{
    dialog.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
    dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  });
  function confirmAction({title,copy,ok,reason=false,danger=true}){
    return new Promise(resolve=>{
      const dialog=$('confirm-dialog');$('confirm-title').textContent=title;$('confirm-copy').textContent=copy;$('confirm-ok').textContent=ok;
      $('confirm-reason-field').hidden=!reason;$('confirm-reason').value='';$('confirm-icon').className='danger-icon'+(danger?'':' neutral');
      let result=false;
      const onSubmit=event=>{event.preventDefault();result=reason?$('confirm-reason').value.trim():true;dialog.close();};
      $('confirm-form').addEventListener('submit',onSubmit,{once:true});
      dialog.addEventListener('close',()=>{$('confirm-form').removeEventListener('submit',onSubmit);resolve(result);},{once:true});
      dialog.showModal();
    });
  }
  function securePassword(){
    const groups=['ABCDEFGHJKLMNPQRSTUVWXYZ','abcdefghijkmnopqrstuvwxyz','23456789','!?#%+-_'],all=groups.join('');
    const pick=chars=>chars[crypto.getRandomValues(new Uint32Array(1))[0]%chars.length],chars=groups.map(pick);
    while(chars.length<20)chars.push(pick(all));
    for(let i=chars.length-1;i>0;i--){const j=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[chars[i],chars[j]]=[chars[j],chars[i]];}
    return chars.join('');
  }
  function updateStrength(){
    const v=$('password').value;let score=0;
    if(v.length>=10)score++;if(v.length>=16)score++;if(/[A-Z]/.test(v)&&/[a-z]/.test(v))score++;if(/\d/.test(v)&&/[^A-Za-z0-9]/.test(v))score++;
    $('strength-bar').style.width=['0%','25%','50%','75%','100%'][score];$('strength-bar').style.background=['#c73535','#c73535','#e79b13','#1681d1','#16864a'][score];
    $('strength-label').textContent=['Mindestens 10 Zeichen verwenden.','Schwach','Solide','Stark','Sehr stark'][score];
  }
  function syncSendMail(){
    const email=state.dialogMode==='create'?$('create-email').value.trim():(state.dialogEmail||'');
    $('send-mail').disabled=!email;$('send-mail-field').classList.toggle('disabled',!email);if(!email)$('send-mail').checked=false;
    $('send-mail-label').textContent=state.dialogMode==='create'?(email?`Zugangsdaten per E-Mail an ${email} senden`:'Zugangsdaten per E-Mail senden (E-Mail eintragen)'):(email?`Neues Passwort per E-Mail an ${email} senden`:'Keine E-Mail hinterlegt – Passwort bitte selbst weitergeben');
  }
  function openUserDialog(mode,account){
    state.dialogMode=mode;state.dialogUser=account?account.username:'';state.dialogEmail=account?account.email:'';
    $('user-form').reset();updateStrength();
    $('dialog-title').textContent=mode==='create'?'Benutzer anlegen':'Passwort ändern';
    $('dialog-subtitle').textContent=mode==='create'?'Neuen Zugang zur Analyse-App einrichten.':`Neues Passwort für ${account.name||account.username} festlegen.`;
    document.querySelector('.create-only').hidden=mode!=='create';$('username').required=mode==='create';
    $('password').type='password';$('toggle-password').textContent='Anzeigen';syncSendMail();
    $('user-dialog').showModal();setTimeout(()=>$(mode==='create'?'username':'password').focus(),40);
  }
  $('add-user').addEventListener('click',()=>openUserDialog('create'));
  $('create-email').addEventListener('input',syncSendMail);
  $('password').addEventListener('input',updateStrength);
  $('generate-password').addEventListener('click',()=>{$('password').value=securePassword();$('password').type='text';$('toggle-password').textContent='Verbergen';updateStrength();});
  $('toggle-password').addEventListener('click',()=>{const input=$('password'),visible=input.type==='text';input.type=visible?'password':'text';$('toggle-password').textContent=visible?'Anzeigen':'Verbergen';});
  async function copyText(value,message){if(!value){showToast('Zuerst ein Passwort eingeben oder erzeugen.',true);return;}try{await navigator.clipboard.writeText(value);showToast(message);}catch{showToast('Kopieren nicht möglich, bitte markieren und kopieren.',true);}}
  $('copy-password').addEventListener('click',()=>copyText($('password').value,'Passwort wurde kopiert.'));
  $('user-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('save-user');button.disabled=true;
    try{
      const sendMail=$('send-mail').checked;
      if(state.dialogMode==='create'){
        await api('/admin/api/users',{method:'POST',body:JSON.stringify({username:$('username').value,password:$('password').value,name:$('create-name').value,email:$('create-email').value,language:$('create-language').value,expiresAt:$('create-expiry').value||null,sendMail})});
        $('user-dialog').close();showToast(sendMail?'Benutzer angelegt, Zugangsdaten per E-Mail gesendet.':'Benutzer wurde angelegt.');await load();
      }else{
        await api(`/admin/api/users/${encodeURIComponent(state.dialogUser)}/password`,{method:'PUT',body:JSON.stringify({password:$('password').value,sendMail})});
        $('user-dialog').close();showToast(sendMail?'Passwort geändert und per E-Mail gesendet.':'Passwort wurde geändert.');await load();if(state.drawerUser)await openUser(state.drawerUser);
      }
    }catch(error){showToast(error.message,true);}finally{button.disabled=false;}
  });

  function usernameSuggestion(r){
    const source=(r.email.split('@')[0]||r.name).normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9._-]+/g,'.').replace(/^[._-]+|[._-]+$/g,'');
    return (source.length>=3?source:`user.${source}`).slice(0,32);
  }
  $('request-table').addEventListener('click',async event=>{
    const approve=event.target.closest('[data-approve]');
    if(approve){
      const r=state.requests.find(x=>x.id===approve.dataset.approve);if(!r)return;
      if(!state.mail||!state.mail.configured){showToast('Zuerst den E-Mail-Versand konfigurieren. Es wurde kein Konto angelegt.',true);return;}
      state.approveId=r.id;$('approve-name').textContent=r.name;$('approve-email').textContent=r.email;$('approve-username').value=usernameSuggestion(r);$('approve-password').value=securePassword();$('approve-expiry').value='';
      $('approve-dialog').showModal();setTimeout(()=>$('approve-username').focus(),40);return;
    }
    const reject=event.target.closest('[data-reject]');
    if(reject){
      const r=state.requests.find(x=>x.id===reject.dataset.reject);
      const ok=await confirmAction({title:'Anfrage ablehnen?',copy:`Die Anfrage von ${r?r.name:'diesem Nutzer'} wird als abgelehnt archiviert. Es wird kein Konto angelegt.`,ok:'Ablehnen'});
      if(ok!==false)await mutate(()=>api(`/admin/api/access-requests/${encodeURIComponent(reject.dataset.reject)}/reject`,{method:'POST'}),'Zugangsanfrage wurde abgelehnt.',false);return;
    }
    const notify=event.target.closest('[data-notify]');
    if(notify){notify.disabled=true;await mutate(()=>api(`/admin/api/access-requests/${encodeURIComponent(notify.dataset.notify)}/notify`,{method:'POST',body:JSON.stringify({target:notify.dataset.target})}),'E-Mail wurde erneut gesendet.',false);return;}
    const user=event.target.closest('[data-open-user]');if(user)openUser(user.dataset.openUser);
  });
  $('generate-approve-password').addEventListener('click',()=>{$('approve-password').value=securePassword();});
  $('copy-approve-password').addEventListener('click',()=>copyText($('approve-password').value,'Startpasswort wurde kopiert.'));
  $('approve-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('approve-submit');button.disabled=true;
    try{await api(`/admin/api/access-requests/${encodeURIComponent(state.approveId)}/approve`,{method:'POST',body:JSON.stringify({username:$('approve-username').value,password:$('approve-password').value,expiresAt:$('approve-expiry').value||null})});$('approve-dialog').close();showToast('Zugang wurde angelegt und per E-Mail versendet.');await load();}
    catch(error){showToast(error.message,true);}finally{button.disabled=false;}
  });

  /* ---------- Misc ---------- */
  document.querySelectorAll('[data-request-filter]').forEach(b=>b.addEventListener('click',()=>{state.requestFilter=b.dataset.requestFilter;syncPills('request-filter',state.requestFilter);renderRequests();}));
  document.querySelectorAll('[data-user-filter]').forEach(b=>b.addEventListener('click',()=>{state.userFilter=b.dataset.userFilter;syncPills('user-filter',state.userFilter);renderUsers();}));
  $('user-search').addEventListener('input',renderUsers);$('user-sort').addEventListener('change',renderUsers);
  $('range').addEventListener('change',()=>load());$('refresh').addEventListener('click',()=>load(true));
  function csvCell(value){return `"${String(value??'').replace(/"/g,'""')}"`;}
  $('export-csv').addEventListener('click',()=>{
    if(!state.data)return;
    const rows=[['Benutzer','Name','E-Mail','Status','Befristet bis','Seitenaufrufe','Datei-Auswertungen','Exporte','Aktionen gesamt','Zuletzt aktiv'],...state.data.users.map(u=>[u.username,u.name,u.email,u.status==='active'?'aktiv':u.status==='blocked'?'gesperrt':'abgelaufen',u.expiresAt?dayLabel(u.expiresAt):'',u.pageViews,u.uploads,u.exports,u.totalActions,u.lastSeen||''])];
    const url=URL.createObjectURL(new Blob(['﻿'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download=`Signalerfassung_Admin_${state.data.days}_Tage.csv`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('CSV-Auswertung wurde erstellt.');
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('drawer-layer').hidden&&!document.querySelector('dialog[open]'))closeDrawer();});
  const initial=location.hash.replace('#','');if(['overview','requests','users','feedback','log'].includes(initial))setTab(initial,false);
  load();
})();
