(function(){
  'use strict';
  var stage=document.getElementById('chart-stage');
  if(!stage)return;
  var MIN_FACTOR=1,MAX_FACTOR=4,STEP=.1;
  var body=document.createElement('div');body.className='chart-body';
  var viewport=document.createElement('div');viewport.className='chart-viewport';
  var control=document.createElement('div');control.className='chart-height-control';
  control.innerHTML='<label for="chart-height-slider">H&ouml;he</label>'+
    '<output for="chart-height-slider" id="chart-height-value">100 %</output>'+
    '<input id="chart-height-slider" type="range" min="'+MIN_FACTOR+'" max="'+MAX_FACTOR+'" step="'+STEP+'" value="1">'+
    '<button type="button">1&times;</button>';
  stage.before(body);body.append(viewport,control);viewport.append(stage);
  var slider=control.querySelector('input'),output=control.querySelector('output'),label=control.querySelector('label'),reset=control.querySelector('button');
  var factor=1,frame=0,lastSize='',pendingScroll=null,minHeight=0;
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  function syncLabels(){
    var percent=Math.round(factor*100);
    label.textContent=txt('Höhe','Height');
    slider.setAttribute('aria-label',txt('Diagrammhöhe','Chart height'));
    slider.setAttribute('aria-valuetext',percent+(lang()==='en'?' percent':' Prozent'));
    slider.title=txt('Ziehen oder Mausrad: Signalspuren vergrößern (Y-Achse)','Drag or mouse wheel: enlarge signal lanes (Y axis)');
    control.title=slider.title;
    reset.title=txt('Diagrammhöhe zurücksetzen','Reset chart height');reset.setAttribute('aria-label',reset.title);
  }
  /* minLanes: height all lanes need to stay readable. 100 % = viewport or that minimum (then the chart scrolls); the slider scales from there. */
  function layout(minLanes){
    if(typeof minLanes==='number')minHeight=minLanes;
    var height=Math.round(Math.max(390,viewport.clientHeight,minHeight||0)*factor);
    if(stage.style.height!==height+'px')stage.style.height=height+'px';
    if(pendingScroll!==null){viewport.scrollTop=pendingScroll*height;pendingScroll=null;}
  }
  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(function(){frame=0;if(S.view==='chart')renderChart();});
  }
  function update(resetScroll){
    pendingScroll=resetScroll?0:viewport.scrollTop/Math.max(1,stage.clientHeight);
    factor=Math.max(MIN_FACTOR,Math.min(MAX_FACTOR,Number(slider.value)||1));
    output.textContent=Math.round(factor*100)+' %';syncLabels();
    document.getElementById('chart-tooltip').classList.remove('visible');
    schedule();
  }
  function setFactor(value){
    value=Math.round(Math.max(MIN_FACTOR,Math.min(MAX_FACTOR,value))*10)/10;
    if(value===factor)return false;
    slider.value=String(value);update(false);return true;
  }
  function nudge(direction){return setFactor(factor+direction*STEP*(factor>=2?2:1));}
  slider.addEventListener('input',function(){update(false);});
  reset.addEventListener('click',function(){slider.value='1';update(true);});
  // Mouse wheel over the height control changes the lane height (Y axis).
  control.addEventListener('wheel',function(e){
    if(!e.deltaY)return;
    e.preventDefault();nudge(e.deltaY<0?1:-1);
  },{passive:false});
  // Observe only the fixed viewport, not the growing canvas, to avoid resize loops.
  new ResizeObserver(function(){
    var size=viewport.clientWidth+':'+viewport.clientHeight;
    if(size!==lastSize){lastSize=size;schedule();}
  }).observe(viewport);
  syncLabels();
  window.ChartHeight={layout:layout,nudge:nudge,setFactor:setFactor,factor:function(){return factor;},sync:syncLabels};
})();
