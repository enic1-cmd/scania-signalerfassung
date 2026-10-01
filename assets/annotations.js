/* Toolbox, user markers, time ranges, notes, capture markers and undo/redo.
   User annotations use stable row IDs, independent of filtering and chart zoom.
   Capture markers (Marker column of the TXT) are a separate, read-only layer and never change row.marked. */
var Annotations=(function(){
  'use strict';
  var DEFAULT_COLORS={marker:'#e4002b',range:'#ffe08a'},DEFAULT_WIDTH=3,TXT_DEFAULT='#0b4f8a';
  var SWATCHES=['#e4002b','#f5a800','#ffe08a','#16a34a','#0066b3','#7c3aed'];
  var WIDTHS=[1,3,5,8],HISTORY_LIMIT=100,HIT_PX=7;
  var mode='inspect',toolColor={marker:DEFAULT_COLORS.marker,range:DEFAULT_COLORS.range},markerWidth=DEFAULT_WIDTH;
  var selection=null,currentFile=null,drag=null,editing=null;
  function lang(){return window.AppI18n&&AppI18n.currentLang?AppI18n.currentLang():'de';}
  function txt(de,en){return lang()==='en'?en:de;}
  function svg(path,extra){return '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'+(extra||'')+'>'+path+'</svg>';}
  var ICONS={
    inspect:svg('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
    marker:svg('<path d="M8 21V3"/><path d="M8 4h10l-3 4 3 4H8"/>'),
    range:svg('<path d="M5 4v16M19 4v16"/><rect x="5" y="7" width="14" height="10" rx="1" fill="currentColor" fill-opacity=".22" stroke="none"/><path d="M5 12h14"/>'),
    txt:svg('<path d="M5 21V4"/><path d="M5 4h11l-2.5 3.5L16 11H5"/><path d="M19 15v6M16 18h6"/>'),
    prev:svg('<path d="M15 6l-6 6 6 6"/>'),next:svg('<path d="M9 6l6 6-6 6"/>'),
    undo:svg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>'),
    redo:svg('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>'),
    note:svg('<path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>'),
    list:svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>')
  };
  function widthIcon(w){return '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><rect x="'+(8-w/2)+'" y="2" width="'+w+'" height="12" rx="'+Math.min(1.5,w/2)+'" fill="currentColor"/></svg>';}

  var tools=document.createElement('div');
  tools.className='annotation-tools toolbox';tools.setAttribute('role','toolbar');
  tools.innerHTML=
    '<div class="tool-group tool-modes" role="group">'+
      '<button type="button" data-mode="inspect" aria-pressed="true">'+ICONS.inspect+'<span class="tool-text"></span></button>'+
      '<button type="button" data-mode="marker" aria-pressed="false">'+ICONS.marker+'<span class="tool-text"></span></button>'+
      '<button type="button" data-mode="range" aria-pressed="false">'+ICONS.range+'<span class="tool-text"></span></button>'+
    '</div>'+
    '<div class="tool-group tool-style" role="group">'+
      '<span class="tool-label" data-label="color"></span>'+
      '<span class="tool-swatches">'+SWATCHES.map(function(c){return '<button type="button" class="tool-swatch" data-color="'+c+'" style="--swatch:'+c+'" aria-pressed="false"></button>';}).join('')+'</span>'+
      '<label class="annotation-color"><input type="color" value="'+DEFAULT_COLORS.marker+'"></label>'+
      '<span class="tool-label tool-width-label" data-label="width"></span>'+
      '<span class="tool-widths">'+WIDTHS.map(function(w){return '<button type="button" class="tool-width" data-width="'+w+'" aria-pressed="'+(w===DEFAULT_WIDTH)+'">'+widthIcon(w)+'</button>';}).join('')+'</span>'+
    '</div>'+
    '<div class="tool-group tool-capture" role="group">'+
      '<button type="button" class="tool-txt" id="mark-timestamps" aria-pressed="true">'+ICONS.txt+'<span class="tool-text"></span><span class="tool-count"></span></button>'+
      '<label class="tool-txt-color"><input type="color" value="'+TXT_DEFAULT+'"></label>'+
      '<button type="button" class="tool-icon" data-nav="prev">'+ICONS.prev+'</button>'+
      '<button type="button" class="tool-icon" data-nav="next">'+ICONS.next+'</button>'+
    '</div>'+
    '<div class="tool-group tool-history" role="group">'+
      '<button type="button" class="tool-icon" data-history="undo" disabled>'+ICONS.undo+'</button>'+
      '<button type="button" class="tool-icon" data-history="redo" disabled>'+ICONS.redo+'</button>'+
    '</div>'+
    '<span class="annotation-hint" role="status"></span>'+
    '<button type="button" class="annotation-note" disabled>'+ICONS.note+'<span class="tool-text"></span></button>'+
    '<button type="button" class="annotation-toggle" aria-expanded="false">'+ICONS.list+'<span class="tool-text"><span class="tool-text-long"></span><span class="tool-text-short"></span></span></button>';
  var table=document.getElementById('table-wrap');
  table.before(tools);
  var list=document.createElement('div');list.className='annotation-list';list.id='annotation-list';list.hidden=true;tools.after(list);
  tools.querySelector('.annotation-toggle').setAttribute('aria-controls',list.id);
  var dialog=document.createElement('dialog');dialog.className='annotation-dialog';
  dialog.setAttribute('aria-labelledby','annotation-dialog-title');
  dialog.innerHTML='<form><h2 id="annotation-dialog-title"></h2><p></p><textarea maxlength="4000"></textarea><footer><button type="button"></button><button type="submit"></button></footer></form>';
  document.body.appendChild(dialog);
  var canvas=document.getElementById('signal-chart'),preview=document.createElement('div');
  preview.className='annotation-preview';preview.hidden=true;canvas.after(preview);
  var hoverLine=document.createElement('div');hoverLine.className='annotation-hover';hoverLine.hidden=true;canvas.after(hoverLine);
  function hover(x){hoverLine.hidden=x<0;if(x>=0)hoverLine.style.left=x+'px';}

  function validColor(value,fallback){return /^#[0-9a-f]{6}$/i.test(value||'')?String(value).toLowerCase():(fallback||'#ffe08a');}
  function validWidth(value){value=Number(value);return WIDTHS.indexOf(value)>=0?value:DEFAULT_WIDTH;}
  function rgb(value){value=validColor(value);return [1,3,5].map(function(i){return parseInt(value.slice(i,i+2),16);});}
  var RANGE_ALPHA=.24;
  function tint(value){return 'rgb('+rgb(value).map(function(c){return Math.round(c*RANGE_ALPHA+255*(1-RANGE_ALPHA));}).join(',')+')';}
  function translucent(value,alpha){return 'rgba('+rgb(value).join(',')+','+alpha+')';}
  function textOn(value){var c=rgb(value);return (c[0]*299+c[1]*587+c[2]*114)/1000>150?'#13263a':'#ffffff';}
  function ranges(file){return file.ranges||(file.ranges=[]);}
  function txtColor(file){return validColor(file&&file.txtMarkerColor,TXT_DEFAULT);}
  function txtVisible(file){return !file||file.txtMarkersVisible!==false;}
  function notesAt(file,id){var notes=[];if(file.rawRows[id].note)notes.push(file.rawRows[id].note);ranges(file).forEach(function(r){if(r.note&&id>=r.start&&id<=r.end)notes.push(r.note);});return notes.join('\n');}
  function target(){
    if(!selection||selection.file!==active())return null;
    return selection.type==='range'?ranges(active()).find(function(r){return r.id===selection.id;}):active().rawRows[selection.id];
  }
  function letter(index){var s='';index++;while(index>0){var m=(index-1)%26;s=String.fromCharCode(65+m)+s;index=Math.floor((index-1)/26);}return s;}
  /* All user annotations in time order; the letter is the shared reference used in chart, list and reports. */
  function entries(file){
    var result=(file.rawRows||[]).filter(function(r){return r.marked||r.note;}).map(function(r){return {type:'row',id:r.rowId,start:r.rowId,end:r.rowId,color:validColor(r.markerColor,DEFAULT_COLORS.marker),width:validWidth(r.markerWidth),marked:!!r.marked,note:r.note||'',label:r.marked?txt('Marker','Marker'):txt('Notiz','Note')};});
    ranges(file).forEach(function(r){result.push({type:'range',id:r.id,start:r.start,end:r.end,color:validColor(r.color),note:r.note||'',label:txt('Zeitraum','Time range')});});
    result.sort(function(a,b){return a.start-b.start||(a.type==='range')-(b.type==='range');});
    result.forEach(function(entry,index){entry.letter=letter(index);});
    return result;
  }
  function timeLabel(file,item){return file.rawRows[item.start].ts+(item.end!==item.start?' '+txt('bis','to')+' '+file.rawRows[item.end].ts:'');}
  function select(type,id){selection={file:active(),type:type,id:id};syncStyleControls();sync();}

  /* ---------- Undo / redo: snapshots of the annotation layer per file ---------- */
  function history(file){return file.history||(file.history={undo:[],redo:[]});}
  function capture(file){
    return {
      rows:(file.rawRows||[]).filter(function(r){return r.marked||r.note;}).map(function(r){return [r.rowId,!!r.marked,r.markerColor||'',r.markerWidth||0,r.note||''];}),
      ranges:ranges(file).map(function(r){return Object.assign({},r);}),
      txtVisible:txtVisible(file),txtColor:txtColor(file)
    };
  }
  function apply(file,state){
    file.rawRows.forEach(function(r){if(r.marked||r.note||r.markerColor||r.markerWidth){r.marked=false;r.note='';r.markerColor='';r.markerWidth=0;}});
    state.rows.forEach(function(item){var r=file.rawRows[item[0]];if(!r)return;r.marked=item[1];r.markerColor=item[2];r.markerWidth=item[3];r.note=item[4];});
    file.ranges=state.ranges.map(function(r){return Object.assign({},r);});
    file.txtMarkersVisible=state.txtVisible;file.txtMarkerColor=state.txtColor;
  }
  function record(file){
    file=file||active();if(!file||!file.rawRows)return;
    var h=history(file);h.undo.push(capture(file));if(h.undo.length>HISTORY_LIMIT)h.undo.shift();h.redo=[];
    markDirty(file);
  }
  function step(direction){
    var file=active();if(!file||!file.rawRows)return false;
    var h=history(file),from=direction<0?h.undo:h.redo,to=direction<0?h.redo:h.undo;
    if(!from.length)return false;
    to.push(capture(file));apply(file,from.pop());
    if(selection&&selection.type==='range'&&!ranges(file).some(function(r){return r.id===selection.id;}))selection=null;
    markDirty(file);refresh();
    showToast(direction<0?txt('Rückgängig gemacht','Undone'):txt('Wiederhergestellt','Redone'));
    return true;
  }
  function undo(){return step(-1);}
  function redo(){return step(1);}

  /* ---------- Toolbox state ---------- */
  function styleKey(){
    if(mode==='range')return 'range';
    if(mode==='marker')return 'marker';
    var item=target();return item&&selection.type==='range'?'range':'marker';
  }
  function currentColor(){var item=target();if(mode==='inspect'&&item){if(selection.type==='range')return validColor(item.color);if(item.marked)return validColor(item.markerColor,DEFAULT_COLORS.marker);}return toolColor[styleKey()];}
  function currentWidth(){var item=target();if(mode==='inspect'&&item&&selection.type==='row'&&item.marked)return validWidth(item.markerWidth);return markerWidth;}
  function syncStyleControls(){
    var color=currentColor(),width=currentWidth(),rangeStyle=styleKey()==='range';
    tools.querySelector('.annotation-color input').value=color;
    tools.querySelectorAll('.tool-swatch').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.color===color));});
    tools.querySelectorAll('.tool-width').forEach(function(b){b.setAttribute('aria-pressed',String(Number(b.dataset.width)===width));b.disabled=rangeStyle;});
    tools.querySelector('.tool-width-label').classList.toggle('is-disabled',rangeStyle);
  }
  /* Changing style with a selected marker or range in navigate mode restyles that item (undoable). */
  function setColor(value){
    value=validColor(value,toolColor[styleKey()]);
    var item=target();
    if(mode==='inspect'&&item&&(selection.type==='range'||item.marked)){
      var key=selection.type==='range'?'color':'markerColor';
      if(item[key]!==value){record(active());item[key]=value;refresh();}
    }
    toolColor[styleKey()]=value;syncStyleControls();
  }
  function setWidth(value){
    value=validWidth(value);
    var item=target();
    if(mode==='inspect'&&item&&selection.type==='row'&&item.marked&&validWidth(item.markerWidth)!==value){record(active());item.markerWidth=value;refresh();}
    markerWidth=value;syncStyleControls();
  }
  function setMode(next){
    mode=next===mode&&next!=='inspect'?'inspect':next;cancelDrag();
    tools.querySelectorAll('[data-mode]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.mode===mode));});
    canvas.classList.toggle('annotation-draw',mode!=='inspect');
    syncStyleControls();sync();
  }
  tools.querySelectorAll('[data-mode]').forEach(function(b){b.onclick=function(){setMode(b.dataset.mode);};});
  tools.querySelectorAll('.tool-swatch').forEach(function(b){b.onclick=function(){setColor(b.dataset.color);};});
  tools.querySelector('.annotation-color input').oninput=function(e){setColor(e.target.value);};
  tools.querySelectorAll('.tool-width').forEach(function(b){b.onclick=function(){setWidth(b.dataset.width);};});
  tools.querySelector('.annotation-toggle').onclick=function(){list.hidden=!list.hidden;sync();requestAnimationFrame(renderChart);};
  tools.querySelector('.annotation-note').onclick=function(){edit();};
  tools.querySelector('.tool-txt').onclick=function(){toggleCaptureMarkers();};
  tools.querySelector('.tool-txt-color input').oninput=function(e){
    var file=active(),value=validColor(e.target.value,TXT_DEFAULT);if(!file.rawRows||txtColor(file)===value)return;
    if(!file._txtColorEditing){record(file);file._txtColorEditing=true;}
    file.txtMarkerColor=value;refresh();
  };
  tools.querySelector('.tool-txt-color input').onchange=function(){var file=active();if(file)file._txtColorEditing=false;};
  tools.querySelector('[data-nav="prev"]').onclick=function(){jumpCapture(-1);};
  tools.querySelector('[data-nav="next"]').onclick=function(){jumpCapture(1);};
  tools.querySelector('[data-history="undo"]').onclick=undo;
  tools.querySelector('[data-history="redo"]').onclick=redo;

  function toggleCaptureMarkers(){
    var file=active();if(!file.rawRows||!captureEvents(file).length)return;
    record(file);file.txtMarkersVisible=!txtVisible(file);refresh();
    showToast(txtVisible(file)?txt('Erfassungsmarker werden angezeigt.','Capture markers are shown.'):txt('Erfassungsmarker ausgeblendet.','Capture markers hidden.'));
  }
  function captureEvents(file,rows){return typeof markerEvents==='function'?markerEvents(file,rows):[];}
  /* Steps through the marker button presses of the capture; chart keeps its zoom level, table scrolls. */
  function jumpCapture(direction){
    var file=active(),events=captureEvents(file,file.filtered||file.rawRows);
    if(!events.length){showToast(txt('Im aktuellen Filter gibt es keinen Erfassungsmarker.','No capture marker in the current filter.'));return;}
    if(!txtVisible(file)){file.txtMarkersVisible=true;}
    var cursor=typeof file.txtMarkerCursor==='number'?file.txtMarkerCursor:(direction>0?-1:events.length);
    cursor=(cursor+direction+events.length)%events.length;file.txtMarkerCursor=cursor;
    var event=events[cursor];
    if(S.view==='chart'){
      var rows=file.filtered||file.rawRows,first=rows[0].elapsedSec,total=Math.max(0,rows[rows.length-1].elapsedSec-first);
      var span=chartState.end-chartState.start;if(span>=.999)span=Math.min(1,Math.max(.08,40/Math.max(1,rows.length)));
      var center=total>0?(event.row.elapsedSec-first)/total:rows.indexOf(event.row)/Math.max(1,rows.length-1);
      chartState.start=Math.max(0,Math.min(1-span,center-span/2));chartState.end=chartState.start+span;
      file.chartFocusRowId=event.row.rowId;renderChart();
    }else if(typeof scrollTableToRow==='function'){scrollTableToRow(event.row.rowId);}
    showToast(txt('Erfassungsmarker ','Capture marker ')+event.value+' · '+event.row.ts);
    sync();
  }

  function sync(){
    var labels={
      inspect:txt('Navigieren','Navigate'),marker:txt('Marker','Marker'),range:txt('Zeitraum','Time range'),
      inspectTitle:txt('Ziehen verschiebt den Zeitstrahl, Klick wählt einen Messpunkt','Drag pans the timeline, click selects a measurement point'),
      markerTitle:txt('Marker im Zeitstrahl setzen oder entfernen','Set or remove a timeline marker'),
      rangeTitle:txt('Zeitraum mit gedrückter Maustaste markieren','Mark a time range by dragging')
    };
    tools.setAttribute('aria-label',txt('Werkzeuge','Tools'));
    tools.querySelector('.tool-modes').setAttribute('aria-label',txt('Werkzeug','Tool'));
    ['inspect','marker','range'].forEach(function(key){var b=tools.querySelector('[data-mode="'+key+'"]');b.querySelector('.tool-text').textContent=labels[key];b.title=labels[key+'Title'];});
    tools.querySelector('[data-label="color"]').textContent=txt('Farbe','Color');
    tools.querySelector('[data-label="width"]').textContent=txt('Dicke','Width');
    tools.querySelector('.tool-style').setAttribute('aria-label',txt('Farbe und Dicke','Color and width'));
    tools.querySelectorAll('.tool-swatch').forEach(function(b){b.setAttribute('aria-label',txt('Farbe ','Color ')+b.dataset.color);b.title=txt('Farbe wählen','Choose color');});
    tools.querySelector('.annotation-color input').setAttribute('aria-label',txt('Eigene Farbe','Custom color'));
    tools.querySelector('.annotation-color').title=txt('Eigene Farbe','Custom color');
    tools.querySelectorAll('.tool-width').forEach(function(b){var label=txt('Markerdicke ','Marker width ')+b.dataset.width+' px';b.setAttribute('aria-label',label);b.title=label;});
    var file=active(),events=file.rawRows?captureEvents(file):[],shown=txtVisible(file);
    var txtButton=tools.querySelector('.tool-txt');
    txtButton.querySelector('.tool-text').textContent=txt('Erfassungsmarker','Capture markers');
    txtButton.querySelector('.tool-count').textContent=events.length;
    txtButton.disabled=!events.length;txtButton.setAttribute('aria-pressed',String(!!events.length&&shown));
    txtButton.title=events.length?(shown?txt('Marker aus der Signalerfassung ausblenden','Hide markers from the signal capture'):txt('Marker aus der Signalerfassung anzeigen','Show markers from the signal capture'))+' ('+events.length+')':txt('Diese Datei enthält keine Markerknopf-Drücke','This file contains no marker button presses');
    tools.querySelector('.tool-capture').setAttribute('aria-label',txt('Erfassungsmarker','Capture markers'));
    var txtInput=tools.querySelector('.tool-txt-color input');txtInput.value=txtColor(file);txtInput.disabled=!events.length;
    txtInput.setAttribute('aria-label',txt('Farbe der Erfassungsmarker','Capture marker color'));tools.querySelector('.tool-txt-color').title=txtInput.getAttribute('aria-label');
    [['prev',txt('Vorheriger Erfassungsmarker','Previous capture marker')],['next',txt('Nächster Erfassungsmarker','Next capture marker')]].forEach(function(item){var b=tools.querySelector('[data-nav="'+item[0]+'"]');b.disabled=!events.length;b.title=item[1];b.setAttribute('aria-label',item[1]);});
    var h=file.rawRows?history(file):{undo:[],redo:[]};
    var undoButton=tools.querySelector('[data-history="undo"]'),redoButton=tools.querySelector('[data-history="redo"]');
    undoButton.disabled=!h.undo.length;redoButton.disabled=!h.redo.length;
    undoButton.title=txt('Rückgängig (Strg+Z)','Undo (Ctrl+Z)');undoButton.setAttribute('aria-label',undoButton.title);
    redoButton.title=txt('Wiederholen (Strg+Y)','Redo (Ctrl+Y)');redoButton.setAttribute('aria-label',redoButton.title);
    tools.querySelector('.tool-history').setAttribute('aria-label',txt('Verlauf','History'));
    dialog.querySelector('#annotation-dialog-title').textContent=txt('Notiz bearbeiten','Edit note');
    dialog.querySelector('textarea').setAttribute('aria-label',txt('Notiz','Note'));
    dialog.querySelector('textarea').placeholder=txt('Beobachtung, Ursache oder nächste Prüfschritte …','Observation, cause or next test steps ...');
    dialog.querySelector('button[type="button"]').textContent=txt('Abbrechen','Cancel');
    dialog.querySelector('button[type="submit"]').textContent=txt('Notiz speichern','Save note');
    var item=file.rawRows?target():null,all=file.rawRows?entries(file):[];
    var hint=mode==='marker'?txt('Klick setzt einen Marker, Klick auf einen Marker entfernt ihn.','Click sets a marker, clicking a marker removes it.'):mode==='range'?txt('Gedrückt halten und Zeitbereich ziehen.','Hold and drag a time range.'):txt('Ziehen verschiebt, Klick wählt einen Messpunkt.','Drag to pan, click selects a point.');
    if(item){hint+=' '+txt('Auswahl: ','Selection: ')+(selection.type==='range'?timeLabel(file,item):item.ts);}
    var hintEl=tools.querySelector('.annotation-hint');hintEl.textContent=hint;hintEl.title=hint;
    var noteButton=tools.querySelector('.annotation-note');noteButton.disabled=!item;noteButton.querySelector('.tool-text').textContent=item&&item.note?txt('Notiz bearbeiten','Edit note'):txt('Notiz hinzufügen','Add note');
    var toggle=tools.querySelector('.annotation-toggle');toggle.querySelector('.tool-text-long').textContent=txt('Notizen & Markierungen','Notes & markers')+' ('+all.length+')';toggle.querySelector('.tool-text-short').textContent=txt('Notizen','Notes')+' ('+all.length+')';toggle.title=txt('Notizen & Markierungen','Notes & markers');toggle.setAttribute('aria-expanded',String(!list.hidden));
    table.querySelectorAll('[data-row-id]').forEach(function(row){row.classList.toggle('annotation-selected',!!selection&&selection.type==='row'&&Number(row.dataset.rowId)===selection.id);});
    syncStyleControls();
    if(list.hidden)return;
    list.replaceChildren();
    if(!all.length){var empty=document.createElement('p');empty.className='annotation-list-empty';empty.textContent=txt('Noch keine Marker, Zeitbereiche oder Notizen vorhanden.','No markers, time ranges or notes yet.');list.appendChild(empty);}
    all.forEach(function(entry){
      var line=document.createElement('div');line.className='annotation-entry';line.style.setProperty('--entry-color',entry.color);
      var badge=document.createElement('span');badge.className='annotation-letter';badge.textContent=entry.letter;badge.style.background=entry.color;badge.style.color=textOn(entry.color);line.appendChild(badge);
      var content=document.createElement('p');content.textContent=entry.label+' · '+timeLabel(file,entry)+(entry.note?'\n'+entry.note:'');line.appendChild(content);
      var go=document.createElement('button');go.type='button';go.textContent=txt('Anzeigen','Show');go.onclick=function(){select(entry.type,entry.id);reveal(entry);};line.appendChild(go);
      var editButton=document.createElement('button');editButton.type='button';editButton.textContent=txt('Notiz','Note');editButton.onclick=function(){select(entry.type,entry.id);edit();};line.appendChild(editButton);
      var colorInput=document.createElement('input');colorInput.type='color';colorInput.value=entry.color;colorInput.setAttribute('aria-label',txt('Farbe für ','Color for ')+timeLabel(file,entry));colorInput.style.width='28px';
      colorInput.onchange=function(){var obj=entry.type==='range'?ranges(file).find(function(r){return r.id===entry.id;}):file.rawRows[entry.id];if(obj){record(file);obj[entry.type==='range'?'color':'markerColor']=validColor(colorInput.value);refresh();}};line.appendChild(colorInput);
      var remove=document.createElement('button');remove.type='button';remove.textContent=txt('Entfernen','Remove');remove.className='annotation-delete';remove.onclick=function(){
        record(file);
        if(entry.type==='range')file.ranges=ranges(file).filter(function(r){return r.id!==entry.id;});
        else{file.rawRows[entry.id].marked=false;file.rawRows[entry.id].note='';}
        selection=null;refresh();
      };line.appendChild(remove);list.appendChild(line);
    });
  }
  function refresh(){if(S.view==='chart')renderChart();else renderTable(active().filtered||active().rawRows);if(typeof updateTimestampActions==='function')updateTimestampActions();sync();}
  function fileChanged(){if(currentFile!==active()){cancelDrag();currentFile=active();selection=null;setMode('inspect');}sync();}
  function editRow(id){select('row',id);edit();}
  function edit(){
    var item=target();if(!item)return;
    editing={file:active(),item:item};dialog.querySelector('p').textContent=selection.type==='range'?timeLabel(active(),item):item.ts;
    dialog.querySelector('textarea').value=item.note||'';dialog.showModal();dialog.querySelector('textarea').focus();
  }
  dialog.querySelector('button[type="button"]').onclick=function(){dialog.close();};
  dialog.querySelector('form').onsubmit=function(e){
    e.preventDefault();
    if(editing&&editing.file===active()){var value=dialog.querySelector('textarea').value.trim();if((editing.item.note||'')!==value){record(editing.file);editing.item.note=value;}}
    dialog.close();refresh();
  };
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
  function plotBox(){var box=canvas.getBoundingClientRect(),g=typeof chartGeometry==='function'?chartGeometry(box.width,box.height):{left:245,right:26,top:18,bottom:38};return {box:box,left:g.left,right:g.right,top:g.top,bottom:g.bottom,width:Math.max(1,box.width-g.left-g.right)};}
  function chartRow(e,clamp){
    var p=plotBox(),x=e.clientX-p.box.left;
    if(!clamp&&(x<p.left||x>p.box.width-p.right||e.clientY<p.box.top+p.top||e.clientY>p.box.bottom-p.bottom))return null;
    return chartRowAtRatio(active().filtered||active().rawRows||[],Math.max(0,Math.min(1,(x-p.left)/p.width)));
  }
  /* A click within a few pixels of an existing user marker hits that marker instead of the nearest row. */
  function markerNear(e){
    var file=active(),rows=file.filtered||file.rawRows||[],windowData=chartWindowRows(rows),p=plotBox(),x=e.clientX-p.box.left,best=null,bestDistance=Infinity;
    windowData.rows.forEach(function(row,index){
      if(!row.marked)return;
      var distance=Math.abs(p.left+rowChartRatio(row,index,windowData)*p.width-x),reach=HIT_PX+validWidth(row.markerWidth)/2;
      if(distance<=reach&&distance<bestDistance){best=row;bestDistance=distance;}
    });
    return best;
  }
  function tableRow(e){var el=document.elementFromPoint(e.clientX,e.clientY),tr=el&&el.closest('#tbody tr[data-row-id]');return tr?active().rawRows[Number(tr.dataset.rowId)]:null;}
  function cancelDrag(){var previous=drag;drag=null;if(previous&&previous.el.hasPointerCapture(previous.pointerId))previous.el.releasePointerCapture(previous.pointerId);preview.hidden=true;}
  function toggleMarker(row){
    var file=active();record(file);
    if(row.marked){row.marked=false;}
    else{row.marked=true;row.markerColor=toolColor.marker;row.markerWidth=markerWidth;}
    refresh();
  }
  function start(e,source){
    if(e.button!==0||e.target.closest('button'))return;
    if(source==='chart'&&typeof chartStarAt==='function'){var star=chartStarAt(e.clientX,e.clientY);if(star){e.preventDefault();toggleSignalMarked(active().signals.indexOf(star));return;}}
    var row=source==='chart'?chartRow(e,false):tableRow(e);if(!row)return;
    if(source==='chart'&&mode==='inspect'){
      e.preventDefault();drag={file:active(),source:'pan',el:canvas,pointerId:e.pointerId,x:e.clientX,y:e.clientY,start:chartState.start,end:chartState.end,rowId:row.rowId,moved:false};
      canvas.setPointerCapture(e.pointerId);return;
    }
    if(mode==='range'){
      e.preventDefault();drag={file:active(),source:source,el:source==='chart'?canvas:table,pointerId:e.pointerId,start:row.rowId,end:row.rowId,x:e.clientX,y:e.clientY,color:toolColor.range};drag.el.setPointerCapture(e.pointerId);
    }else{
      if(mode==='marker'){var hit=source==='chart'?markerNear(e):null;if(hit)row=hit;}
      select('row',row.rowId);
      if(mode==='marker')toggleMarker(row);
    }
  }
  function move(e){
    if(!drag||e.pointerId!==drag.pointerId)return;
    if(drag.source==='pan'){
      if(drag.file!==active()){cancelDrag();return;}
      if(Math.abs(e.clientX-drag.x)<4&&!drag.moved)return;
      drag.moved=true;
      var span=drag.end-drag.start,width=plotBox().width;
      chartState.start=Math.max(0,Math.min(1-span,drag.start-(e.clientX-drag.x)/width*span));
      chartState.end=chartState.start+span;
      document.getElementById('chart-tooltip').classList.remove('visible');hover(-1);
      schedulePan();return;
    }
    var row=drag.source==='chart'?chartRow(e,true):tableRow(e);if(!row)return;drag.end=row.rowId;
    if(drag.source==='chart'){
      var p=plotBox(),x=Math.max(p.left,Math.min(p.box.width-p.right,e.clientX-p.box.left)),startX=drag.x-p.box.left;
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
    record(done.file);
    var range={id:crypto.randomUUID(),start:Math.min(done.start,done.end),end:Math.max(done.start,done.end),color:done.color,note:''};
    ranges(done.file).push(range);selection={file:done.file,type:'range',id:range.id};refresh();
    showToast(window.AppI18n&&AppI18n.t?AppI18n.t('rangeMarkedToast'):txt('Zeitraum markiert. Über „Notiz hinzufügen“ kannst du ihn beschreiben.','Time range marked. Use "Add note" to describe it.'));
  }
  var panFrame=0;
  function schedulePan(){if(!panFrame)panFrame=requestAnimationFrame(function(){panFrame=0;if(S.view==='chart')renderChart();});}
  canvas.addEventListener('pointerdown',function(e){start(e,'chart');});
  table.addEventListener('pointerdown',function(e){start(e,'table');});
  [canvas,table].forEach(function(el){el.addEventListener('pointermove',move);el.addEventListener('pointerup',finish);el.addEventListener('pointercancel',function(){cancelDrag();refresh();});el.addEventListener('lostpointercapture',function(){if(drag){cancelDrag();refresh();}});});
  /* Only real text entry keeps its native Ctrl+Z; sliders, checkboxes and colour fields do not. */
  function editableTarget(el){
    if(!el||!el.closest)return false;
    if(el.closest('textarea,[contenteditable="true"],[contenteditable=""]'))return true;
    var input=el.closest('input');
    return !!input&&/^(text|search|number|email|password|url|tel|time|date|datetime-local)$/i.test(input.type||'text');
  }
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&!dialog.open){cancelDrag();setMode('inspect');refresh();return;}
    var appVisible=document.getElementById('app-view').style.display==='flex';
    if(!appVisible||dialog.open||document.querySelector('dialog[open]')||editableTarget(e.target)||e.altKey)return;
    if(!(e.ctrlKey||e.metaKey))return;
    var key=String(e.key||'').toLowerCase();
    if(key==='z'&&!e.shiftKey){e.preventDefault();undo();}
    else if(key==='y'||(key==='z'&&e.shiftKey)){e.preventDefault();redo();}
  });

  /* Row tints: overlapping ranges are layered like translucent foils, so both stay visible. Own markers win. */
  function tableColors(file){
    var mixed=new Map(),colors=new Map();
    ranges(file).forEach(function(r){
      var c=rgb(r.color);
      for(var id=r.start;id<=r.end;id++){
        var base=mixed.get(id)||[255,255,255];
        mixed.set(id,base.map(function(v,i){return v*(1-RANGE_ALPHA)+c[i]*RANGE_ALPHA;}));
      }
    });
    mixed.forEach(function(value,id){colors.set(id,'rgb('+value.map(Math.round).join(',')+')');});
    file.rawRows.forEach(function(r){if(r.marked)colors.set(r.rowId,tint(r.markerColor||DEFAULT_COLORS.marker));});return colors;
  }
  /* Background layer: tinted ranges (drawn before curves). */
  function draw(ctx,file,rows,left,top,width,height,windowData){
    if(!rows.length)return;
    windowData=windowData||{rows:rows,timeStart:rows[0].elapsedSec||0,timeEnd:rows[rows.length-1].elapsedSec||0};
    ranges(file).forEach(function(r){
      var first=-1,last=-1;rows.forEach(function(row,i){if(row.rowId>=r.start&&row.rowId<=r.end){if(first<0)first=i;last=i;}});if(first<0)return;
      var x1=left+rowChartRatio(rows[first],first,windowData)*width,x2=left+rowChartRatio(rows[last],last,windowData)*width;
      ctx.fillStyle=translucent(r.color,RANGE_ALPHA);ctx.fillRect(x1,top,Math.max(2,x2-x1),height);
      ctx.strokeStyle=validColor(r.color);ctx.lineWidth=1;ctx.strokeRect(x1,top,Math.max(2,x2-x1),height);
    });
  }
  /* Foreground layer: letter badges at the bottom edge for every annotation in view. */
  function drawLabels(ctx,file,rows,left,top,width,height,windowData,scale){
    if(!rows.length)return;scale=scale||1;
    var index=new Map(rows.map(function(row,i){return [row.rowId,i];})),badges=[];
    entries(file).forEach(function(entry){
      var first=-1,last=-1;
      if(entry.type==='range'){rows.forEach(function(row,i){if(row.rowId>=entry.start&&row.rowId<=entry.end){if(first<0)first=i;last=i;}});}
      else if(index.has(entry.id)){first=last=index.get(entry.id);}
      if(first<0)return;
      var x1=left+rowChartRatio(rows[first],first,windowData)*width,x2=left+rowChartRatio(rows[last],last,windowData)*width;
      badges.push({x:entry.type==='range'?Math.max(x1+9*scale,Math.min(x2-9*scale,(x1+x2)/2)):x1,entry:entry});
    });
    if(!badges.length)return;
    var size=15*scale,y=top+height-size-3*scale,lastRight=-Infinity;
    ctx.save();ctx.font='800 '+(9.5*scale)+'px Segoe UI, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    badges.forEach(function(badge){
      var label=badge.entry.letter+(badge.entry.note?'*':''),w=Math.max(size,ctx.measureText(label).width+8*scale);
      var x=Math.max(left+w/2,Math.min(left+width-w/2,badge.x));
      if(x-w/2<lastRight+2*scale)return;
      lastRight=x+w/2;
      ctx.fillStyle=badge.entry.color;ctx.strokeStyle='rgba(19,38,58,.55)';ctx.lineWidth=1;
      ctx.beginPath();if(ctx.roundRect)ctx.roundRect(x-w/2,y,w,size,size/2);else ctx.rect(x-w/2,y,w,size);ctx.fill();ctx.stroke();
      ctx.fillStyle=textOn(badge.entry.color);ctx.fillText(label,x,y+size/2+.5);
    });
    ctx.restore();
  }
  function snapshot(file){
    return {version:2,ranges:ranges(file).map(function(r){return {id:r.id,start:r.start,end:r.end,color:validColor(r.color),note:r.note||''};}),
      rows:file.rawRows.filter(function(r){return r.marked||r.note;}).map(function(r){return {id:r.rowId,color:validColor(r.markerColor,DEFAULT_COLORS.marker),width:validWidth(r.markerWidth),note:r.note||''};}),
      captureMarkers:{visible:txtVisible(file),color:txtColor(file)}};
  }
  function restore(file,data){
    file.ranges=[];file.history={undo:[],redo:[]};if(!data)return;
    if((data.version!==1&&data.version!==2)||!Array.isArray(data.ranges)||!Array.isArray(data.rows))throw new Error(txt('Ungültige Markierungen im Projekt.','Invalid markers in project.'));
    function validId(id){return Number.isInteger(id)&&id>=0&&id<file.rawRows.length;}
    data.rows.forEach(function(r){if(!r||!validId(r.id))throw new Error(txt('Ungültiger Notiz-Zeitpunkt.','Invalid note time.'));var row=file.rawRows[r.id];row.markerColor=validColor(r.color,DEFAULT_COLORS.marker);row.markerWidth=validWidth(r.width);row.note=typeof r.note==='string'?r.note.slice(0,4000):'';});
    data.ranges.forEach(function(r){if(!r||!validId(r.start)||!validId(r.end)||r.start>r.end)throw new Error(txt('Ungültiger markierter Zeitraum.','Invalid marked time range.'));file.ranges.push({id:crypto.randomUUID(),start:r.start,end:r.end,color:validColor(r.color),note:typeof r.note==='string'?r.note.slice(0,4000):''});});
    if(data.captureMarkers){file.txtMarkersVisible=data.captureMarkers.visible!==false;file.txtMarkerColor=validColor(data.captureMarkers.color,TXT_DEFAULT);}
  }
  function exportRows(file){return entries(file).map(function(r){return [r.letter,r.label,file.rawRows[r.start].ts,file.rawRows[r.end].ts,r.color,r.note];});}
  function summary(file){var rows=exportRows(file);return txt('NOTIZEN UND ZEITBEREICHE (gesamte Datei)','NOTES AND TIME RANGES (complete file)')+'\r\n'+(rows.length?rows.map(function(r){return r.join(' | ');}).join('\r\n'):txt('Keine','None'));}
  return {
    validColor:validColor,tint:tint,textOn:textOn,color:function(){return toolColor.marker;},defaultMarkerColor:DEFAULT_COLORS.marker,width:function(){return markerWidth;},validWidth:validWidth,
    captureColor:txtColor,captureVisible:txtVisible,toggleCaptureMarkers:toggleCaptureMarkers,jumpCapture:jumpCapture,
    sync:sync,fileChanged:fileChanged,editRow:editRow,tableColors:tableColors,draw:draw,drawLabels:drawLabels,entries:entries,
    snapshot:snapshot,restore:restore,summary:summary,exportRows:exportRows,hover:hover,notesAt:notesAt,
    record:record,undo:undo,redo:redo,history:history,setMode:setMode,mode:function(){return mode;},
    isDragging:function(){return !!drag;}
  };
})();
