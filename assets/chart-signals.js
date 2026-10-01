/* Chart signal picker: choose the curves (stars), overlay selected curves in one lane and choose a shared scale. */
var ChartSignals=(function(){
  'use strict';
  var button=document.querySelector('.chart-action[onclick="selectChartSignals()"]');
  var card=document.querySelector('.chart-card');
  if(!button||!card)return null;
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  function icon(path){return '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';}
  var ICON_SEPARATE=icon('<path d="M4 6h16M4 12h16M4 18h16"/>');
  var ICON_OVERLAY=icon('<path d="M3 16c3-6 5-6 8-2s5 4 10-6"/><path d="M3 10c4 0 5 6 9 6s5-8 9-8"/>');
  var layoutSwitch=document.createElement('div');layoutSwitch.className='chart-layout-switch';layoutSwitch.setAttribute('role','group');
  layoutSwitch.innerHTML='<button type="button" data-layout="separate" aria-pressed="true">'+ICON_SEPARATE+'<span></span></button>'+
    '<button type="button" data-layout="overlay" aria-pressed="false">'+ICON_OVERLAY+'<span></span></button>';
  button.parentElement.insertBefore(layoutSwitch,button);
  var panel=document.createElement('section');panel.className='chart-signal-panel';panel.id='chart-signal-panel';panel.hidden=true;
  panel.innerHTML='<div class="chart-signal-head"><strong></strong><button type="button" class="chart-signal-close"></button></div>'+
    '<p class="chart-signal-info"></p>'+
    '<div class="chart-signal-actions"><button type="button" data-action="auto"></button><button type="button" data-action="overlay-all"></button><button type="button" data-action="separate-all"></button></div>'+
    '<label class="chart-signal-shared"><input type="checkbox"><span></span></label>'+
    '<input type="search" class="chart-signal-search">'+
    '<div class="chart-signal-list" role="list"></div>';
  card.appendChild(panel);
  button.setAttribute('aria-haspopup','true');button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','false');
  var listEl=panel.querySelector('.chart-signal-list'),search=panel.querySelector('.chart-signal-search'),shared=panel.querySelector('.chart-signal-shared input');

  function file(){return active();}
  function selection(){return chartSelection(file());}
  function changed(starsChanged){
    markDirty(file());
    if(starsChanged)refreshColumns();else renderChart();
    sync();
  }
  /* A tick shows the curve; unticking hides it from the chart only (table and stars stay untouched). */
  function toggleSignal(signal,checked){
    signal.chartHidden=!checked;
    if(!checked)signal.overlay=false;
    changed(false);
  }
  function setOverlay(signals,value){signals.forEach(function(signal){signal.overlay=!!value;});}
  function setLayout(kind){
    var sel=selection();if(!sel.signals.length)return;
    if(kind==='overlay'){
      if(sel.signals.length<2){showToast(txt('Zum Überlagern mindestens zwei Kurven auswählen.','Select at least two curves to overlay.'));return;}
      setOverlay(file().signals,false);setOverlay(sel.signals,true);
    }else setOverlay(file().signals,false);
    changed(false);
  }
  layoutSwitch.querySelectorAll('[data-layout]').forEach(function(b){b.onclick=function(){setLayout(b.dataset.layout);};});
  panel.querySelector('[data-action="auto"]').onclick=function(){file().signals.forEach(function(signal){signal.chartHidden=false;});changed(false);};
  panel.querySelector('[data-action="overlay-all"]').onclick=function(){setLayout('overlay');};
  panel.querySelector('[data-action="separate-all"]').onclick=function(){setLayout('separate');};
  panel.querySelector('.chart-signal-close').onclick=function(){close(true);};
  shared.onchange=function(){file().chartSharedScale=shared.checked;changed(false);};
  search.oninput=function(){renderList();};

  function renderList(){
    var A=file(),sel=selection(),inChart=new Map(sel.signals.map(function(signal,index){return [signal,index];}));
    var term=search.value.trim().toLocaleLowerCase(lang()==='en'?'en-US':'de-DE');
    listEl.replaceChildren();
    sel.candidates.forEach(function(signal){
      var name=signal.displayName||signal.desc||signal.id;
      if(term&&!(name+' '+(signal.unit||'')+' '+(signal.id||'')).toLocaleLowerCase().includes(term))return;
      var index=inChart.has(signal)?inChart.get(signal):-1;
      var row=document.createElement('div');row.className='chart-signal-row'+(index>=0?' is-active':'');row.setAttribute('role','listitem');
      var label=document.createElement('label');
      var box=document.createElement('input');box.type='checkbox';box.checked=index>=0;box.onchange=function(){toggleSignal(signal,box.checked);};
      var dot=document.createElement('span');dot.className='chart-signal-dot';dot.style.background=index>=0?chartColor(index):'transparent';
      var text=document.createElement('span');text.className='chart-signal-name';text.textContent=name;text.title=name;
      var unit=document.createElement('small');unit.textContent=signal.unit||'';
      label.append(box,dot,text,unit);row.appendChild(label);
      var overlay=document.createElement('button');overlay.type='button';overlay.className='chart-signal-overlay';
      overlay.innerHTML=ICON_OVERLAY;overlay.disabled=index<0;overlay.setAttribute('aria-pressed',String(!!signal.overlay&&index>=0));
      overlay.title=txt('In gemeinsamer Spur überlagern','Overlay in a shared lane');overlay.setAttribute('aria-label',overlay.title+': '+name);
      overlay.onclick=function(){signal.overlay=!signal.overlay;changed(false);if(signal.overlay&&selection().signals.filter(function(s){return s.overlay;}).length<2)showToast(txt('Noch eine zweite Kurve zum Überlagern wählen.','Choose a second curve to overlay.'));};
      row.appendChild(overlay);listEl.appendChild(row);
    });
    if(!listEl.children.length){var empty=document.createElement('p');empty.className='chart-signal-empty';empty.textContent=txt('Keine passenden numerischen Signale.','No matching numeric signals.');listEl.appendChild(empty);}
  }
  function sync(){
    var A=file();
    var labels=[['separate',txt('Getrennt','Separate'),txt('Jede Kurve in eigener Spur','Each curve in its own lane')],['overlay',txt('Übereinander','Overlaid'),txt('Ausgewählte Kurven in einer Spur übereinanderlegen','Overlay the selected curves in one lane')]];
    layoutSwitch.setAttribute('aria-label',txt('Kurvenanordnung','Curve layout'));
    labels.forEach(function(item){var b=layoutSwitch.querySelector('[data-layout="'+item[0]+'"]');b.querySelector('span').textContent=item[1];b.title=item[2];});
    panel.setAttribute('aria-label',txt('Signale im Diagramm','Signals in chart'));
    panel.querySelector('.chart-signal-head strong').textContent=txt('Signale im Diagramm','Signals in chart');
    panel.querySelector('.chart-signal-close').textContent=txt('Schließen','Close');
    panel.querySelector('[data-action="auto"]').textContent=txt('Alle zeigen','Show all');
    panel.querySelector('[data-action="auto"]').title=txt('Alle sichtbaren numerischen Signale wieder anzeigen','Show all visible numeric signals again');
    panel.querySelector('[data-action="overlay-all"]').textContent=txt('Alle überlagern','Overlay all');
    panel.querySelector('[data-action="separate-all"]').textContent=txt('Alle getrennt','All separate');
    panel.querySelector('.chart-signal-shared span').textContent=txt('Gemeinsame Skala für überlagerte Kurven','Shared scale for overlaid curves');
    search.placeholder=txt('Signal suchen …','Search signal ...');search.setAttribute('aria-label',search.placeholder);
    button.textContent=window.AppI18n?AppI18n.t('chartChoose'):txt('Signale auswählen','Choose signals');
    if(!A||!A.signals)return;
    var sel=selection(),overlayCount=sel.signals.filter(function(s){return s.overlay;}).length;
    var mode=overlayCount===0?'separate':(overlayCount===sel.signals.length&&overlayCount>=2?'overlay':'');
    layoutSwitch.querySelectorAll('[data-layout]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.layout===mode));b.disabled=!sel.signals.length;});
    shared.checked=!!A.chartSharedScale;
    panel.querySelector('.chart-signal-info').textContent=(sel.explicit
      ?txt(sel.signals.length+' von '+sel.candidates.length+' numerischen Signalen im Diagramm.',sel.signals.length+' of '+sel.candidates.length+' numeric signals in the chart.')
      :txt('Alle '+sel.signals.length+' sichtbaren numerischen Signale im Diagramm. Haken entfernen blendet eine Kurve aus.','All '+sel.signals.length+' visible numeric signals in the chart. Untick to hide a curve.'))+' '+txt('Der Stern an jeder Spur hebt ein Signal hervor.','The star on each lane highlights a signal.');
    if(!panel.hidden)renderList();
  }
  function open(){var head=card.querySelector('.chart-head');panel.style.top=((head?head.offsetHeight:52)+6)+'px';panel.hidden=false;button.setAttribute('aria-expanded','true');sync();requestAnimationFrame(function(){var first=listEl.querySelector('input');(first||search).focus();});}
  function close(focusButton){if(panel.hidden)return;panel.hidden=true;button.setAttribute('aria-expanded','false');if(focusButton)button.focus();}
  function toggle(){if(panel.hidden)open();else close(false);}
  document.addEventListener('click',function(e){if(!panel.hidden&&!panel.contains(e.target)&&e.target!==button&&!button.contains(e.target))close(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!panel.hidden){e.stopPropagation();close(true);}},true);
  sync();
  return {toggle:toggle,open:open,close:close,sync:sync};
})();
