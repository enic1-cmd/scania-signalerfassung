/* SWS notice: SWS recordings store one row per second and read the chosen signals one after another, so every
   signal gets a new value less often the more signals were chosen. For SWS files an info button in the workspace
   bar explains this and shows how often the signals of the loaded file really changed. */
var SwsNotice=(function(){
  'use strict';
  var bar=document.querySelector('.workspace-bar'),app=document.getElementById('app-view');
  if(!bar||!app)return null;
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  function loc(){return lang()==='en'?'en-GB':'de-DE';}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

  /* Typical time between new values: per signal the median of the gaps between value changes, leaving out long
     constant phases (gaps above twice the lower quartile), then the median over all signals. */
  function refreshOf(file){
    if(!file||!file.rawRows)return null;
    if(file._swsRefresh!==undefined)return file._swsRefresh;
    var rows=file.rawRows,marker=markerSignal(file),per=[];
    (file.signals||[]).forEach(function(s){
      if(s===marker||!s.chartNumeric)return;
      var last=null,lastTime=null,gaps=[];
      rows.forEach(function(row){var v=numericAt(row,s.index);if(v===null)return;if(last!==null&&v!==last)gaps.push(row.elapsedSec-lastTime);if(v!==last){last=v;lastTime=row.elapsedSec;}});
      if(gaps.length<5)return;
      gaps.sort(function(a,b){return a-b;});
      var quartile=gaps[Math.floor(gaps.length/4)],usual=gaps.filter(function(g){return g<=quartile*2;});
      per.push(usual[Math.floor(usual.length/2)]);
    });
    per.sort(function(a,b){return a-b;});
    file._swsRefresh=per.length?per[Math.floor(per.length/2)]:null;
    return file._swsRefresh;
  }
  function signalCount(file){var marker=markerSignal(file);return (file.signals||[]).filter(function(s){return s!==marker;}).length;}
  function seconds(value){var v=Math.max(.5,Math.round(value*2)/2);return v.toLocaleString(loc(),{maximumFractionDigits:1})+' s';}

  var button=document.createElement('button');
  button.type='button';button.className='workspace-button sws-notice-button';button.hidden=true;
  button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','sws-notice-panel');
  button.innerHTML='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg><span></span>';
  var summary=bar.querySelector('.workspace-summary');
  bar.insertBefore(button,summary||null);
  var panel=document.createElement('section');panel.className='workspace-panel sws-notice-panel';panel.id='sws-notice-panel';panel.hidden=true;
  app.appendChild(panel);
  function close(){panel.hidden=true;button.setAttribute('aria-expanded','false');}
  button.onclick=function(){panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)render();};
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden){close();button.focus();}});
  document.addEventListener('click',function(e){if(!panel.hidden&&!panel.contains(e.target)&&!button.contains(e.target))close();});

  function render(){
    var file=active(),refresh=refreshOf(file),count=signalCount(file),pointsOn=!!(window.ChartPoints&&ChartPoints.enabled());
    var measured=refresh?txt('In dieser Datei: <strong>'+count+' Signale</strong> – neuer Wert je Signal ca. <strong>alle '+seconds(refresh)+'</strong>.','In this file: <strong>'+count+' signals</strong> – new value per signal about <strong>every '+seconds(refresh)+'</strong>.'):txt('In dieser Datei: <strong>'+count+' Signale</strong>.','In this file: <strong>'+count+' signals</strong>.');
    panel.innerHTML='<div class="workspace-panel-heading"><span>'+esc(txt('Hinweis zu SWS-Dateien','Note on SWS files'))+'</span><button type="button" class="workspace-button sws-notice-close">'+esc(txt('Schließen','Close'))+'</button></div>'+
      '<div class="sws-notice-body">'+
      '<p>'+txt('Diese Datei stammt aus dem SWS-Signallogger. SWS speichert eine Zeile pro Sekunde und liest die gewählten Signale nacheinander. <strong>Je mehr Signale ausgewählt sind, desto seltener kommt pro Signal ein neuer Wert</strong> und desto schwieriger wird die Auswertung.','This file comes from the SWS signal logger. SWS stores one row per second and reads the chosen signals one after another. <strong>The more signals are chosen, the less often each signal gets a new value</strong> and the harder the evaluation becomes.')+'</p>'+
      '<p class="sws-notice-measured">'+measured+'</p>'+
      '<p>'+txt('Kurze Vorgänge wie Schaltvorgänge, Druck- oder Spannungseinbrüche können dadurch in der Aufzeichnung fehlen. Tipp: Für schnelle Vorgänge nur wenige Signale aufzeichnen (ca. 6 Signale ≈ 1 s).','Short events such as gear shifts, pressure or voltage drops can therefore be missing from the recording. Tip: record only a few signals for fast events (about 6 signals ≈ 1 s).')+'</p>'+
      '<p>'+txt('Mit <strong>Messpunkte</strong> im Kurvendiagramm siehst du, in welchem Sekundenabstand wirklich neue Werte angekommen sind.','With <strong>Samples</strong> in the curve chart you can see at which intervals new values really arrived.')+'</p>'+
      '<button type="button" class="sws-notice-points"'+(pointsOn?' disabled':'')+'>'+esc(pointsOn?txt('Messpunkte sind eingeschaltet','Samples are switched on'):txt('Messpunkte einschalten','Switch samples on'))+'</button>'+
      '<p class="sws-notice-future">'+esc(txt('Sobald Scania die Abtastrate in SWS einstellbar macht, wird das Tool entsprechend weiterentwickelt.','As soon as Scania makes the sample rate adjustable in SWS, the tool will be developed further accordingly.'))+'</p>'+
      '</div>';
    panel.setAttribute('aria-label',txt('Hinweis zu SWS-Dateien','Note on SWS files'));
    panel.querySelector('.sws-notice-close').onclick=function(){close();button.focus();};
    panel.querySelector('.sws-notice-points').onclick=function(){
      if(window.ChartPoints&&!ChartPoints.enabled())ChartPoints.toggle(true);
      if(S.view!=='chart')setAnalysisView('chart',true);
      close();
    };
  }
  function sync(){
    var file=typeof active==='function'?active():null,isSws=!!(file&&file.rawRows&&file.sourceFormat==='SWS');
    button.hidden=!isSws;
    button.querySelector('span').textContent=txt('SWS-Hinweis','SWS note');
    var refresh=isSws?refreshOf(file):null;
    button.title=isSws?txt('SWS-Datei: Werte je Signal ca. alle '+(refresh?seconds(refresh):'1 s')+' – mehr erfahren','SWS file: values per signal about every '+(refresh?seconds(refresh):'1 s')+' – learn more'):'';
    button.classList.toggle('is-slow',!!(refresh&&refresh>1.5));
    if(!isSws)close();else if(!panel.hidden)render();
  }
  new MutationObserver(sync).observe(document.getElementById('s-shown'),{childList:true,subtree:true,characterData:true});
  sync();
  return {sync:sync,refresh:refreshOf};
})();
