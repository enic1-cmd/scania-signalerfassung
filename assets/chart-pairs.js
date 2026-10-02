/* Set/actual pairs: finds signals such as "Requested fuel pressure" ↔ "Fuel pressure" or "Angeforderter Gang" ↔
   "Eingelegter Gang" by name (same ECU, same unit). An active pair gets its own chart lane with a shared scale;
   red bands mark where setpoint and actual value differ by more than the tolerance for at least the minimum
   duration. The deviation list jumps to each spot. Active pairs are saved in the project and used in the reports. */
var ChartPairs=(function(){
  'use strict';
  var DEFAULT_DURATION=0.5;
  var SET_WORDS=['requested','request','desired','target','setpoint','demanded','demand','commanded','wanted',
    'angefordert','angeforderte','angeforderter','angefordertes','angeforderten','soll','sollwert','gewünscht','gewünschte','gewünschter','gewünschtes','vorgabe'];
  var ACT_WORDS=['actual','current','measured','engaged','real','present',
    'ist','istwert','aktuell','aktuelle','aktueller','aktuelles','eingelegt','eingelegte','eingelegter','eingelegtes','gemessen','gemessene','gemessener','gemessenes','tatsächlich','tatsächliche','tatsächlicher'];
  var FILLER=['value','wert','signal','the','der','die','das'];
  var cache=new Map(),panelSignature='',openLists=new Set();
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  function loc(){return typeof locale==='function'?locale():'de-DE';}
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function num(value,digits){return value==null||!isFinite(value)?'–':Number(value).toLocaleString(loc(),{maximumFractionDigits:digits==null?3:digits});}
  function key(signal){return signal.id+'::'+signal.index;}
  function nameOf(signal){return signal.displayName||signal.desc||signal.id||'';}
  function deviceOf(signal){var m=nameOf(signal).match(/^([A-Za-z0-9]{2,8})\s*-\s+/)||String(signal.id||'').match(/^([A-Za-z0-9]{2,8})-/);return m?m[1].toUpperCase():'';}
  function words(signal){
    var name=nameOf(signal).replace(/^([A-Za-z0-9]{2,8})\s*-\s+/,'');
    /* CamelCase IDs (TMS-RequestedGear) are split into words as well */
    name=name.replace(/([a-zäöü])([A-ZÄÖÜ])/g,'$1 $2');
    return name.toLocaleLowerCase('de-DE').split(/[^a-zäöüß0-9]+/).filter(Boolean);
  }
  function analyse(signal){
    var list=words(signal),isSet=list.some(function(w){return SET_WORDS.indexOf(w)>=0;});
    var base=list.filter(function(w){return SET_WORDS.indexOf(w)<0&&ACT_WORDS.indexOf(w)<0&&FILLER.indexOf(w)<0;}).join(' ');
    return {isSet:isSet,isAct:list.some(function(w){return ACT_WORDS.indexOf(w)>=0;}),base:base,device:deviceOf(signal),unit:String(signal.unit||'').trim().toLowerCase()};
  }
  function candidates(file){return file&&file.signals&&typeof chartCandidates==='function'?chartCandidates(file):[];}
  /* All set/actual pairs the recording offers (independent of whether they are shown as a pair). */
  function detect(file){
    var list=candidates(file),info=new Map(list.map(function(s){return [s,analyse(s)];})),pairs=[],used=new Set();
    list.forEach(function(set){
      var a=info.get(set);if(!a.isSet||!a.base)return;
      var best=null,bestScore=-1;
      list.forEach(function(act){
        if(act===set||used.has(act))return;
        var b=info.get(act);if(b.isSet||b.base!==a.base)return;
        if(a.device&&b.device&&a.device!==b.device)return;
        if(a.unit&&b.unit&&a.unit!==b.unit)return;
        var score=(b.isAct?2:0)+(a.unit===b.unit?1:0);
        if(score>bestScore){best=act;bestScore=score;}
      });
      if(best){used.add(best);pairs.push({set:set,act:best,id:key(set)+'|'+key(best)});}
    });
    return pairs;
  }
  function configs(file){return file.chartPairs||(file.chartPairs=[]);}
  function configOf(file,pair){return configs(file).find(function(c){return c.set===key(pair.set)&&c.act===key(pair.act);})||null;}
  /* Pairs that get their own lane: active and both signals currently in the chart. */
  function lanePairs(file,signals){
    if(!file||!file.chartPairs||!file.chartPairs.length)return [];
    var byKey=new Map(signals.map(function(s){return [key(s),s];}));
    return file.chartPairs.map(function(cfg){
      var set=byKey.get(cfg.set),act=byKey.get(cfg.act);
      return set&&act?{set:set,act:act,cfg:cfg}:null;
    }).filter(Boolean);
  }
  function rangeOf(file,signal){
    var min=Infinity,max=-Infinity,integer=true;
    (file.rawRows||[]).forEach(function(row){var v=numericAt(row,signal.index);if(v===null)return;if(v<min)min=v;if(v>max)max=v;if(integer&&Math.round(v)!==v)integer=false;});
    return isFinite(min)?{min:min,max:max,integer:integer}:{min:0,max:0,integer:true};
  }
  /* Automatic tolerance: half a step for whole-number signals (gear, status), otherwise 5 % of the setpoint range. */
  function autoTolerance(file,pair){
    var r=rangeOf(file,pair.set),span=r.max-r.min;
    if(r.integer&&span<=50)return 0.5;
    if(!(span>0))return 0.5;
    var raw=span*.05,power=Math.pow(10,Math.floor(Math.log10(raw)));
    return Math.round(raw/power*10)/10*power;
  }
  function tolerance(file,pair){var cfg=pair.cfg||configOf(file,pair);return cfg&&typeof cfg.tol==='number'&&cfg.tol>=0?cfg.tol:autoTolerance(file,pair);}
  function minDuration(file,pair){var cfg=pair.cfg||configOf(file,pair);return cfg&&typeof cfg.dur==='number'&&cfg.dur>=0?cfg.dur:DEFAULT_DURATION;}
  /* Time spans where |setpoint - actual| > tolerance for at least the minimum duration. */
  function deviations(file,pair,rows){
    rows=rows||file.filtered||file.rawRows||[];
    var tol=tolerance(file,pair),dur=minDuration(file,pair),id=key(pair.set)+'|'+key(pair.act)+'|'+tol+'|'+dur+'|'+rows.length+'|'+(rows[0]&&rows[0].rowId)+'|'+(file.filename||'');
    var hit=cache.get(id);if(hit&&hit.rows===rows)return hit.list;
    var list=[],open=null;
    /* A deviation ends at the first row where setpoint and actual agree again (or at the last valid row); duration and "to" use the same row. */
    function close(endRow){
      var duration=Math.max(0,(endRow.elapsedSec||0)-(open.first.elapsedSec||0));
      if(duration>=dur)list.push({start:open.first.rowId,end:endRow.rowId,from:open.first,to:endRow,duration:duration,maxDev:open.max});
      open=null;
    }
    var previous=null;
    rows.forEach(function(row){
      var a=numericAt(row,pair.set.index),b=numericAt(row,pair.act.index);
      if(a===null||b===null){if(open&&previous)close(previous);previous=row;return;}
      var dev=Math.abs(a-b);
      if(dev>tol){if(!open)open={first:row,max:dev};else if(dev>open.max)open.max=dev;}
      else if(open)close(row);
      previous=row;
    });
    if(open&&previous)close(previous);
    if(cache.size>60)cache.clear();
    cache.set(id,{rows:rows,list:list});
    return list;
  }

  /* ---------- Chart layer ---------- */
  function drawLaneLabel(ctx,x,y,scale){
    var label=txt('SOLL / IST','SETPOINT / ACTUAL');
    ctx.save();ctx.font='800 '+(8.5*scale)+'px Segoe UI, sans-serif';ctx.textBaseline='middle';ctx.textAlign='left';
    var w=ctx.measureText(label).width+10*scale,h=13*scale;
    ctx.fillStyle='#e4002b';ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x,y-h/2,w,h,h/2);else ctx.rect(x,y-h/2,w,h);ctx.fill();
    ctx.fillStyle='#fff';ctx.fillText(label,x+5*scale,y+.5);ctx.restore();
  }
  function drawDeviations(ctx,file,pair,rows,windowData,left,plotW,y0,y1,scale){
    var span=windowData.timeEnd-windowData.timeStart;if(!(span>0))return;
    ctx.save();
    deviations(file,pair,rows).forEach(function(d){
      var x1=left+((d.from.elapsedSec||0)-windowData.timeStart)/span*plotW,x2=left+((d.to.elapsedSec||0)-windowData.timeStart)/span*plotW;
      if(x2<left||x1>left+plotW)return;
      x1=Math.max(left,x1);x2=Math.min(left+plotW,Math.max(x2,x1+2*scale));
      ctx.fillStyle='rgba(228,0,43,.14)';ctx.fillRect(x1,y0+1,x2-x1,y1-y0-2);
      ctx.fillStyle='rgba(228,0,43,.6)';ctx.fillRect(x1,y0+1,Math.max(1,1.2*scale),y1-y0-2);
    });
    ctx.restore();
  }

  /* ---------- Actions ---------- */
  function activate(file,pair){
    if(configOf(file,pair))return;
    pair.set.chartHidden=false;pair.act.chartHidden=false;pair.set.overlay=false;pair.act.overlay=false;
    configs(file).push({set:key(pair.set),act:key(pair.act),tol:null,dur:DEFAULT_DURATION});
    markDirty(file);renderChart();
  }
  function deactivate(file,pair){
    file.chartPairs=configs(file).filter(function(c){return !(c.set===key(pair.set)&&c.act===key(pair.act));});
    markDirty(file);renderChart();
  }
  function reveal(file,d){
    var rows=file.filtered||file.rawRows,first=rows[0].elapsedSec||0,last=rows[rows.length-1].elapsedSec||0,total=Math.max(0,last-first);
    if(!(total>0))return;
    var pad=Math.max(d.duration*1.5,3);
    chartState.start=Math.max(0,((d.from.elapsedSec||0)-first-pad)/total);
    chartState.end=Math.min(1,((d.to.elapsedSec||0)-first+pad)/total);
    if(chartState.end-chartState.start<20/Math.max(20,rows.length)){chartState.end=Math.min(1,chartState.start+20/rows.length);}
    renderChart();
  }

  /* ---------- Panel inside "Choose signals" ---------- */
  function box(panel){
    var el=panel.querySelector('.pair-box');
    if(!el){
      el=document.createElement('section');el.className='pair-box';
      var anchor=panel.querySelector('.chart-signal-shared');
      panel.insertBefore(el,anchor?anchor.nextSibling:panel.querySelector('.chart-signal-search'));
      el.addEventListener('click',onClick);el.addEventListener('change',onChange);
    }
    return el;
  }
  function pairFromEl(file,el){var id=el.closest('[data-pair]')&&el.closest('[data-pair]').dataset.pair;return detect(file).find(function(p){return p.id===id;});}
  function onClick(e){
    var file=active();if(!file)return;
    var button=e.target.closest('button');if(!button)return;
    var pair=pairFromEl(file,button);
    if(button.dataset.act==='toggle'&&pair){configOf(file,pair)?deactivate(file,pair):activate(file,pair);showToast(configOf(file,pair)?txt('Als Soll/Ist-Paar angezeigt.','Shown as setpoint/actual pair.'):txt('Paar aufgelöst.','Pair removed.'));}
    else if(button.dataset.act==='list'&&pair){if(openLists.has(pair.id))openLists.delete(pair.id);else openLists.add(pair.id);panelSignature='';renderPanel();}
    else if(button.dataset.dev!=null&&pair){var d=deviations(file,Object.assign({cfg:configOf(file,pair)},pair))[Number(button.dataset.dev)];if(d)reveal(file,d);}
  }
  function onChange(e){
    var file=active(),input=e.target;if(!file||!input.dataset.field)return;
    var pair=pairFromEl(file,input),cfg=pair&&configOf(file,pair);if(!cfg)return;
    var value=Number(String(input.value).replace(',','.'));
    if(!isFinite(value)||value<0){showToast(txt('Bitte einen Wert ab 0 eingeben.','Please enter a value of 0 or more.'));panelSignature='';renderPanel();return;}
    cfg[input.dataset.field]=value;markDirty(file);panelSignature='';renderChart();
  }
  function renderPanel(panel){
    panel=panel||document.getElementById('chart-signal-panel');if(!panel)return;
    var file=active(),el=box(panel);
    var pairs=file&&file.rawRows?detect(file):[];
    el.hidden=!pairs.length;if(!pairs.length){panelSignature='';return;}
    if(el.contains(document.activeElement)&&document.activeElement.tagName==='INPUT')return;
    var rows=file.filtered||file.rawRows;
    var info=pairs.map(function(pair){
      var cfg=configOf(file,pair),full=Object.assign({cfg:cfg},pair);
      return {pair:pair,cfg:cfg,tol:tolerance(file,full),dur:minDuration(file,full),list:deviations(file,full,rows)};
    });
    var signature=lang()+'|'+info.map(function(i){return i.pair.id+':'+(!!i.cfg)+':'+i.tol+':'+i.dur+':'+i.list.length+':'+openLists.has(i.pair.id);}).join(',')+'|'+rows.length;
    if(signature===panelSignature)return;panelSignature=signature;
    el.innerHTML='<h3>'+esc(txt('Soll/Ist-Paare erkannt','Setpoint/actual pairs found'))+' <span>'+pairs.length+'</span></h3>'+info.map(function(i){
      var unit=i.pair.set.unit&&!/^[-–]$/.test(i.pair.set.unit.trim())?' '+esc(i.pair.set.unit):'';
      var head='<div class="pair-names"><strong>'+esc(nameOf(i.pair.set))+'</strong><span>↔</span><strong>'+esc(nameOf(i.pair.act))+'</strong></div>';
      var stats='<div class="pair-stats">'+esc(txt('Abweichungen: ','Deviations: '))+'<b>'+i.list.length+'</b>'+(i.list.length?' · '+esc(txt('längste ','longest '))+esc(num(Math.max.apply(null,i.list.map(function(d){return d.duration;})),1))+' s':'')+'</div>';
      var settings=i.cfg?'<div class="pair-settings"><label>'+esc(txt('Toleranz','Tolerance'))+' <input type="number" min="0" step="any" data-field="tol" value="'+esc(String(i.tol))+'">'+unit+'</label><label>'+esc(txt('ab','from'))+' <input type="number" min="0" step="0.1" data-field="dur" value="'+esc(String(i.dur))+'"> s</label></div>':'';
      var actions='<div class="pair-actions"><button type="button" data-act="toggle" class="'+(i.cfg?'is-active':'')+'">'+esc(i.cfg?txt('Paar auflösen','Remove pair'):txt('Als Paar zeigen','Show as pair'))+'</button>'+(i.list.length?'<button type="button" data-act="list" aria-expanded="'+openLists.has(i.pair.id)+'">'+esc(txt('Abweichungen listen','List deviations'))+'</button>':'')+'</div>';
      var list=openLists.has(i.pair.id)&&i.list.length?'<ol class="pair-list">'+i.list.slice(0,200).map(function(d,n){return '<li><button type="button" data-dev="'+n+'" title="'+esc(txt('Im Diagramm anzeigen','Show in chart'))+'"><span>'+esc(d.from.ts)+'</span><span>'+esc(num(d.duration,1))+' s</span><span>max Δ '+esc(num(d.maxDev))+unit+'</span></button></li>';}).join('')+'</ol>':'';
      return '<div class="pair-item'+(i.cfg?' is-active':'')+'" data-pair="'+esc(i.pair.id)+'">'+head+stats+settings+actions+list+'</div>';
    }).join('');
  }
  function sync(){panelSignature='';var panel=document.getElementById('chart-signal-panel');if(panel&&!panel.hidden)renderPanel(panel);}

  /* ---------- Project and reports ---------- */
  function snapshot(file){return configs(file).map(function(c){return {set:c.set,act:c.act,tol:typeof c.tol==='number'?c.tol:null,dur:typeof c.dur==='number'?c.dur:DEFAULT_DURATION};});}
  function restore(file,data){
    file.chartPairs=(Array.isArray(data)?data:[]).filter(function(c){return c&&typeof c.set==='string'&&typeof c.act==='string'&&c.set.length<400&&c.act.length<400;})
      .map(function(c){return {set:c.set,act:c.act,tol:typeof c.tol==='number'&&c.tol>=0?c.tol:null,dur:typeof c.dur==='number'&&c.dur>=0?c.dur:DEFAULT_DURATION};});
  }
  /* For the PDF: every active pair of a file with its deviations in the evaluated rows. */
  function report(file){
    var rows=file.filtered&&file.filtered.length?file.filtered:file.rawRows;
    return lanePairs(file,chartSelection(file).signals).map(function(pair){
      return {set:pair.set,act:pair.act,unit:pair.set.unit||'',tol:tolerance(file,pair),dur:minDuration(file,pair),list:deviations(file,pair,rows)};
    });
  }
  return {detect:detect,lanePairs:lanePairs,deviations:deviations,tolerance:tolerance,drawLaneLabel:drawLaneLabel,drawDeviations:drawDeviations,
    activate:activate,deactivate:deactivate,renderPanel:renderPanel,sync:sync,snapshot:snapshot,restore:restore,report:report};
})();
