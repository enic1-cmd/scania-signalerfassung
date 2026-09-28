(function(){
  'use strict';
  var stage=document.getElementById('chart-stage');
  if(!stage)return;
  var body=document.createElement('div');body.className='chart-body';
  var viewport=document.createElement('div');viewport.className='chart-viewport';
  var control=document.createElement('div');control.className='chart-height-control';
  control.innerHTML='<label for="chart-height-slider">H&ouml;he</label>'+
    '<output for="chart-height-slider" id="chart-height-value">100 %</output>'+
    '<input id="chart-height-slider" type="range" min="1" max="3" step="0.1" value="1" aria-label="Diagrammh&ouml;he" aria-valuetext="100 Prozent" title="Nach oben ziehen: Signalspuren vergr&ouml;&szlig;ern">'+
    '<button type="button" title="Diagrammh&ouml;he zur&uuml;cksetzen" aria-label="Diagrammh&ouml;he zur&uuml;cksetzen">1&times;</button>';
  stage.before(body);body.append(viewport,control);viewport.append(stage);
  var slider=control.querySelector('input'),output=control.querySelector('output');
  var factor=1,frame=0,lastSize='',pendingScroll=null;
  function layout(){
    var height=Math.round(Math.max(390,viewport.clientHeight)*factor);
    if(stage.style.height!==height+'px')stage.style.height=height+'px';
    if(pendingScroll!==null){viewport.scrollTop=pendingScroll*height;pendingScroll=null;}
  }
  function schedule(){
    if(frame)return;
    frame=requestAnimationFrame(function(){frame=0;if(S.view==='chart')renderChart();});
  }
  function update(reset){
    pendingScroll=reset?0:viewport.scrollTop/Math.max(1,stage.clientHeight);
    factor=Math.max(1,Math.min(3,Number(slider.value)||1));
    var percent=Math.round(factor*100);
    output.textContent=percent+' %';slider.setAttribute('aria-valuetext',percent+' Prozent');
    document.getElementById('chart-tooltip').classList.remove('visible');
    schedule();
  }
  slider.addEventListener('input',function(){update(false);});
  control.querySelector('button').addEventListener('click',function(){slider.value='1';update(true);});
  // Observe only the fixed viewport, not the growing canvas, to avoid resize loops.
  new ResizeObserver(function(){
    var size=viewport.clientWidth+':'+viewport.clientHeight;
    if(size!==lastSize){lastSize=size;schedule();}
  }).observe(viewport);
  window.ChartHeight={layout:layout};
})();
