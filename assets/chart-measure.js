/* Measure tool: two cursors A and B in the chart. Shows Δt and, for every curve, the value at A, at B and the
   difference. Cursors snap to measurement rows (stable row IDs) and can be dragged. "Save as note" stores the
   measurement as a marked time range with a note, so it also appears in PDF and Excel. Screen only otherwise. */
var ChartMeasure=(function(){
  'use strict';
  var COLORS={a:'#07579c',b:'#0a8f6a'},HIT_PX=9,MAX_NOTE_SIGNALS=20;
  var canvas=document.getElementById('signal-chart'),stage=document.getElementById('chart-stage');
  if(!canvas||!stage)return null;
  var drag=null,frame=0,panelOffset=null;
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  function loc(){return typeof locale==='function'?locale():'de-DE';}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function fmt(value){return value==null||!isFinite(value)?'–':Number(value).toLocaleString(loc(),{maximumFractionDigits:Math.abs(value)<10?3:2});}
  function signed(value){return value==null||!isFinite(value)?'–':(value>0?'+':'')+fmt(value);}
  function seconds(value){return Number(value).toLocaleString(loc(),{minimumFractionDigits:1,maximumFractionDigits:Math.abs(value)<10?3:1})+' s';}
  function state(file){file=file||active();return file?(file._measure||(file._measure={a:null,b:null})):{a:null,b:null};}
  function rowOf(file,id){return id==null||!file||!file.rawRows?null:file.rawRows[id]||null;}

  /* ---------- Panel ---------- */
  var panel=document.createElement('section');panel.className='measure-panel';panel.hidden=true;
  panel.innerHTML='<header class="measure-head"><strong></strong><button type="button" class="measure-close"></button></header><p class="measure-meta"></p><div class="measure-table-wrap"><table class="measure-table"><thead></thead><tbody></tbody></table></div><footer class="measure-actions"><button type="button" class="measure-save"></button><button type="button" class="measure-clear"></button></footer>';
  stage.appendChild(panel);
  panel.querySelector('.measure-close').onclick=function(){clear();};
  panel.querySelector('.measure-clear').onclick=function(){clear();};
  panel.querySelector('.measure-save').onclick=function(){saveAsNote();};
  /* The panel can be moved by its title bar, so it never has to cover the interesting part of a curve. */
  (function(){
    var head=panel.querySelector('.measure-head'),move=null;
    head.addEventListener('pointerdown',function(e){
      if(e.button!==0||e.target.closest('button'))return;
      var box=panel.getBoundingClientRect(),host=stage.getBoundingClientRect();
      move={x:e.clientX,y:e.clientY,left:box.left-host.left,top:box.top-host.top,id:e.pointerId};head.setPointerCapture(e.pointerId);e.preventDefault();
    });
    head.addEventListener('pointermove',function(e){
      if(!move||e.pointerId!==move.id)return;
      var host=stage.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight;
      panelOffset={left:Math.max(4,Math.min(host.width-w-4,move.left+e.clientX-move.x)),top:Math.max(4,Math.min(Math.max(4,host.height-h-4),move.top+e.clientY-move.y))};
      placePanel();
    });
    function end(e){if(move&&e.pointerId===move.id){move=null;}}
    head.addEventListener('pointerup',end);head.addEventListener('pointercancel',end);
  })();
  function placePanel(){
    if(panelOffset){panel.style.left=panelOffset.left+'px';panel.style.top=panelOffset.top+'px';panel.style.right='auto';}
    else{panel.style.left='';panel.style.top='';panel.style.right='';}
  }
  function signalsOf(file){return file&&file.signals?chartSelection(file).signals:[];}
  function measurement(file){
    var st=state(file),a=rowOf(file,st.a),b=rowOf(file,st.b);
    if(!a)return null;
    var list=signalsOf(file).map(function(signal){
      var va=numericAt(a,signal.index),vb=b?numericAt(b,signal.index):null;
      return {signal:signal,a:va,b:vb,d:va!=null&&vb!=null?vb-va:null};
    });
    return {a:a,b:b,dt:b?(b.elapsedSec||0)-(a.elapsedSec||0):null,list:list};
  }
  function updatePanel(){
    var file=active(),m=file&&file.rawRows?measurement(file):null,measuring=window.Annotations&&Annotations.mode()==='measure';
    panel.hidden=!m;
    if(!m)return;
    placePanel();
    panel.querySelector('.measure-head strong').textContent=txt('Messung A → B','Measurement A → B');
    var close=panel.querySelector('.measure-close');close.textContent='×';close.title=txt('Messung entfernen (Esc)','Remove measurement (Esc)');close.setAttribute('aria-label',close.title);
    var meta='<span class="measure-dot" style="background:'+COLORS.a+'">A</span> '+esc(m.a.ts);
    if(m.b)meta+=' · <span class="measure-dot" style="background:'+COLORS.b+'">B</span> '+esc(m.b.ts)+' · <strong>Δt '+esc(seconds(m.dt))+'</strong>';
    else meta+=' · <em>'+esc(measuring?txt('Jetzt Punkt B anklicken.','Now click point B.'):txt('Werkzeug „Messen“ wählen und Punkt B anklicken.','Choose the "Measure" tool and click point B.'))+'</em>';
    panel.querySelector('.measure-meta').innerHTML=meta;
    panel.querySelector('thead').innerHTML='<tr><th>'+esc(txt('Signal','Signal'))+'</th><th class="num" style="color:'+COLORS.a+'">A</th><th class="num" style="color:'+COLORS.b+'">B</th><th class="num">Δ</th><th></th></tr>';
    panel.querySelector('tbody').innerHTML=m.list.length?m.list.map(function(item){
      var name=item.signal.displayName||item.signal.desc||item.signal.id,cls=item.d>0?'up':item.d<0?'down':'';
      return '<tr><td title="'+esc(name)+'">'+esc(name)+'</td><td class="num">'+esc(fmt(item.a))+'</td><td class="num">'+esc(m.b?fmt(item.b):'–')+'</td><td class="num delta '+cls+'">'+esc(m.b?signed(item.d):'–')+'</td><td class="unit">'+esc(item.signal.unit||'')+'</td></tr>';
    }).join(''):'<tr><td colspan="5">'+esc(txt('Keine Kurven im Diagramm.','No curves in the chart.'))+'</td></tr>';
    var save=panel.querySelector('.measure-save');save.textContent=txt('Als Notiz übernehmen','Save as note');
    save.disabled=!m.b||m.a===m.b;save.title=txt('Bereich A–B als markierten Zeitraum mit allen Werten als Notiz speichern (erscheint auch in PDF und Excel)','Save A–B as a marked time range with all values as a note (also appears in PDF and Excel)');
    var remove=panel.querySelector('.measure-clear');remove.textContent=txt('Entfernen','Remove');remove.title=close.title;
  }

  /* ---------- Chart layer (called from drawChartCanvas, screen only) ---------- */
  function draw(ctx,file,rows,left,top,plotW,plotH,windowData,scale){
    var st=state(file),span=windowData.timeEnd-windowData.timeStart;
    function x(row){
      if(span>0&&isFinite(row.elapsedSec))return left+(row.elapsedSec-windowData.timeStart)/span*plotW;
      var index=rows.indexOf(row);return index<0?null:left+(rows.length<=1?0:index/(rows.length-1))*plotW;
    }
    var a=rowOf(file,st.a),b=rowOf(file,st.b),xa=a?x(a):null,xb=b?x(b):null;
    function inside(value){return value!=null&&value>=left-.5&&value<=left+plotW+.5;}
    ctx.save();
    if(xa!=null&&xb!=null){
      var from=Math.max(left,Math.min(xa,xb)),to=Math.min(left+plotW,Math.max(xa,xb));
      if(to>from){ctx.fillStyle='rgba(7,87,156,.07)';ctx.fillRect(from,top,to-from,plotH);}
      if(inside(xa)&&inside(xb)&&Math.abs(xb-xa)>70*scale){
        var mid=(xa+xb)/2,label='Δt '+seconds((b.elapsedSec||0)-(a.elapsedSec||0)),y=top+plotH-14*scale;
        ctx.font='800 '+(11*scale)+'px Segoe UI, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
        var w=ctx.measureText(label).width+14*scale;
        ctx.strokeStyle='#07579c';ctx.lineWidth=1.2*scale;ctx.beginPath();ctx.moveTo(Math.min(xa,xb)+3*scale,y);ctx.lineTo(Math.max(xa,xb)-3*scale,y);ctx.stroke();
        ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(mid-w/2,y-8*scale,w,16*scale);
        ctx.fillStyle='#07579c';ctx.fillText(label,mid,y);
      }
    }
    [['a',a,xa],['b',b,xb]].forEach(function(item){
      if(!item[1]||!inside(item[2]))return;
      var color=COLORS[item[0]],cx=item[2],size=18*scale,y0=top+22*scale;
      ctx.strokeStyle=color;ctx.lineWidth=2*scale;ctx.beginPath();ctx.moveTo(cx,top);ctx.lineTo(cx,top+plotH);ctx.stroke();
      ctx.fillStyle=color;
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(cx-size/2,y0,size,size,4*scale);else ctx.rect(cx-size/2,y0,size,size);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='800 '+(11*scale)+'px Segoe UI, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(item[0].toUpperCase(),cx,y0+size/2+.5);
    });
    ctx.restore();
    updatePanel();
  }

  /* ---------- Pointer handling (called by Annotations in measure mode) ---------- */
  function plot(){var box=canvas.getBoundingClientRect(),g=chartGeometry(box.width,box.height);return {box:box,left:g.left,right:g.right,top:g.top,bottom:g.bottom,width:Math.max(1,box.width-g.left-g.right)};}
  function rowAt(e,clamp){
    var p=plot(),x=e.clientX-p.box.left,y=e.clientY-p.box.top;
    if(!clamp&&(x<p.left||x>p.box.width-p.right||y<p.top||y>p.box.height-p.bottom))return null;
    return chartRowAtRatio(active().filtered||active().rawRows||[],Math.max(0,Math.min(1,(x-p.left)/p.width)));
  }
  function cursorNear(e){
    var file=active(),st=state(file),p=plot(),layout=chartState.layout,best=null,bestDistance=HIT_PX;
    if(!layout||!layout.windowData)return null;
    var wd=layout.windowData,span=wd.timeEnd-wd.timeStart;if(!(span>0))return null;
    ['a','b'].forEach(function(key){
      var row=rowOf(file,st[key]);if(!row)return;
      var distance=Math.abs(p.left+(row.elapsedSec-wd.timeStart)/span*p.width-(e.clientX-p.box.left));
      if(distance<=bestDistance){best=key;bestDistance=distance;}
    });
    return best;
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(function(){frame=0;renderChart();});}
  function pointerDown(e){
    var file=active();if(!file||!file.rawRows)return false;
    var st=state(file),key=cursorNear(e);
    if(!key){
      var row=rowAt(e,false);if(!row)return false;
      if(st.a==null)key='a';else if(st.b==null)key='b';else{st.b=null;key='a';}
      st[key]=row.rowId;
    }
    drag={key:key,pointerId:e.pointerId,file:file};
    canvas.setPointerCapture(e.pointerId);schedule();
    return true;
  }
  canvas.addEventListener('pointermove',function(e){
    if(!drag||e.pointerId!==drag.pointerId)return;
    if(drag.file!==active()){drag=null;return;}
    var row=rowAt(e,true);if(row&&state(drag.file)[drag.key]!==row.rowId){state(drag.file)[drag.key]=row.rowId;schedule();}
  });
  function endDrag(e){if(drag&&e.pointerId===drag.pointerId){drag=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}}
  canvas.addEventListener('pointerup',endDrag);canvas.addEventListener('pointercancel',endDrag);

  function clear(file){
    file=file||active();if(!file)return;
    var st=state(file),had=st.a!=null||st.b!=null;st.a=null;st.b=null;drag=null;
    if(had){renderChart();}
    updatePanel();
  }
  function active_(){return active();}
  function noteText(m){
    var lines=[txt('Messung A → B','Measurement A → B')+': '+m.a.ts+' → '+m.b.ts+' · Δt '+seconds(m.dt)];
    m.list.slice(0,MAX_NOTE_SIGNALS).forEach(function(item){
      var name=item.signal.displayName||item.signal.desc||item.signal.id,unit=item.signal.unit?' '+item.signal.unit:'';
      lines.push(name+': '+fmt(item.a)+' → '+fmt(item.b)+unit+' ('+signed(item.d)+')');
    });
    if(m.list.length>MAX_NOTE_SIGNALS)lines.push(txt('… weitere ','… another ')+(m.list.length-MAX_NOTE_SIGNALS)+txt(' Kurven',' curves'));
    return lines.join('\n').slice(0,4000);
  }
  function saveAsNote(){
    var file=active_(),m=file?measurement(file):null;
    if(!m||!m.b||m.a===m.b||!window.Annotations||!Annotations.addRange)return;
    var range=Annotations.addRange(Math.min(m.a.rowId,m.b.rowId),Math.max(m.a.rowId,m.b.rowId),noteText(m));
    var entry=Annotations.entries(file).find(function(item){return item.id===range.id;});
    clear(file);
    showToast(txt('Messung als Zeitraum ','Measurement saved as time range ')+(entry?entry.letter:'')+txt(' mit Notiz gespeichert.',' with a note.'));
  }
  function sync(){updatePanel();}
  return {draw:draw,pointerDown:pointerDown,clear:clear,sync:sync,measurement:function(){var f=active();return f&&f.rawRows?measurement(f):null;},noteText:function(){var f=active(),m=f?measurement(f):null;return m&&m.b?noteText(m):'';}};
})();
