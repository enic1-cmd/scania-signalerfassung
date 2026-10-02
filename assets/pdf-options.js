/* "Customize PDF report": choose the chapters before the PDF is created. The choice can be remembered in this
   browser. Without changes the report is complete, exactly as before. The support ZIP always uses the full report. */
var PdfOptions=(function(){
  'use strict';
  var KEY='signalerfassung.pdfSections';
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function labels(){return {
    summary:[txt('Zusammenfassung','Summary'),txt('Kennzahlen, Messung und Inhaltsverzeichnis – immer enthalten','Key figures, recording and contents – always included')],
    chart:[txt('Kurvendiagramm – gesamter Zeitraum','Curve chart – full time range'),txt('Alle Kurven im Diagramm, bei vielen Kurven auf mehrere Seiten verteilt','All curves in the chart, split across pages when there are many')],
    zoom:[txt('Kurvendiagramm – Ausschnitt','Curve chart – zoomed view'),txt('Der zuletzt gezoomte Ausschnitt','The section you last zoomed into')],
    details:[txt('Detailansichten','Detail views'),txt('Nahaufnahme zu jeder eigenen Markierung mit Notiz','Close-up of every own marking with its note')],
    capture:[txt('Erfassungsmarker','Capture markers'),txt('Werte bei jedem Knopfdruck, dazu Detailansichten','Values at every button press plus detail views')],
    pairs:[txt('Soll/Ist-Abweichungen','Setpoint/actual deviations'),txt('Tabelle der Abweichungen aller angezeigten Soll/Ist-Paare','Table of deviations of all shown setpoint/actual pairs')],
    notes:[txt('Notizen & Markierungen','Notes & markers'),txt('Liste aller eigenen Einträge','List of all own entries')],
    stats:[txt('Signalstatistik','Signal statistics'),txt('Min, Max und Mittelwert je Signal','Min, max and mean per signal')],
    overview:[txt('Signalübersicht','Signal overview'),txt('Alle Signale mit Status, Einheit und Signal-ID','All signals with status, unit and signal ID')],
    excerpt:[txt('Messdaten-Auszug','Measurement excerpt'),txt('Messzeilen an Markern und Zeiträumen','Measurement rows at markers and time ranges')]
  };}
  var ORDER=['summary','chart','zoom','details','capture','pairs','notes','stats','overview','excerpt'];
  function stored(){try{var v=JSON.parse(localStorage.getItem(KEY)||'null');return v&&typeof v==='object'?v:null;}catch(e){return null;}}
  var dialog=document.createElement('dialog');dialog.className='pdf-options';dialog.setAttribute('aria-labelledby','pdf-options-title');
  dialog.innerHTML='<form method="dialog"><header><div><h2 id="pdf-options-title"></h2><p></p></div><button type="button" class="pdf-options-close"></button></header><div class="pdf-options-list"></div><div class="pdf-options-bottom"><label class="pdf-options-remember"><input type="checkbox" checked><span></span></label><button type="button" class="pdf-options-all"></button></div><footer><span class="pdf-options-pages"></span><span class="pdf-options-buttons"><button type="button" class="pdf-options-cancel"></button><button type="submit" class="pdf-options-create"></button></span></footer></form>';
  document.body.appendChild(dialog);
  var list=dialog.querySelector('.pdf-options-list'),estimate=null;
  function close(){if(dialog.open)dialog.close();}
  dialog.querySelector('.pdf-options-close').onclick=close;
  dialog.querySelector('.pdf-options-cancel').onclick=close;
  dialog.querySelector('.pdf-options-all').onclick=function(){list.querySelectorAll('input:not(:disabled)').forEach(function(box){box.checked=true;});update();};
  dialog.addEventListener('click',function(e){if(e.target===dialog)close();});
  list.addEventListener('change',update);
  function choice(){var value={};ORDER.forEach(function(key){if(key==='summary')return;var box=list.querySelector('[data-section="'+key+'"]');value[key]=!!box&&!box.disabled&&box.checked;});return value;}
  function update(){
    if(!estimate)return;
    var value=choice(),total=estimate.pages.summary;
    ORDER.forEach(function(key){if(key!=='summary'&&value[key])total+=estimate.pages[key];});
    dialog.querySelector('.pdf-options-pages').innerHTML=txt('ca. ','approx. ')+'<strong>'+total+' '+(total===1?txt('Seite','page'):txt('Seiten','pages'))+'</strong>';
  }
  function scopeFiles(){
    var workspace=captureExportState(active());
    return typeof exportAllFiles==='function'&&exportAllFiles()?workspace.files:[workspace.file];
  }
  function render(){
    var files=scopeFiles(),text=labels(),saved=stored()||{};
    estimate=window.ReportExport&&ReportExport.estimate?ReportExport.estimate(files):{pages:{},available:{}};
    list.innerHTML=ORDER.map(function(key){
      var available=key==='summary'||!!estimate.available[key],checked=key==='summary'||(available&&saved[key]!==false),pages=estimate.pages[key]||0;
      var reason=available?'':' · '+txt('nicht vorhanden','not available');
      return '<label class="pdf-option'+(available?'':' is-unavailable')+(checked?' is-checked':'')+'"><input type="checkbox" data-section="'+key+'"'+(checked?' checked':'')+(key==='summary'||!available?' disabled':'')+'><span class="pdf-option-text"><strong>'+esc(text[key][0])+'</strong><small>'+esc(text[key][1]+reason)+'</small></span><small class="pdf-option-pages">'+(available?'~'+pages+' '+txt('S.','p.'):'')+'</small></label>';
    }).join('');
    list.querySelectorAll('input').forEach(function(box){box.addEventListener('change',function(){box.closest('.pdf-option').classList.toggle('is-checked',box.checked);});});
    update();
  }
  function sync(){
    dialog.querySelector('h2').textContent=txt('PDF-Bericht anpassen','Customize PDF report');
    var files=dialog.open?scopeFiles():[];
    dialog.querySelector('header p').textContent=files.length>1?txt('Welche Kapitel sollen in den Bericht? Gilt für alle '+files.length+' Messungen.','Which chapters should the report contain? Applies to all '+files.length+' recordings.'):txt('Welche Kapitel sollen in den Bericht?','Which chapters should the report contain?');
    var x=dialog.querySelector('.pdf-options-close');x.textContent='×';x.title=txt('Schließen','Close');x.setAttribute('aria-label',x.title);
    dialog.querySelector('.pdf-options-remember span').textContent=txt('Auswahl für die nächsten Berichte merken','Remember this choice for the next reports');
    dialog.querySelector('.pdf-options-all').textContent=txt('Alle wählen','Select all');
    dialog.querySelector('.pdf-options-cancel').textContent=txt('Abbrechen','Cancel');
    dialog.querySelector('.pdf-options-create').textContent=txt('PDF erstellen','Create PDF');
    if(dialog.open)render();
  }
  dialog.querySelector('form').addEventListener('submit',function(e){
    e.preventDefault();
    var value=choice();
    if(dialog.querySelector('.pdf-options-remember input').checked){try{localStorage.setItem(KEY,JSON.stringify(value));}catch(err){}}
    close();
    saveExport('pdf',{sections:value});
  });
  function open(){
    if(!S.files||!S.files.length)return;
    var source=active();if(!source.filtered||!source.filtered.length){alert(window.AppI18n?AppI18n.t('noExportData'):'');return;}
    dialog.showModal();sync();
    var create=dialog.querySelector('.pdf-options-create');if(window.matchMedia&&matchMedia('(hover:hover)').matches)create.focus();
  }
  sync();
  return {open:open,close:close,sync:sync,choice:choice};
})();
