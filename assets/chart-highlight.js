/* Highlight curves: an on/off button in the chart header. While it is on, hovering a signal name keeps that
   curve strong and fades the others; a click on the name keeps it highlighted until it is clicked again.
   Display only: selection, stars, exports and the project file are not changed. */
var ChartHighlight=(function(){
  'use strict';
  var KEY='signalerfassung.highlight';
  var canvas=document.getElementById('signal-chart'),actions=document.querySelector('.chart-actions');
  if(!canvas||!actions)return null;
  var enabled=(function(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}})(),hover=null;
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  var button=document.createElement('button');
  button.type='button';button.className='chart-action chart-highlight-toggle';button.setAttribute('aria-pressed',String(enabled));
  button.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17c3-7 6-7 9-2s5 4 9-6"/><circle cx="12" cy="15" r="2.6" fill="currentColor"/></svg><span></span>';
  var anchor=actions.querySelector('.chart-layout-switch')||actions.firstChild;
  actions.insertBefore(button,anchor);

  function shown(A){return A&&A.signals?chartSelection(A).signals:[];}
  /* The signal to emphasise right now: hovered name first, otherwise the clicked one. */
  function current(A,signals){
    if(!enabled||!A)return null;
    signals=signals||shown(A);
    if(hover&&signals.indexOf(hover)>=0)return hover;
    return A._highlight&&signals.indexOf(A._highlight)>=0?A._highlight:null;
  }
  function labelSignal(e){
    var layout=chartState.layout;if(!layout||!layout.labelHits||S.view!=='chart')return null;
    var box=canvas.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;
    if(x<0||x>=layout.left)return null;
    if(typeof chartStarAt==='function'&&chartStarAt(e.clientX,e.clientY))return null;
    var hit=layout.labelHits.find(function(item){return item.signal&&x>=item.x0&&x<=item.x1&&y>=item.y0&&y<=item.y1;});
    return hit?hit.signal:null;
  }
  function setHover(signal){if(signal===hover)return;hover=signal;canvas.classList.toggle('chart-highlight-hover',!!signal);renderChart();}
  canvas.addEventListener('mousemove',function(e){if(enabled)setHover(labelSignal(e));});
  canvas.addEventListener('mouseleave',function(){if(enabled&&hover)setHover(null);});
  canvas.addEventListener('click',function(e){
    if(!enabled)return;
    var signal=labelSignal(e),A=active();if(!signal||!A)return;
    A._highlight=A._highlight===signal?null:signal;renderChart();
    var name=signal.displayName||signal.desc||signal.id;
    showToast(A._highlight?txt('Hervorgehoben: ','Highlighted: ')+name+txt(' – nochmal klicken zum Lösen.',' – click again to release.'):txt('Alle Kurven wieder gleich stark.','All curves equally strong again.'));
  });
  function toggle(force){
    enabled=typeof force==='boolean'?force:!enabled;
    try{localStorage.setItem(KEY,enabled?'1':'0');}catch(e){}
    if(!enabled){hover=null;canvas.classList.remove('chart-highlight-hover');(S.files||[]).forEach(function(file){file._highlight=null;});}
    sync();renderChart();
    showToast(enabled?txt('Hervorheben an: Maus über einen Signalnamen links bewegen, Klick hält die Kurve fest.','Highlight on: move the mouse over a signal name on the left, a click keeps the curve highlighted.'):txt('Hervorheben aus.','Highlight off.'));
  }
  button.onclick=function(){toggle();};
  function sync(){
    button.querySelector('span').textContent=txt('Hervorheben','Highlight');
    button.title=enabled?txt('Hervorheben ausschalten','Turn highlight off'):txt('Hervorheben einschalten: eine Kurve betonen, die anderen blass zeigen','Turn highlight on: emphasise one curve and fade the others');
    button.setAttribute('aria-pressed',String(enabled));
  }
  sync();
  return {current:current,toggle:toggle,enabled:function(){return enabled;},sync:sync};
})();
