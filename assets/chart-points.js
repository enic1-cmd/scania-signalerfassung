/* Sample dots: an on/off button in the chart header. While it is on and the chart is zoomed in far enough, every
   measured value is drawn as a dot, so real samples can be told apart from the connecting line. Off by default;
   the choice is remembered in the browser and also applies to chart images in reports. */
var ChartPoints=(function(){
  'use strict';
  var KEY='signalerfassung.samplePoints';
  var actions=document.querySelector('.chart-actions');
  if(!actions)return null;
  var enabled=(function(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}})();
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  var button=document.createElement('button');
  button.type='button';button.className='chart-action chart-points-toggle';
  button.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16l5-6 5 4 8-8"/><rect x="6.5" y="8.5" width="3" height="3" fill="currentColor"/><rect x="11.5" y="12.5" width="3" height="3" fill="currentColor"/></svg><span></span>';
  var anchor=actions.querySelector('.chart-layout-switch')||actions.firstChild;
  actions.insertBefore(button,anchor);
  function toggle(force){
    enabled=typeof force==='boolean'?force:!enabled;
    try{localStorage.setItem(KEY,enabled?'1':'0');}catch(e){}
    sync();renderChart();
    showToast(enabled?txt('Messpunkte an: Beim Hineinzoomen erscheint jeder Messwert als Punkt.','Sample dots on: every measured value is shown as a dot when zoomed in.'):txt('Messpunkte aus.','Sample dots off.'));
  }
  button.onclick=function(){toggle();};
  function sync(){
    button.querySelector('span').textContent=txt('Messpunkte','Samples');
    button.title=enabled?txt('Messpunkte ausblenden','Hide sample dots'):txt('Messpunkte einblenden: beim Hineinzoomen jeden Messwert als Punkt zeigen','Show sample dots: every measured value as a dot when zoomed in');
    button.setAttribute('aria-pressed',String(enabled));
  }
  sync();
  return {enabled:function(){return enabled;},toggle:toggle,sync:sync};
})();
