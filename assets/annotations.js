/* Shared annotations use stable row IDs, independent of filtering and chart zoom. */
var Annotations=(function(){
  'use strict';
  var mode='inspect',chosenColor='#ffe08a',selection=null,currentFile=null,drag=null,editing=null;
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  var tools=document.createElement('div');
  tools.className='annotation-tools';
  tools.innerHTML='<button type="button" data-mode="marker" aria-pressed="false">Marker im Zeitstrahl setzen</button>'+
    '<button type="button" data-mode="range" aria-pressed="false">Zeitraum markieren</button>'+
    '<label class="annotation-color">Farbe <input type="color" value="#ffe08a" aria-label="Markierungsfarbe"></label>'+
    '<span class="annotation-hint" role="status">Messpunkt anklicken, um eine Notiz hinzuzufügen.</span>'+
    '<button type="button" class="annotation-note" disabled>Notiz hinzufügen</button>'+
    '<button type="button" class="annotation-toggle" aria-expanded="false">Notizen &amp; Markierungen (0)</button>';
  var table=document.getElementById('table-wrap');
  table.before(tools);
  var list=document.createElement('div');list.className='annotation-list';list.id='annotation-list';list.hidden=true;tools.after(list);
  tools.querySelector('.annotation-toggle').setAttribute('aria-controls',list.id);
  var dialog=document.createElement('dialog');dialog.className='annotation-dialog';
  dialog.setAttribute('aria-labelledby','annotation-dialog-title');
  dialog.innerHTML='<form><h2 id="annotation-dialog-title">Notiz bearbeiten</h2><p></p><textarea maxlength="4000" aria-label="Notiz" placeholder="Beobachtung, Ursache oder nächste Prüfschritte …"></textarea><footer><button type="button">Abbrechen</button><button type="submit">Notiz speichern</button></footer></form>';
  document.body.appendChild(dialog);
  var canvas=document.getElementById('signal-chart'),preview=document.createElement('div');
  preview.className='annotation-preview';preview.hidden=true;canvas.after(preview);
  var hoverLine=document.createElement('div');hoverLine.className='annotation-hover';hoverLine.hidden=true;canvas.after(hoverLine);
  function hover(x){hoverLine.hidden=x<0;if(x>=0)hoverLine.style.left=x+'px';}
  function notesAt(file,id){var notes=[];if(file.rawRows[id].note)notes.push(file.rawRows[id].note);ranges(file).forEach(function(r){if(r.note&&id>=r.start&&id<=r.end)notes.push(r.note);});return notes.join('\n');}

  function validColor(value){return /^#[0-9a-f]{6}$/i.test(value||'')?value:'#ffe08a';}
  function rgb(value){value=validColor(value);return [1,3,5].map(function(i){return parseInt(value.slice(i,i+2),16);});}
  function tint(value){return 'rgb('+rgb(value).map(function(c){return Math.round(c*.24+255*.76);}).join(',')+')';}
  function ranges(file){return file.ranges||(file.ranges=[]);}
  function target(){
    if(!selection||selection.file!==active())return null;
    return selection.type==='range'?ranges(active()).find(function(r){return r.id===selection.id;}):active().rawRows[selection.id];
  }
  function entries(file){
    var result=(file.rawRows||[]).filter(function(r){return r.marked||r.note;}).map(function(r){return {type:'row',id:r.rowId,start:r.rowId,end:r.rowId,color:validColor(r.markerColor),note:r.note||'',label:r.marked?'Marker':txt('Notiz','Note')};});
    ranges(file).forEach(function(r){result.push({type:'range',id:r.id,start:r.start,end:r.end,color:validColor(r.color),note:r.note||'',label:txt('Zeitraum','Time range')});});
    return result.sort(function(a,b){return a.start-b.start;});
  }
  function timeLabel(file,item){return file.rawRows[item.start].ts+(item.end!==item.start?' '+txt('bis','to')+' '+file.rawRows[item.end].ts:'');}
  function select(type,id){selection={file:active(),type:type,id:id};sync();}
  function setMode(next){
    mode=next===mode?'inspect':next;cancelDrag();
    tools.querySelectorAll('[data-mode]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
    canvas.classList.toggle('annotation-draw',mode!=='inspect');sync();
  }
  tools.querySelectorAll('[data-mode]').forEach(function(b){b.onclick=function(){setMode(b.dataset.mode);};});
  tools.querySelector('input').oninput=function(e){chosenColor=validColor(e.target.value);};
  tools.querySelector('.annotation-toggle').onclick=function(){list.hidden=!list.hidden;sync();requestAnimationFrame(renderChart);};
  tools.querySelector('.annotation-note').onclick=function(){edit();};

  function sync(){
    tools.querySelector('[data-mode="marker"]').textContent=txt('Marker im Zeitstrahl setzen','Set timeline marker');
    tools.querySelector('[data-mode="range"]').textContent=txt('Zeitraum markieren','Mark time range');
    tools.querySelector('.annotation-color').firstChild.nodeValue=txt('Farbe ','Color ');
    tools.querySelector('.annotation-color input').setAttribute('aria-label',txt('Markierungsfarbe','Marker color'));
    dialog.querySelector('#annotation-dialog-title').textContent=txt('Notiz bearbeiten','Edit note');
    dialog.querySelector('textarea').setAttribute('aria-label',txt('Notiz','Note'));
    dialog.querySelector('textarea').placeholder=txt('Beobachtung, Ursache oder nächste Prüfschritte …','Observation, cause or next test steps ...');
    dialog.querySelector('button[type="button"]').textContent=txt('Abbrechen','Cancel');
    dialog.querySelector('button[type="submit"]').textContent=txt('Notiz speichern','Save note');
    var file=active(),item=target(),all=entries(file);
    var hint=mode==='marker'?txt('Klicken setzt oder entfernt einen Marker.','Click to set or remove a marker.'):mode==='range'?txt('Klicken, gedrückt halten und einen Zeitbereich ziehen.','Click, hold and drag a time range.'):txt('Ziehen verschiebt den Zeitstrahl. Klicken wählt einen Messpunkt für eine Notiz.','Drag to move the timeline. Click to select a measurement point for a note.');
    if(item){hint+=' '+txt('Auswahl: ','Selection: ')+(selection.type==='range'?timeLabel(file,item):item.ts);}
    tools.querySelector('.annotation-hint').textContent=hint;
    var noteButton=tools.querySelector('.annotation-note');noteButton.disabled=!item;noteButton.textContent=item&&item.note?txt('Notiz bearbeiten','Edit note'):txt('Notiz hinzufügen','Add note');
    var toggle=tools.querySelector('.annotation-toggle');toggle.textContent=txt('Notizen & Markierungen','Notes & markers')+' ('+all.length+')';toggle.setAttribute('aria-expanded',String(!list.hidden));
    table.querySelectorAll('[data-row-id]').forEach(function(row){row.classList.toggle('annotation-selected',!!selection&&selection.type==='row'&&Number(row.dataset.rowId)===selection.id);});
    if(list.hidden)return;
    list.replaceChildren();
    if(!all.length){var empty=document.createElement('p');empty.className='annotation-list-empty';empty.textContent=txt('Noch keine Marker, Zeitbereiche oder Notizen vorhanden.','No markers, time ranges or notes yet.');list.appendChild(empty);}
    all.forEach(function(entry){
      var line=document.createElement('div');line.className='annotation-entry';line.style.setProperty('--entry-color',entry.color);
      var content=document.createElement('p');content.textContent=entry.label+' · '+timeLabel(file,entry)+(entry.note?'\n'+entry.note:'');line.appendChild(content);
      var go=document.createElement('button');go.textContent=txt('Anzeigen','Show');go.onclick=function(){select(entry.type,entry.id);reveal(entry);};line.appendChild(go);
      var editButton=document.createElement('button');editButton.textContent=txt('Notiz','Note');editButton.onclick=function(){select(entry.type,entry.id);edit();};line.appendChild(editButton);
      var colorInput=document.createElement('input');colorInput.type='color';colorInput.value=entry.color;colorInput.setAttribute('aria-label',txt('Farbe für ','Color for ')+timeLabel(file,entry));colorInput.style.width='28px';
      colorInput.onchange=function(){var obj=entry.type==='range'?ranges(file).find(function(r){return r.id===entry.id;}):file.rawRows[entry.id];if(obj){obj[entry.type==='range'?'color':'markerColor']=validColor(colorInput.value);markDirty(file);refresh();}};line.appendChild(colorInput);
      var remove=document.createElement('button');remove.textContent=txt('Entfernen','Remove');remove.className='annotation-delete';remove.onclick=function(){
        if(entry.type==='range')file.ranges=ranges(file).filter(function(r){return r.id!==entry.id;});
        else{file.rawRows[entry.id].marked=false;file.rawRows[entry.id].note='';}
        markDirty(file);selection=null;refresh();
      };line.appendChild(remove);list.appendChild(line);
    });
  }
  function refresh(){if(S.view==='chart')renderChart();else renderTable(active().filtered||active().rawRows);sync();}
  function fileChanged(){if(currentFile!==active()){cancelDrag();currentFile=active();selection=null;setMode('inspect');}sync();}
  function editRow(id){select('row',id);edit();}
  function edit(){
    var item=target();if(!item)return;
    editing={file:active(),item:item};dialog.querySelector('p').textContent=selection.type==='range'?timeLabel(active(),item):item.ts;
    dialog.querySelector('textarea').value=item.note||'';dialog.showModal();dialog.querySelector('textarea').focus();
  }
  dialog.querySelector('button[type="button"]').onclick=function(){dialog.close();};
  dialog.querySelector('form').onsubmit=function(e){e.preventDefault();if(editing&&editing.file===active()){editing.item.note=dialog.querySelector('textarea').value.trim();markDirty(editing.file);}dialog.close();refresh();};
  dialog.addEventListener('close',function(){editing=null;});
  function reveal(entry){
    var file=active(),rows=file.filtered||file.rawRows,index=rows.findIndex(function(r){return r.rowId>=entry.start&&r.rowId<=entry.end;});
    if(index<0){showToast(window.AppI18n&&AppI18n.t?AppI18n.t('outsideFilter'):txt('Diese Markierung liegt außerhalb des aktuellen Filters. Bitte den Filter zurücksetzen.','This marker is outside the current filter. Please reset the filter.'));return;}
    if(S.view==='chart'){
      var end=rows.findIndex(function(r){return r.rowId>=entry.end;});if(end<0)end=rows.length-1;
      var firstTime=rows[0].elapsedSec,lastTime=rows[rows.length-1].elapsedSec,total=Math.max(0,lastTime-firstTime);
      if(total>0){
        var padding=Math.max(total*.03,1);
        chartState.start=Math.max(0,(rows[index].elapsedSec-firstTime-padding)/total);
        chartState.end=Math.min(1,(rows[end].elapsedSec-firstTime+padding)/total);
      }else{
        var pad=Math.max(10,Math.round(rows.length*.03)),denom=Math.max(1,rows.length-1);
        chartState.start=Math.max(0,(index-pad)/denom);chartState.end=Math.min(1,(end+pad)/denom);
      }
      renderChart();
    }else{table.scrollTop=(document.getElementById('thead').getBoundingClientRect().height||0)+index*TABLE_ROW_HEIGHT;renderTable(rows);sync();}
  }
  function chartRow(e,clamp){
    var box=canvas.getBoundingClientRect(),x=e.clientX-box.left;
    if(!clamp&&(x<245||x>box.width-26||e.clientY<box.top+18||e.clientY>box.bottom-38))return null;
    return chartRowAtRatio(active().filtered||active().rawRows||[],Math.max(0,Math.min(1,(x-245)/Math.max(1,box.width-271))));
  }
  function tableRow(e){var el=document.elementFromPoint(e.clientX,e.clientY),tr=el&&el.closest('#tbody tr[data-row-id]');return tr?active().rawRows[Number(tr.dataset.rowId)]:null;}
  function cancelDrag(){var previous=drag;drag=null;if(previous&&previous.el.hasPointerCapture(previous.pointerId))previous.el.releasePointerCapture(previous.pointerId);preview.hidden=true;}
  function start(e,source){
    if(e.button!==0||e.target.closest('button'))return;
    var row=source==='chart'?chartRow(e,false):tableRow(e);if(!row)return;
    if(source==='chart'&&mode==='inspect'){
      e.preventDefault();drag={file:active(),source:'pan',el:canvas,pointerId:e.pointerId,x:e.clientX,y:e.clientY,start:chartState.start,end:chartState.end,rowId:row.rowId,moved:false};
      canvas.setPointerCapture(e.pointerId);return;
    }
    if(mode==='range'){
      e.preventDefault();drag={file:active(),source:source,el:source==='chart'?canvas:table,pointerId:e.pointerId,start:row.rowId,end:row.rowId,x:e.clientX,y:e.clientY,color:chosenColor};drag.el.setPointerCapture(e.pointerId);
    }else{
      select('row',row.rowId);
      if(mode==='marker'){row.marked=!row.marked;row.markerColor=chosenColor;markDirty(active());refresh();}
    }
  }
  function move(e){
    if(!drag||e.pointerId!==drag.pointerId)return;
    if(drag.source==='pan'){
      if(drag.file!==active()){cancelDrag();return;}
      if(Math.abs(e.clientX-drag.x)<4&&!drag.moved)return;
      drag.moved=true;
      var span=drag.end-drag.start,width=Math.max(1,canvas.getBoundingClientRect().width-271);
      chartState.start=Math.max(0,Math.min(1-span,drag.start-(e.clientX-drag.x)/width*span));
      chartState.end=chartState.start+span;
      document.getElementById('chart-tooltip').classList.remove('visible');hover(-1);
      schedulePan();return;
    }
    var row=drag.source==='chart'?chartRow(e,true):tableRow(e);if(!row)return;drag.end=row.rowId;
    if(drag.source==='chart'){
      var box=canvas.getBoundingClientRect(),x=Math.max(245,Math.min(box.width-26,e.clientX-box.left)),startX=drag.x-box.left;
      preview.style.left=Math.min(x,startX)+'px';preview.style.width=Math.max(2,Math.abs(x-startX))+'px';preview.style.setProperty('--annotation-color',drag.color);preview.style.setProperty('--annotation-preview',tint(drag.color));preview.style.opacity='.7';preview.hidden=false;
    }else{
      table.querySelectorAll('[data-row-id]').forEach(function(tr){var id=Number(tr.dataset.rowId);tr.style.outline=id>=Math.min(drag.start,drag.end)&&id<=Math.max(drag.start,drag.end)?'2px solid '+drag.color:'';});
    }
  }
  function finish(e){
    if(!drag||e.pointerId!==drag.pointerId)return;
    move(e);var done=drag;cancelDrag();
    if(done.file!==active())return;
    if(done.source==='pan'){
      if(!done.moved)select('row',done.rowId);
      return;
    }
    if(done.start===done.end||Math.hypot(e.clientX-done.x,e.clientY-done.y)<4){refresh();return;}
    var range={id:crypto.randomUUID(),start:Math.min(done.start,done.end),end:Math.max(done.start,done.end),color:done.color,note:''};
    ranges(done.file).push(range);markDirty(done.file);selection={file:done.file,type:'range',id:range.id};refresh();
    showToast(window.AppI18n&&AppI18n.t?AppI18n.t('rangeMarkedToast'):txt('Zeitraum markiert. Über „Notiz hinzufügen“ kannst du ihn beschreiben.','Time range marked. Use "Add note" to describe it.'));
  }
  var panFrame=0;
  function schedulePan(){if(!panFrame)panFrame=requestAnimationFrame(function(){panFrame=0;if(S.view==='chart')renderChart();});}
  canvas.addEventListener('pointerdown',function(e){start(e,'chart');});
  table.addEventListener('pointerdown',function(e){start(e,'table');});
  [canvas,table].forEach(function(el){el.addEventListener('pointermove',move);el.addEventListener('pointerup',finish);el.addEventListener('pointercancel',function(){cancelDrag();refresh();});el.addEventListener('lostpointercapture',function(){if(drag){cancelDrag();refresh();}});});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!dialog.open){cancelDrag();setMode('inspect');refresh();}});

  function tableColors(file){
    var colors=new Map();ranges(file).forEach(function(r){for(var id=r.start;id<=r.end;id++)colors.set(id,tint(r.color));});
    file.rawRows.forEach(function(r){if(r.marked)colors.set(r.rowId,tint(r.markerColor));});return colors;
  }
  function draw(ctx,file,rows,left,top,width,height,windowData){
    if(!rows.length)return;
    windowData=windowData||{rows:rows,timeStart:rows[0].elapsedSec||0,timeEnd:rows[rows.length-1].elapsedSec||0};
    ranges(file).forEach(function(r){
      var first=-1,last=-1;rows.forEach(function(row,i){if(row.rowId>=r.start&&row.rowId<=r.end){if(first<0)first=i;last=i;}});if(first<0)return;
      var x1=left+rowChartRatio(rows[first],first,windowData)*width,x2=left+rowChartRatio(rows[last],last,windowData)*width;
      ctx.fillStyle=tint(r.color);ctx.fillRect(x1,top,Math.max(2,x2-x1),height);
      ctx.strokeStyle=validColor(r.color);ctx.lineWidth=1;ctx.strokeRect(x1,top,Math.max(2,x2-x1),height);
      if(r.note){ctx.font='bold 11px sans-serif';ctx.fillStyle='#123657';ctx.fillText('N',x1+3,top+12);}
    });
    rows.forEach(function(r,i){if(!r.note)return;var x=left+rowChartRatio(r,i,windowData)*width;ctx.fillStyle=validColor(r.markerColor);ctx.fillRect(x-4,top,8,8);});
  }
  function snapshot(file){return {version:1,ranges:ranges(file).map(function(r){return Object.assign({},r);}),rows:file.rawRows.filter(function(r){return r.marked||r.note;}).map(function(r){return {id:r.rowId,color:validColor(r.markerColor),note:r.note||''};})};}
  function restore(file,data){
    file.ranges=[];if(!data)return;
    if(data.version!==1||!Array.isArray(data.ranges)||!Array.isArray(data.rows))throw new Error('Ungültige Markierungen im Projekt.');
    function validId(id){return Number.isInteger(id)&&id>=0&&id<file.rawRows.length;}
    data.rows.forEach(function(r){if(!r||!validId(r.id))throw new Error('Ungültiger Notiz-Zeitpunkt.');file.rawRows[r.id].markerColor=validColor(r.color);file.rawRows[r.id].note=typeof r.note==='string'?r.note.slice(0,4000):'';});
    data.ranges.forEach(function(r){if(!r||!validId(r.start)||!validId(r.end)||r.start>r.end)throw new Error('Ungültiger markierter Zeitraum.');file.ranges.push({id:crypto.randomUUID(),start:r.start,end:r.end,color:validColor(r.color),note:typeof r.note==='string'?r.note.slice(0,4000):''});});
  }
  function exportRows(file){return entries(file).map(function(r){return [r.label,file.rawRows[r.start].ts,file.rawRows[r.end].ts,r.color,r.note];});}
  function summary(file){var rows=exportRows(file);return txt('NOTIZEN UND ZEITBEREICHE (gesamte Datei)','NOTES AND TIME RANGES (complete file)')+'\r\n'+(rows.length?rows.map(function(r){return r.join(' | ');}).join('\r\n'):txt('Keine','None'));}
  function excel(wb,file){
    var rows=exportRows(file);if(!rows.length)return;
    var ws=wb.addWorksheet(txt('Notizen und Zeitbereiche','Notes and time ranges'));ws.columns=[{width:16},{width:22},{width:22},{width:14},{width:90}];
    ws.addRow(lang()==='en'?['Type','From','To','Color','Note (complete file)']:['Typ','Von','Bis','Farbe','Notiz (gesamte Datei)']);ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF003D75'}};
    rows.forEach(function(values){var row=ws.addRow(values);row.alignment={wrapText:true,vertical:'top'};row.getCell(4).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+values[3].slice(1)}};});ws.views=[{state:'frozen',ySplit:1}];
  }
  function pdf(doc,file){
    var rows=exportRows(file);if(!rows.length)return;
    doc.addPage('a4','landscape');doc.setFont('helvetica','bold');doc.setFontSize(14);doc.setTextColor(0,61,117);doc.text(txt('Notizen und Zeitbereiche (gesamte Datei)','Notes and time ranges (complete file)'),10,17);
    doc.autoTable({startY:24,margin:{left:10,right:10,top:15,bottom:15},head:[lang()==='en'?['Type','From','To','Color','Note']:['Typ','Von','Bis','Farbe','Notiz']],body:rows,styles:{font:'helvetica',fontSize:9,cellPadding:3,overflow:'linebreak'},headStyles:{fillColor:[0,61,117]},columnStyles:{0:{cellWidth:24},1:{cellWidth:32},2:{cellWidth:32},3:{cellWidth:25}},didParseCell:function(cell){if(cell.section==='body'&&cell.column.index===3)cell.cell.styles.fillColor=rgb(cell.cell.raw);}});
  }
  return {validColor:validColor,color:function(){return chosenColor;},sync:sync,fileChanged:fileChanged,editRow:editRow,tableColors:tableColors,draw:draw,snapshot:snapshot,restore:restore,summary:summary,excel:excel,pdf:pdf,hover:hover,notesAt:notesAt,isDragging:function(){return !!drag;}};
})();
