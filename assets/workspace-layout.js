/* Keep controls outside the scrollable data surface and resize charts after layout changes. */
(function(){
  'use strict';
  var app=document.getElementById('app-view'),table=document.getElementById('table-wrap'),chart=document.getElementById('chart-wrap');
  var meta=app.querySelector('.meta-card'),filters=app.querySelector('.ctrl-bar'),signals=app.querySelector('.signal-section');
  var annotationList=document.getElementById('annotation-list'),bar=document.createElement('div'),opened=null,focus=false,savedPanel=null,frame=0;
  function tr(key){return window.AppI18n&&AppI18n.t?AppI18n.t(key):key;}
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function number(value){return window.AppI18n&&AppI18n.fmtNumber?AppI18n.fmtNumber(value):Number(value||0).toLocaleString('de-DE');}
  bar.className='workspace-bar';bar.setAttribute('aria-label',lang()==='en'?'Analysis view and settings':'Analyseansicht und Einstellungen');
  bar.appendChild(app.querySelector('.view-switch'));
  var buttons={},panels={};
  function button(text){var node=document.createElement('button');node.type='button';node.className='workspace-button';node.textContent=text;return node;}
  function positionPanels(){var top=(bar.offsetTop+bar.offsetHeight)+'px';if(app.style.getPropertyValue('--workspace-panel-top')!==top)app.style.setProperty('--workspace-panel-top',top);}
  function resize(){
    positionPanels();if(frame)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(function(){
      frame=0;if(app.style.display!=='flex')return;
      if(S.view==='chart')renderChart();else renderTable(active().filtered||active().rawRows||[]);
      if(window.Annotations)Annotations.sync();
    });
  }
  function setPanel(name,returnFocus){
    opened=name;
    Object.keys(panels).forEach(function(key){panels[key].hidden=key!==name;buttons[key].setAttribute('aria-expanded',String(key===name));});
    if(name!=='signals'&&sigOpen)toggleSignals();
    positionPanels();if(returnFocus)buttons[returnFocus].focus();
  }
  [['signals','capturedSignals',signals],['filters','Filter',filters],['meta','measurementData',meta]].forEach(function(item){
    var key=item[0],trigger=button(item[1]),panel=document.createElement('section');
    trigger.id='workspace-'+key;trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','workspace-panel-'+key);
    panel.id='workspace-panel-'+key;panel.className='workspace-panel';panel.hidden=true;panel.setAttribute('aria-label',item[1]);
    if(key==='filters')panel.classList.add('workspace-panel-filters');
    if(key==='meta')panel.classList.add('workspace-panel-meta');
    var heading=document.createElement('div');heading.className='workspace-panel-heading';var title=document.createElement('span');title.dataset.workspaceTitle=key;title.textContent=item[1];heading.appendChild(title);
    var close=button('Schließen');close.dataset.workspaceClose=key;close.setAttribute('aria-label',item[1]+' schließen');close.onclick=function(){setPanel(null,key);};heading.appendChild(close);
    panel.appendChild(heading);panel.appendChild(item[2]);app.appendChild(panel);bar.appendChild(trigger);buttons[key]=trigger;panels[key]=panel;
    trigger.onclick=function(){if(key==='signals'){toggleSignals();setPanel(sigOpen?'signals':null);}else setPanel(opened===key?null:key);};
  });
  buttons.signals.appendChild(document.getElementById('sig-count'));
  var summary=document.createElement('span');summary.className='workspace-summary';bar.appendChild(summary);
  var focusButton=button('Fokusmodus');focusButton.classList.add('workspace-focus');focusButton.setAttribute('aria-pressed','false');focusButton.title='Messdaten groß anzeigen; mit Escape zur normalen Ansicht zurückkehren';bar.appendChild(focusButton);
  app.insertBefore(bar,app.querySelector('.annotation-tools'));
  var surface=document.createElement('div');surface.className='analysis-surface';surface.id='analysis-surface';
  app.insertBefore(surface,table);surface.appendChild(table);surface.appendChild(chart);
  var sidebar=document.createElement('aside');sidebar.className='annotation-sidebar';sidebar.hidden=annotationList.hidden;sidebar.setAttribute('aria-label','Notizen und Markierungen');
  var sideHead=document.createElement('div');sideHead.className='workspace-panel-heading';var sideTitle=document.createElement('span');sideTitle.textContent='Notizen & Markierungen';sideHead.appendChild(sideTitle);
  var sideClose=button('Schließen');sideClose.setAttribute('aria-label','Notizen schließen');sideClose.onclick=function(){app.querySelector('.annotation-toggle').click();app.querySelector('.annotation-toggle').focus();};sideHead.appendChild(sideClose);
  sidebar.appendChild(sideHead);sidebar.appendChild(annotationList);surface.appendChild(sidebar);
  new MutationObserver(function(){sidebar.hidden=annotationList.hidden;resize();}).observe(annotationList,{attributes:true,attributeFilter:['hidden']});
  new MutationObserver(function(){if(sigOpen)setPanel('signals');else if(opened==='signals')setPanel(null);}).observe(document.getElementById('signal-body'),{attributes:true,attributeFilter:['class']});
  function setFocus(value){
    focus=value;document.body.classList.toggle('analysis-focus',focus);focusButton.setAttribute('aria-pressed',String(focus));focusButton.textContent=focus?(lang()==='en'?'Exit focus mode':'Fokusmodus beenden'):(lang()==='en'?'Focus mode':'Fokusmodus');
    if(focus){savedPanel=opened;setPanel(null);}else if(savedPanel){var previous=savedPanel;savedPanel=null;if(previous==='signals'&&!sigOpen)toggleSignals();setPanel(previous);}
    resize();
  }
  focusButton.onclick=function(){setFocus(!focus);};
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape'||document.querySelector('dialog[open]'))return;
    if(opened){var previous=opened;setPanel(null,previous);}
    else if(!sidebar.hidden)sideClose.click();
    else if(focus){setFocus(false);focusButton.focus();}
  });
  document.addEventListener('click',function(e){if(opened&&!bar.contains(e.target)&&!panels[opened].contains(e.target)&&!e.target.closest('.chart-actions'))setPanel(null);});
  function updateSummary(){
    var A=active(),rows=A.filtered||A.rawRows||[];
    summary.textContent=number(rows.length)+' '+(lang()==='en'?'measurement rows':'Messzeilen')+(A.date?' · '+A.date:'');
    var all=A.rawRows||[],changed=all.length&&(document.getElementById('f-search').value||document.getElementById('f-from').value!==all[0].ts.substring(0,8)||document.getElementById('f-to').value!==all[all.length-1].ts.substring(0,8));
    buttons.filters.classList.toggle('has-filter',!!changed);
    buttons.filters.title=changed?(lang()==='en'?'Filter active - edit':'Filter aktiv – bearbeiten'):(lang()==='en'?'Time range and timestamp search':'Zeitraum und Zeitstempelsuche');
  }
  function syncLabels(){
    var labels={signals:tr('capturedSignals'),filters:lang()==='en'?'Filter':'Filter',meta:lang()==='en'?'Measurement data':'Messdaten'};
    bar.setAttribute('aria-label',lang()==='en'?'Analysis view and settings':'Analyseansicht und Einstellungen');
    Object.keys(buttons).forEach(function(key){buttons[key].firstChild.nodeValue=labels[key];panels[key].setAttribute('aria-label',labels[key]);});
    app.querySelectorAll('[data-workspace-title]').forEach(function(node){node.textContent=labels[node.dataset.workspaceTitle];});
    app.querySelectorAll('[data-workspace-close]').forEach(function(node){var label=labels[node.dataset.workspaceClose];node.textContent=lang()==='en'?'Close':'Schließen';node.setAttribute('aria-label',label+' '+(lang()==='en'?'close':'schließen'));});
    focusButton.textContent=focus?(lang()==='en'?'Exit focus mode':'Fokusmodus beenden'):(lang()==='en'?'Focus mode':'Fokusmodus');
    focusButton.title=lang()==='en'?'Show measurement data large; Escape returns to normal view':'Messdaten groß anzeigen; mit Escape zur normalen Ansicht zurückkehren';
    sidebar.setAttribute('aria-label',lang()==='en'?'Notes and markers':'Notizen und Markierungen');
    sideTitle.textContent=lang()==='en'?'Notes & markers':'Notizen & Markierungen';
    sideClose.textContent=lang()==='en'?'Close':'Schließen';
    sideClose.setAttribute('aria-label',lang()==='en'?'Close notes':'Notizen schließen');
    updateSummary();
  }
  new MutationObserver(updateSummary).observe(document.getElementById('s-shown'),{childList:true,subtree:true,characterData:true});
  filters.addEventListener('input',updateSummary);
  var lastVisible=null;
  new MutationObserver(function(){var visible=app.style.display==='flex';if(lastVisible===visible)return;lastVisible=visible;document.body.classList.toggle('analysis-workspace',visible);if(!visible&&focus){savedPanel=null;setFocus(false);}updateSummary();resize();}).observe(app,{attributes:true,attributeFilter:['style']});
  var lastSize='';
  new ResizeObserver(function(){var size=chart.clientWidth+':'+surface.clientHeight+':'+bar.clientHeight;if(size!==lastSize){lastSize=size;resize();}}).observe(surface);
  new ResizeObserver(positionPanels).observe(bar);
  updateSummary();syncLabels();positionPanels();
  window.WorkspaceLayout={sync:syncLabels};
})();
