/* Reports: PDF evaluation, chart images and the additional Excel sheets.
   Everything is generated locally in the browser from an immutable export snapshot. */
var ReportExport=(function(){
  'use strict';
  var BLUE=[0,61,117],BLUE2=[0,85,160],ACCENT=[245,168,0],INK=[20,30,45],MUTED=[92,108,126],LINE=[214,226,237],SOFT=[244,248,252],CAPTURE_TINT=[226,238,250];
  var W=297,H=210,M=12;
  var MAX_DETAIL_CHARTS=12,MAX_CAPTURE_CHARTS=16,MAX_EXCERPT_ROWS=120,MAX_LANES_PER_PAGE=10;
  function en(){return currentLang()==='en';}
  function L(de,enText){return en()?enText:de;}
  function clean(value,max){
    var text=String(value==null?'':value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/\r/g,'').replace(/[–—]/g,'-').replace(/[„“”]/g,'"').trim();
    return max&&text.length>max?text.slice(0,max-1)+'…':text;
  }
  function hexRgb(hex){hex=/^#[0-9a-f]{6}$/i.test(hex||'')?hex:'#cccccc';return [1,3,5].map(function(i){return parseInt(hex.slice(i,i+2),16);});}
  function rowsOf(file){return file.filtered&&file.filtered.length?file.filtered:file.rawRows;}
  function numericSignals(file){return visibleSignals(file).filter(function(s){return isChartSignal(file,s)&&!isStateSignal(s);});}
  function capturedSignals(file){return visibleSignals(file).filter(function(s){return isChartSignal(file,s);});}
  function signalStats(file,signal,rows){
    var min=Infinity,max=-Infinity,sum=0,n=0;
    (rows||rowsOf(file)).forEach(function(row){var v=numericAt(row,signal.index);if(v===null)return;if(v<min)min=v;if(v>max)max=v;sum+=v;n++;});
    return n?{min:min,max:max,mean:sum/n,count:n}:{min:null,max:null,mean:null,count:0};
  }
  function fmt(value,digits){if(value===null||value===undefined||!isFinite(value))return '-';return Number(value).toLocaleString(locale(),{maximumFractionDigits:digits==null?2:digits});}
  function seconds(value){return fmt(value,value<100?2:1)+' s';}
  function relSec(file,row){var first=file.rawRows[0];return Math.max(0,(row.elapsedSec||0)-(first?first.elapsedSec||0:0));}
  function deviceOf(s){var id=clean(s.id,120),p=id.indexOf('-');return s.sourceFormat==='SWS'?'':(p>0?id.substring(0,p):'');}
  function descOf(s){return clean(s.desc||s.displayName||s.id,160);}
  function nameOf(s){return clean(s.displayName||s.desc||s.id,160);}
  function signalHeader(s){return clean(nameOf(s),70)+(s.unit?'\n['+clean(s.unit,16)+']':'');}
  function cellValue(row,s){return clean((row.parts[s.index]||'').trim(),24)||'-';}
  function annotationEntries(file){return window.Annotations&&Annotations.entries?Annotations.entries(file):[];}
  function captureEvents(file,rows){return typeof markerEvents==='function'?markerEvents(file,rows):[];}
  function durationLabel(file,entry){var a=file.rawRows[entry.start],b=file.rawRows[entry.end];return entry.end>entry.start?seconds(Math.max(0,b.elapsedSec-a.elapsedSec)):'-';}
  function typeLabel(entry){return entry.type==='range'?L('Zeitraum','Time range'):(entry.marked?L('Marker','Marker'):L('Notiz','Note'));}

  /* ---------- Chart images ---------- */
  function chartImage(file,opts){
    opts=opts||{};
    var rows=rowsOf(file),all=chartSelection(file).signals,signals=opts.signals||all;
    if(!signals.length||!rows||!rows.length)return null;
    var canvas=document.createElement('canvas');
    var layout=drawChartCanvas(canvas,file,rows,signals,{export:true,width:opts.width||1600,height:opts.height||900,dpr:opts.dpr||2,scale:opts.scale||1,window:opts.window,title:opts.title,subtitle:opts.subtitle,colorSignals:all});
    return layout?{canvas:canvas,layout:layout}:null;
  }
  function laneWeight(file,signals){return chartLanes(file,signals).reduce(function(sum,lane){return sum+lane.weight;},0);}
  /* Splits the chart curves into page-sized groups (an overlay lane counts as one lane). */
  function chartGroups(file,maxLanes){
    var groups=[],current=[],count=0;
    chartLanes(file,chartSelection(file).signals).forEach(function(lane){
      if(count>=maxLanes){groups.push(current);current=[];count=0;}
      current=current.concat(lane.signals);count++;
    });
    if(current.length)groups.push(current);
    return groups;
  }
  /* Tall enough that every lane keeps its readable height: many signals make the image taller, never squeezed. */
  function imageHeight(file,base,perLane,scale){return Math.max(base,Math.round((40+56)*scale+laneWeight(file,chartSelection(file).signals)*perLane));}
  function isZoomed(file){var w=file.chartWindow;return !!w&&(w.start>0.0005||w.end<0.9995);}
  function periodLabel(file,windowData){
    var rows=windowData&&windowData.rows&&windowData.rows.length?windowData.rows:rowsOf(file);
    return rows[0].ts+' '+L('bis','to')+' '+rows[rows.length-1].ts;
  }
  /* Full-range PNG (plus current view when zoomed) for the support ZIP: wide 16:9, not squeezed. */
  function chartPngs(file){
    var base=clean(file.filename,80),list=[];
    var pngHeight=imageHeight(file,1080,66,1.15);
    var full=chartImage(file,{width:1920,height:pngHeight,dpr:2,scale:1.15,title:L('Kurvendiagramm','Curve chart')+' · '+base,subtitle:L('Gesamter Zeitraum ','Full time range ')+periodLabel(file)});
    if(full)list.push({name:'full',canvas:full.canvas});
    if(isZoomed(file)){
      var view=chartImage(file,{width:1920,height:pngHeight,dpr:2,scale:1.15,window:'current',title:L('Kurvendiagramm','Curve chart')+' · '+base,subtitle:L('Ausschnitt','Zoomed view')});
      if(view){view.canvas.getContext('2d');list.push({name:'view',canvas:view.canvas});}
    }
    return list;
  }
  function canvasBlob(canvas,type,quality){return new Promise(function(resolve){canvas.toBlob(function(blob){resolve(blob);},type||'image/png',quality==null?1:quality);});}

  /* Wordmark from the app header, flattened onto the header blue (JPEG keeps the PDF small).
     Returns null when the image cannot be read (e.g. file:// pages); the header then falls back to text. */
  var wordmarkCache;
  function wordmark(){
    if(wordmarkCache!==undefined)return wordmarkCache;
    wordmarkCache=null;
    try{
      var img=document.querySelector('.h-brand-wordmark');
      if(img&&img.complete&&img.naturalWidth){
        var canvas=document.createElement('canvas'),scale=Math.min(1,900/img.naturalWidth);
        canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);
        var ctx=canvas.getContext('2d');ctx.fillStyle='rgb('+BLUE.join(',')+')';ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.drawImage(img,0,0,canvas.width,canvas.height);
        wordmarkCache={data:canvas.toDataURL('image/jpeg',.92),ratio:img.naturalWidth/img.naturalHeight};
      }
    }catch(error){wordmarkCache=null;}
    return wordmarkCache;
  }

  /* ---------- PDF ---------- */
  /* Chapters that can be switched off in the PDF dialog. The summary page with contents is always included. */
  var SECTIONS=['chart','zoom','details','capture','pairs','notes','stats','overview','excerpt'];
  function sectionSwitches(value){var on={};SECTIONS.forEach(function(key){on[key]=!value||value[key]!==false;});return on;}
  function pairReport(file){return window.ChartPairs&&ChartPairs.report?ChartPairs.report(file):[];}
  function pdf(options){
    options=options||{};
    var on=sectionSwitches(options.sections);
    var files=(options.files&&options.files.length?options.files:[options.file||captureExportState(active()).file]).filter(function(item){var r=rowsOf(item);return r&&r.length;});
    if(!files.length){alert(t('noData'));return null;}
    /* Several files: overview cover, then one chapter per recording. Page headers carry "1/2 ·". */
    var multi=files.length>1,filePrefix='',fileLevel=0,fileStarts=[],tocY=71,currentFile=-1;
    var doc=new window.jspdf.jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    var toc=[],createdAt=new Date().toLocaleString(locale());

    function header(section){
      doc.setFillColor.apply(doc,BLUE);doc.rect(0,0,W,15,'F');doc.setFillColor.apply(doc,ACCENT);doc.rect(0,15,W,1.4,'F');
      doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(11.5);
      var logo=wordmark(),sectionX;
      if(logo){var logoH=7.6,logoW=logoH*logo.ratio;doc.addImage(logo.data,'JPEG',M,3.7,logoW,logoH,'signalerfassung-wordmark','FAST');sectionX=M+logoW+8;}
      else{var brand=L('Signalerfassung','Signal Capture');doc.text(brand,M,9.7);sectionX=M+doc.getTextWidth(brand)+8;}
      doc.setDrawColor(120,160,200);doc.setLineWidth(.3);doc.line(sectionX-4,5.5,sectionX-4,11);
      doc.setFont('helvetica','normal');doc.setFontSize(8.5);doc.setTextColor(206,223,240);
      doc.text(clean(section,70),sectionX,9.7);
      doc.setFont('helvetica','bold');doc.setFontSize(8.5);doc.setTextColor(255,255,255);
      doc.text('BREUER TRUCK & TRAILER',W-M,8.2,{align:'right'});
      doc.setFont('helvetica','normal');doc.setFontSize(6.8);doc.setTextColor(206,223,240);
      doc.text(L('Diagnosebericht · Support / Eskalation','Diagnostic report · Support / escalation'),W-M,12.2,{align:'right'});
    }
    function newPage(section,title,subtitle){
      doc.addPage('a4','landscape');header(filePrefix+section);
      toc.push({title:section,page:doc.internal.getNumberOfPages(),level:fileLevel,file:currentFile});
      if(title)pageTitle(title,subtitle);
    }
    function continuationPage(section){doc.addPage('a4','landscape');header(section);}
    function pageTitle(title,subtitle){
      doc.setTextColor.apply(doc,INK);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(clean(title,110),M,25.5);
      if(subtitle){doc.setFont('helvetica','normal');doc.setFontSize(8.6);doc.setTextColor.apply(doc,MUTED);doc.text(doc.splitTextToSize(clean(subtitle,400),W-2*M),M,31);}
    }
    function table(opts){
      var section=opts._section||'';delete opts._section;delete opts._startPage;
      doc.autoTable(Object.assign({
        theme:'grid',margin:{left:M,right:M,top:22,bottom:14},
        styles:{font:'helvetica',fontSize:8,cellPadding:1.8,overflow:'linebreak',valign:'middle',lineColor:LINE,lineWidth:.15,textColor:INK},
        headStyles:{fillColor:BLUE,textColor:[255,255,255],fontStyle:'bold',halign:'center'},
        alternateRowStyles:{fillColor:[248,250,252]}
      },opts,{didDrawPage:function(){header(filePrefix+section);}}));
    }
    function note(text,y){
      doc.setFillColor(255,247,214);doc.setDrawColor(245,168,0);doc.setLineWidth(.3);
      doc.setFont('helvetica','normal');doc.setFontSize(8.3);
      var lines=doc.splitTextToSize(clean(text,900),W-2*M-8),h=lines.length*4+6;
      doc.roundedRect(M,y,W-2*M,h,2,2,'FD');doc.setTextColor(74,52,16);doc.setFont('helvetica','normal');doc.setFontSize(8.3);doc.text(lines,M+4,y+5.2);
      return y+h;
    }

    function renderFile(file,fileIndex){
    var rows=rowsOf(file);
    var chartSel=chartSelection(file),allSignals=file.signals||[],visible=visibleSignals(file);
    var events=captureEvents(file,rows),entries=annotationEntries(file).filter(function(entry){return rows.some(function(row){return row.rowId>=entry.start&&row.rowId<=entry.end;});});
    var isSws=file.sourceFormat==='SWS';
    filePrefix=multi?(fileIndex+1)+'/'+files.length+' \u00b7 ':'';currentFile=fileIndex;
    /* Summary page of this recording (page 1 for a single file) */
    if(multi){
      fileLevel=0;newPage(L('Zusammenfassung','Summary'));
      toc[toc.length-1].title=L('Messung ','Recording ')+(fileIndex+1)+': '+clean(file.filename,52);
      fileLevel=1;
    }else{header(L('Zusammenfassung','Summary'));toc.push({title:L('Zusammenfassung','Summary'),page:1,level:0});}
    fileStarts.push({page:doc.internal.getNumberOfPages(),name:file.filename,file:fileIndex});
    doc.setTextColor.apply(doc,INK);doc.setFont('helvetica','bold');doc.setFontSize(20);
    doc.text(multi?L('Messung ','Recording ')+(fileIndex+1)+' '+L('von','of')+' '+files.length:L('Diagnosebericht Signalerfassung','Signal capture diagnostic report'),M,29);
    doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor.apply(doc,MUTED);
    doc.text(clean(file.filename,90)+'  ·  '+L('Messdatum ','Measurement date ')+clean(file.date,20)+'  ·  '+L('erstellt ','created ')+createdAt,M,35.5);
    var duration=secToHMS(Math.max(0,(rows[rows.length-1].elapsedSec||0)-(rows[0].elapsedSec||0)));
    var tiles=[
      [duration,L('Dauer (Auswertung)','Duration (evaluated)')],
      [fmtNumber(rows.length)+' / '+fmtNumber(file.rawRows.length),L('Messzeilen','Measurement rows')],
      [chartSel.signals.length+' / '+visible.length,L('Kurven / sichtbare Signale','Curves / visible signals')],
      [String(events.length),L('Erfassungsmarker','Capture markers')],
      [String(entries.filter(function(e){return e.type!=='range';}).length),L('Eigene Marker & Notizen','Own markers & notes')],
      [String(entries.filter(function(e){return e.type==='range';}).length),L('Markierte Zeiträume','Marked time ranges')]
    ];
    var tileW=(W-2*M-5*4)/6;
    tiles.forEach(function(tile,i){
      var x=M+i*(tileW+4),y=42;
      doc.setFillColor.apply(doc,SOFT);doc.setDrawColor.apply(doc,LINE);doc.setLineWidth(.3);doc.roundedRect(x,y,tileW,22,2.5,2.5,'FD');
      doc.setFillColor.apply(doc,i===3?ACCENT:BLUE2);doc.rect(x,y+3,1.2,16,'F');
      doc.setTextColor.apply(doc,BLUE);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(clean(tile[0],18),x+5,y+11);
      doc.setTextColor.apply(doc,MUTED);doc.setFont('helvetica','bold');doc.setFontSize(6.6);doc.text(clean(tile[1],40).toUpperCase(),x+5,y+17.5);
    });
    var rate=file.rawRows.length>1?(file.rawRows.length/Math.max(.001,recordingDuration(file))).toFixed(1)+' Hz':'-';
    var filterText=(file.filterFrom||'-')+' '+L('bis','to')+' '+(file.filterTo||'-')+(file.filterSearch?' · '+L('Suche','Search')+' "'+clean(file.filterSearch,30)+'"':'');
    var info=[
      [L('Datei','File'),clean(file.filename,90)],
      [L('Messdatum','Measurement date'),clean(file.date,30)+' ('+clean(file.dateSource,20)+')'],
      [L('Quellformat','Source format'),file.sourceFormat+(isSws?' · '+L('ohne Steuergerät/Signal-ID','without ECU/signal ID'):'')],
      [L('Aufzeichnung','Recording'),file.rawRows[0].ts+' '+L('bis','to')+' '+file.rawRows[file.rawRows.length-1].ts+' · '+secToHMS(recordingDuration(file))],
      [L('Zeitfilter','Time filter'),filterText],
      [L('Abtastrate','Sample rate'),rate],
      [L('Signale','Signals'),visible.length+' '+L('sichtbar','visible')+' / '+allSignals.length+' '+L('gesamt','total')+' · '+allSignals.filter(function(s){return s.marked;}).length+' '+L('markiert','starred')]
    ];
    doc.autoTable({startY:71,margin:{left:M,right:W/2+3},theme:'grid',head:[[L('Messung','Measurement'),'']],body:info,
      styles:{font:'helvetica',fontSize:8.2,cellPadding:2,overflow:'linebreak',lineColor:LINE,lineWidth:.15,textColor:INK},
      headStyles:{fillColor:BLUE,textColor:[255,255,255],fontStyle:'bold'},columnStyles:{0:{cellWidth:34,fontStyle:'bold',fillColor:[234,242,250]}}});
    doc.setFillColor.apply(doc,BLUE);doc.rect(W/2+3,71,W/2-3-M,7.5,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(8.2);doc.text(multi?L('Inhalt dieser Messung','Contents of this recording'):L('Inhalt dieses Berichts','Contents of this report'),W/2+5,76);
    var noteY=Math.max(doc.lastAutoTable.finalY+6,150);
    note(L('Dieser Bericht ist für die schnelle Sichtung gedacht. Vollständige Messdaten mit allen Spalten enthält der Excel-Export (Blatt "Messdaten"). Kurven werden je Spur auf ihren eigenen Wertebereich skaliert; Min und Max stehen links neben jeder Spur. Erfassungsmarker (Kasten mit Nummer oben) stammen vom Markerknopf während der Messfahrt, eigene Marker und Zeiträume sind mit Buchstaben unten gekennzeichnet.',
      'This report is meant for quick review. The Excel export (sheet "Measurement data") contains the complete measurements. Each lane is scaled to its own value range; min and max are shown left of each lane. Capture markers (numbered boxes at the top) come from the marker button during the test drive; own markers and time ranges carry letters at the bottom.')+(isSws?' '+L('SWS liefert keine Steuergeräte- und Signal-IDs; diese sind als fehlend gekennzeichnet.','SWS provides no ECU or signal IDs; they are marked as missing.'):''),noteY);

    /* Chart pages */
    function chartBox(windowOpt,x,y,w,h,scale,signals){
      scale=scale||1;var pxPerMm=4.8*scale,pxW=Math.round(w*pxPerMm),pxH=Math.round(h*pxPerMm);
      var img=chartImage(file,{width:pxW,height:pxH,dpr:1.9,scale:scale,window:windowOpt,signals:signals});
      if(!img){doc.setTextColor.apply(doc,MUTED);doc.setFontSize(10);doc.text(L('Keine numerischen Signale für das Diagramm ausgewählt.','No numeric signals selected for the chart.'),x,y+10);return null;}
      doc.addImage(img.canvas.toDataURL('image/jpeg',.86),'JPEG',x,y,w,h,undefined,'FAST');
      doc.setDrawColor.apply(doc,LINE);doc.setLineWidth(.3);doc.rect(x,y,w,h);
      return img;
    }
    function legend(y){
      doc.setFontSize(7.4);doc.setFont('helvetica','normal');var x=M;
      function item(color,label,shape){
        doc.setFillColor.apply(doc,color);
        if(shape==='box')doc.rect(x,y-2.6,4,3,'F');else if(shape==='line')doc.rect(x+1.5,y-3,1,3.6,'F');else doc.circle(x+1.8,y-1.1,1.7,'F');
        doc.setTextColor.apply(doc,MUTED);doc.text(label,x+5.5,y);x+=doc.getTextWidth(label)+12;
      }
      if(events.length&&captureMarkersShown(file))item(hexRgb(captureMarkerColor(file)),L('Erfassungsmarker (Nummer oben)','Capture marker (number at top)'),'box');
      if(entries.some(function(e){return e.type!=='range';}))item(hexRgb(window.Annotations?Annotations.defaultMarkerColor:'#e4002b'),L('Eigener Marker (Buchstabe unten, * = mit Notiz)','Own marker (letter at bottom, * = with note)'),'line');
      if(entries.some(function(e){return e.type==='range';}))item([255,224,138],L('Markierter Zeitraum','Marked time range'),'box');
      item(MUTED,L('Jede Spur mit eigener Skala; überlagerte Spuren gemeinsam','Each lane has its own scale; overlaid lanes are combined'),'dot');
    }
    var groups=chartGroups(file,MAX_LANES_PER_PAGE),firstGroup=groups[0]||[];
    function groupNote(group,index){
      if(groups.length<2)return '';
      var from=chartSel.signals.indexOf(group[0])+1,to=chartSel.signals.indexOf(group[group.length-1])+1;
      return ' · '+L('Kurven ','curves ')+from+'-'+to+' '+L('von','of')+' '+chartSel.signals.length+' ('+L('Seite ','page ')+(index+1)+'/'+groups.length+')';
    }
    function chartPages(section,title,subtitle,windowOpt){
      (groups.length?groups:[[]]).forEach(function(group,gi){
        newPage(section,title,subtitle+groupNote(group,gi));
        if(gi)toc.pop();
        chartBox(windowOpt,M,35,W-2*M,H-35-21,1.12,group.length?group:null);legend(H-14.5);
      });
    }
    if(on.chart)chartPages(L('Kurvendiagramm','Curve chart'),L('Kurvendiagramm · gesamter Zeitraum','Curve chart · full time range'),chartSel.signals.length+' '+L('Kurven','curves')+' · '+fmtNumber(rows.length)+' '+L('Messpunkte','points')+' · '+periodLabel(file),null);
    if(on.zoom&&isZoomed(file)){
      var zoomRows=chartWindowRows(rows,file.chartWindow).rows;
      chartPages(L('Kurvendiagramm · Ausschnitt','Curve chart · zoomed view'),L('Kurvendiagramm · aktueller Ausschnitt','Curve chart · current view'),zoomRows[0].ts+' '+L('bis','to')+' '+zoomRows[zoomRows.length-1].ts+' · '+L('wie zuletzt in der App angezeigt','as last shown in the app'),'current');
    }
    var detailNote=groups.length>1?' '+L('Detailansichten zeigen die ersten '+firstGroup.length+' von '+chartSel.signals.length+' Kurven.','Detail views show the first '+firstGroup.length+' of '+chartSel.signals.length+' curves.'):'';

    /* Detail charts: one page per marked range or own marker */
    var details=on.details?entries.slice(0,MAX_DETAIL_CHARTS):[];
    details.forEach(function(entry,i){
      var from=file.rawRows[entry.start],to=file.rawRows[entry.end];
      var head=entry.letter+' · '+typeLabel(entry)+' · '+from.ts+(entry.end>entry.start?' '+L('bis','to')+' '+to.ts+' ('+durationLabel(file,entry)+')':'');
      newPage(L('Detailansichten','Detail views'),L('Detail ','Detail ')+head,(entry.note?L('Notiz: ','Note: ')+entry.note.replace(/\s+/g,' '):L('Ohne Notiz.','No note.'))+detailNote);
      if(i)toc.pop();
      doc.setFillColor.apply(doc,hexRgb(entry.color));doc.rect(M-4,20.5,1.6,6.5,'F');
      chartBox({start:entry.start,end:entry.end,padding:entry.end>entry.start?.25:0,minPadSec:entry.end>entry.start?2:6},M,38,W-2*M,H-38-21,1,firstGroup);legend(H-14.5);
    });
    if(details.length&&entries.length>details.length){doc.setFontSize(8);doc.setTextColor.apply(doc,MUTED);doc.text(L('Weitere '+(entries.length-details.length)+' Markierungen siehe Tabelle "Notizen & Markierungen".','Another '+(entries.length-details.length)+' markings: see table "Notes & markers".'),M,H-11.2);}

    /* Capture markers: values table and small detail charts */
    if(on.capture&&events.length){
      var captureSignals=chartSel.signals.slice(0,8);
      newPage(L('Erfassungsmarker','Capture markers'),L('Erfassungsmarker · Messwerte zum Zeitpunkt des Knopfdrucks','Capture markers · values at the moment of the button press'),events.length+' '+L('Knopfdrücke während der Messfahrt. Werte der Diagramm-Signale in der Zeile des Markers.','button presses during the test drive. Values of the chart signals in the marker row.'));
      table({_section:L('Erfassungsmarker','Capture markers'),_startPage:doc.internal.getNumberOfPages(),startY:36,
        head:[[L('Nr.','No.'),L('Zeitstempel','Timestamp'),L('t ab Start','t from start')].concat(captureSignals.map(signalHeader))],
        body:events.map(function(event){return [String(event.value),event.row.ts,seconds(relSec(file,event.row))].concat(captureSignals.map(function(s){return cellValue(event.row,s);}));}),
        styles:{font:'helvetica',fontSize:7.4,cellPadding:1.6,overflow:'linebreak',valign:'middle',lineColor:LINE,lineWidth:.15,textColor:INK,halign:'center'},
        headStyles:{fillColor:BLUE,textColor:[255,255,255],fontStyle:'bold',halign:'center',fontSize:6.8},
        columnStyles:{0:{cellWidth:11,fontStyle:'bold',fillColor:CAPTURE_TINT},1:{cellWidth:27,font:'courier'},2:{cellWidth:19}}});
      if(captureMarkersShown(file)){
        var shownEvents=events.slice(0,MAX_CAPTURE_CHARTS),boxW=W-2*M,boxH2=72;
        shownEvents.forEach(function(event,i){
          var slot=i%2;
          if(!slot)newPage(L('Erfassungsmarker im Detail','Capture markers in detail'),L('Erfassungsmarker im Detail · je ±8 Sekunden','Capture markers in detail · ±8 seconds each'),detailNote?detailNote.trim():null);
          if(!slot&&i)toc.pop();
          var x=M,y=slot?119:37;
          doc.setFillColor.apply(doc,hexRgb(captureMarkerColor(file)));doc.rect(x,y-5,7,4.6,'F');
          doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text(String(event.value),x+3.5,y-1.7,{align:'center'});
          doc.setTextColor.apply(doc,INK);doc.setFontSize(8.6);doc.text(L('Erfassungsmarker ','Capture marker ')+event.value+' · '+event.row.ts,x+9,y-1.7);
          chartBox({start:event.row.rowId,end:event.row.rowId,padding:0,minPadSec:8},x,y,boxW,boxH2,.9,firstGroup);
        });
        if(events.length>shownEvents.length){doc.setFontSize(8);doc.setTextColor.apply(doc,MUTED);doc.text(L('Weitere '+(events.length-shownEvents.length)+' Erfassungsmarker stehen in der Tabelle.','Another '+(events.length-shownEvents.length)+' capture markers are listed in the table.'),M,H-14);}
      }
    }

    /* Set/actual deviations of the active pairs */
    var pairs=on.pairs?pairReport(file):[];
    if(pairs.length){
      newPage(L('Soll/Ist-Abweichungen','Setpoint/actual deviations'),L('Soll/Ist-Abweichungen','Setpoint/actual deviations'),L('Zeiträume, in denen Soll- und Istwert länger als die Mindestdauer weiter als die Toleranz auseinanderliegen. Im Diagramm rot hinterlegt.','Periods in which setpoint and actual value differ by more than the tolerance for longer than the minimum duration. Shaded red in the chart.'));
      var pairBody=[];
      pairs.forEach(function(pair){
        var label=clean(nameOf(pair.set),60)+' / '+clean(nameOf(pair.act),60),unit=pair.unit&&!/^[-–]$/.test(String(pair.unit).trim())?' '+clean(pair.unit,12):'',limits=L('Toleranz ','Tolerance ')+fmt(pair.tol,3)+unit+' · '+L('ab ','from ')+fmt(pair.dur,1)+' s';
        if(!pair.list.length)pairBody.push([label,limits,'-','-','-',L('Keine Abweichung über der Toleranz','No deviation above the tolerance')]);
        pair.list.forEach(function(d,i){pairBody.push([i?'':label,i?'':limits,d.from.ts,d.to.ts,seconds(d.duration),fmt(d.maxDev,3)+unit]);});
      });
      table({_section:L('Soll/Ist-Abweichungen','Setpoint/actual deviations'),_startPage:doc.internal.getNumberOfPages(),startY:36,
        head:[[L('Soll / Ist','Setpoint / actual'),L('Grenzen','Limits'),L('Von','From'),L('Bis','To'),L('Dauer','Duration'),L('Max. Abweichung','Max. deviation')]],
        body:pairBody,
        columnStyles:{0:{cellWidth:'auto',fontStyle:'bold'},1:{cellWidth:46},2:{cellWidth:29,font:'courier'},3:{cellWidth:29,font:'courier'},4:{cellWidth:20,halign:'center'},5:{cellWidth:34,halign:'right'}}});
    }

    /* Notes and markers */
    if(on.notes&&entries.length){
      newPage(L('Notizen & Markierungen','Notes & markers'),L('Notizen & Markierungen','Notes & markers'),L('Buchstaben entsprechen den Kennungen im Diagramm.','Letters match the labels in the chart.'));
      table({_section:L('Notizen & Markierungen','Notes & markers'),_startPage:doc.internal.getNumberOfPages(),startY:36,
        head:[[L('Kennung','Label'),L('Typ','Type'),L('Von','From'),L('Bis','To'),L('Dauer','Duration'),L('Notiz','Note')]],
        body:entries.map(function(entry){return [entry.letter,typeLabel(entry),file.rawRows[entry.start].ts,file.rawRows[entry.end].ts,durationLabel(file,entry),clean(entry.note,1200)||'-'];}),
        columnStyles:{0:{cellWidth:17,halign:'center',fontStyle:'bold'},1:{cellWidth:22},2:{cellWidth:29,font:'courier'},3:{cellWidth:29,font:'courier'},4:{cellWidth:18,halign:'center'},5:{cellWidth:'auto'}},
        didParseCell:function(data){if(data.section==='body'&&data.column.index===0){var entry=entries[data.row.index];data.cell.styles.fillColor=hexRgb(entry.color);data.cell.styles.textColor=window.Annotations&&Annotations.textOn(entry.color)==='#ffffff'?[255,255,255]:INK;}}});
    }

    /* Statistics */
    var statSignals=on.stats?numericSignals(file):[];
    if(statSignals.length){
      newPage(L('Signalstatistik','Signal statistics'),L('Signalstatistik im ausgewerteten Zeitraum','Signal statistics for the evaluated period'),periodLabel(file)+' · '+fmtNumber(rows.length)+' '+L('Messzeilen','rows'));
      table({_section:L('Signalstatistik','Signal statistics'),_startPage:doc.internal.getNumberOfPages(),startY:36,
        head:[[L('Steuergerät','ECU'),L('Signal','Signal'),L('Einheit','Unit'),'Min','Max',L('Mittelwert','Mean'),L('Werte','Values'),L('Im Diagramm','In chart')]],
        body:statSignals.map(function(s){var st=signalStats(file,s,rows);return [deviceOf(s)||'-',descOf(s),clean(s.unit,16)||'-',fmt(st.min),fmt(st.max),fmt(st.mean),fmtNumber(st.count),chartSel.signals.indexOf(s)>=0?L('ja','yes'):'-'];}),
        columnStyles:{0:{cellWidth:24},1:{cellWidth:'auto'},2:{cellWidth:18,halign:'center'},3:{cellWidth:24,halign:'right'},4:{cellWidth:24,halign:'right'},5:{cellWidth:26,halign:'right'},6:{cellWidth:20,halign:'right'},7:{cellWidth:22,halign:'center'}}});
    }

    /* Signal overview */
    if(on.overview){
    newPage(L('Signalübersicht','Signal overview'),L('Signalübersicht','Signal overview'),L('Alle erfassten Signale mit Status, Einheit und Signal-ID.','All captured signals with status, unit and signal ID.'));
    table({_section:L('Signalübersicht','Signal overview'),_startPage:doc.internal.getNumberOfPages(),startY:36,
      head:[[L('Status','Status'),L('Steuergerät','ECU'),L('Sensor / Bezeichnung','Sensor / description'),L('Einheit','Unit'),'Signal-ID']],
      body:allSignals.map(function(s){
        var status=(s.hidden?t('hidden'):t('visible'))+(s.marked?' / '+t('marked'):'');
        var device=isSws?(/^Marker$/i.test(s.id)?'-':t('missingSws')):(deviceOf(s)||'-');
        var id=clean(s.technicalId,100)||(isSws&&!/^Marker$/i.test(s.id)?t('missingSws'):clean(s.id,100));
        return [status,device,descOf(s),clean(s.unit,20)||'-',id];
      }),
      columnStyles:{0:{cellWidth:34,fontStyle:'bold'},1:{cellWidth:30},2:{cellWidth:'auto'},3:{cellWidth:18,halign:'center'},4:{cellWidth:80}},
      didParseCell:function(data){if(data.section!=='body')return;var s=allSignals[data.row.index];if(s.marked)data.cell.styles.fillColor=[255,241,184];if(s.hidden)data.cell.styles.textColor=[110,120,135];}});
    }

    /* Measurement excerpt: rows around markings, otherwise the first rows */
    var refs=new Map();
    function addRef(rowId,label){if(!refs.has(rowId))refs.set(rowId,[]);refs.get(rowId).push(label);}
    events.forEach(function(event){addRef(event.row.rowId,'M'+event.value);});
    entries.forEach(function(entry){if(entry.end>entry.start){addRef(entry.start,entry.letter+' '+L('Anfang','start'));addRef(entry.end,entry.letter+' '+L('Ende','end'));}else addRef(entry.start,entry.letter);});
    var allowed=new Set(rows.map(function(row){return row.rowId;}));
    var excerptIds=Array.from(refs.keys()).filter(function(id){return allowed.has(id);}).sort(function(a,b){return a-b;});
    var excerpt=excerptIds.length?excerptIds.slice(0,MAX_EXCERPT_ROWS).map(function(id){return file.rawRows[id];}):rows.slice(0,150);
    var excerptNote=excerptIds.length
      ?(excerptIds.length>MAX_EXCERPT_ROWS?L(MAX_EXCERPT_ROWS+' von '+fmtNumber(excerptIds.length)+' Bezugszeilen. ',MAX_EXCERPT_ROWS+' of '+fmtNumber(excerptIds.length)+' reference rows. '):L('Zeilen an Erfassungsmarkern (M), eigenen Markern sowie Anfang und Ende markierter Zeiträume. ','Rows at capture markers (M), own markers and the start and end of marked time ranges. '))+L('Vollständige Daten im Excel-Export.','Complete data in the Excel export.')
      :L('Erste '+excerpt.length+' von '+fmtNumber(rows.length)+' Messzeilen (keine Markierungen gesetzt). Vollständige Daten im Excel-Export.','First '+excerpt.length+' of '+fmtNumber(rows.length)+' rows (no markings set). Complete data in the Excel export.');
    var rowTints=new Map();
    if(window.Annotations)Annotations.tableColors(file).forEach(function(value,id){rowTints.set(id,(value.match(/\d+/g)||[]).map(Number));});
    var dataSignals=visible.filter(function(s){return !/^Marker$/i.test(s.id);}),chunk=6,excerptGroups=[];
    for(var c=0;c<dataSignals.length;c+=chunk)excerptGroups.push(dataSignals.slice(c,c+chunk));
    if(!excerptGroups.length)excerptGroups=[[]];
    if(!on.excerpt)excerptGroups=[];
    excerptGroups.forEach(function(group,gi){
      var section=L('Messdaten-Auszug','Measurement excerpt')+(excerptGroups.length>1?' '+(gi+1)+'/'+excerptGroups.length:'');
      newPage(section,section,excerptNote);
      if(gi)toc.pop();
      table({_section:section,_startPage:doc.internal.getNumberOfPages(),startY:36,
        head:[[L('Zeitstempel','Timestamp'),L('Bezug','Ref.')].concat(group.map(signalHeader))],
        body:excerpt.map(function(row){return [row.ts,(refs.get(row.rowId)||[]).join(' ')].concat(group.map(function(s){return cellValue(row,s);}));}),
        styles:{font:'helvetica',fontSize:7.2,cellPadding:1.5,overflow:'linebreak',valign:'middle',lineColor:LINE,lineWidth:.15,textColor:INK,halign:'center'},
        headStyles:{fillColor:BLUE,textColor:[255,255,255],fontStyle:'bold',halign:'center',fontSize:6.6},
        columnStyles:{0:{cellWidth:28,font:'courier',halign:'left'},1:{cellWidth:16,fontStyle:'bold'}},
        didParseCell:function(data){
          if(data.section!=='body')return;var row=excerpt[data.row.index],ref=refs.get(row.rowId);if(!ref)return;
          if(ref.some(function(r){return /^M\d/.test(r);}))data.cell.styles.fillColor=CAPTURE_TINT;
          var tint=rowTints.get(row.rowId);
          if(tint)data.cell.styles.fillColor=tint;
        }});
    });

    }

    /* Cover for several recordings: totals, comparison table, contents */
    function renderCover(){
      header(L('\u00dcbersicht','Overview'));toc.push({title:L('\u00dcbersicht aller Messungen','Overview of all recordings'),page:1,level:0,file:-1});
      fileStarts.push({page:1,name:files.length+' '+L('Messungen','recordings')});
      doc.setTextColor.apply(doc,INK);doc.setFont('helvetica','bold');doc.setFontSize(20);
      doc.text(L('Diagnosebericht Signalerfassung','Signal capture diagnostic report'),M,29);
      doc.setFont('helvetica','normal');doc.setFontSize(9.5);doc.setTextColor.apply(doc,MUTED);
      doc.text(files.length+' '+L('Messungen','recordings')+'  \u00b7  '+L('erstellt ','created ')+createdAt,M,35.5);
      var stats=files.map(function(item){var r=rowsOf(item),list=annotationEntries(item);return {rows:r.length,duration:Math.max(0,(r[r.length-1].elapsedSec||0)-(r[0].elapsedSec||0)),events:captureEvents(item,r).length,own:list.filter(function(e){return e.type!=='range';}).length,ranges:list.filter(function(e){return e.type==='range';}).length,curves:chartSelection(item).signals.length};});
      function sum(key){return stats.reduce(function(total,item){return total+item[key];},0);}
      var tiles=[[String(files.length),L('Messungen','Recordings')],[secToHMS(sum('duration')),L('Dauer gesamt','Total duration')],[fmtNumber(sum('rows')),L('Messzeilen','Measurement rows')],[String(sum('events')),L('Erfassungsmarker','Capture markers')],[String(sum('own')),L('Eigene Marker & Notizen','Own markers & notes')],[String(sum('ranges')),L('Markierte Zeitr\u00e4ume','Marked time ranges')]];
      var tileW=(W-2*M-5*4)/6;
      tiles.forEach(function(tile,i){
        var x=M+i*(tileW+4),y=42;
        doc.setFillColor.apply(doc,SOFT);doc.setDrawColor.apply(doc,LINE);doc.setLineWidth(.3);doc.roundedRect(x,y,tileW,22,2.5,2.5,'FD');
        doc.setFillColor.apply(doc,i===3?ACCENT:BLUE2);doc.rect(x,y+3,1.2,16,'F');
        doc.setTextColor.apply(doc,BLUE);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(clean(tile[0],18),x+5,y+11);
        doc.setTextColor.apply(doc,MUTED);doc.setFont('helvetica','bold');doc.setFontSize(6.6);doc.text(clean(tile[1],40).toUpperCase(),x+5,y+17.5);
      });
      doc.autoTable({startY:71,margin:{left:M,right:M},theme:'grid',
        head:[[L('Nr.','No.'),L('Datei','File'),L('Datum','Date'),L('Format','Format'),L('Dauer','Duration'),L('Messzeilen','Rows'),L('Kurven','Curves'),L('Erfassungsmarker','Capture markers'),L('Eigene Markierungen','Own markings'),L('Zeitraum','Time range')]],
        body:files.map(function(item,i){var r=rowsOf(item);return [String(i+1),clean(item.filename,60),clean(item.date,20),item.sourceFormat,secToHMS(stats[i].duration),fmtNumber(stats[i].rows),String(stats[i].curves),String(stats[i].events),String(stats[i].own+stats[i].ranges),r[0].ts.substring(0,8)+' - '+r[r.length-1].ts.substring(0,8)];}),
        styles:{font:'helvetica',fontSize:8.2,cellPadding:2,overflow:'linebreak',valign:'middle',lineColor:LINE,lineWidth:.15,textColor:INK},
        headStyles:{fillColor:BLUE,textColor:[255,255,255],fontStyle:'bold',halign:'center',fontSize:7.6},
        columnStyles:{0:{cellWidth:11,halign:'center',fontStyle:'bold'},1:{cellWidth:'auto'},2:{cellWidth:22},3:{cellWidth:16,halign:'center'},4:{cellWidth:20,halign:'center'},5:{cellWidth:22,halign:'right'},6:{cellWidth:16,halign:'center'},7:{cellWidth:31,halign:'center'},8:{cellWidth:33,halign:'center'},9:{cellWidth:34,halign:'center'}}});
      tocY=doc.lastAutoTable.finalY+7;
      doc.setFillColor.apply(doc,BLUE);doc.rect(M,tocY,W-2*M,7.5,'F');
      doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(8.2);doc.text(L('Inhalt dieses Berichts','Contents of this report'),M+2,tocY+5);
    }

    if(multi)renderCover();
    files.forEach(function(item,i){fileLevel=multi?1:0;renderFile(item,i);});

    /* Contents on page 1 and footers on every page */
    var total=doc.internal.getNumberOfPages();
    doc.setPage(1);
    function tocLines(items,startY,left,right){
      var y=startY,maxLines=Math.floor((H-18-startY)/6.4)+1;
      items.slice(0,maxLines).forEach(function(item,i){
        doc.setFont('helvetica',i?'normal':'bold');doc.setFontSize(8.6);doc.setTextColor.apply(doc,INK);
        doc.text(clean(item.title,multi&&left<W/2?110:60),left,y);
        doc.setTextColor.apply(doc,MUTED);doc.text(L('Seite ','Page ')+item.page,right,y,{align:'right'});
        doc.setDrawColor.apply(doc,LINE);doc.setLineWidth(.15);doc.line(left,y+1.8,right,y+1.8);
        y+=6.4;
      });
    }
    if(multi){
      tocLines(toc.filter(function(item){return !item.level;}),tocY+13,M+2,W-M-2);
      fileStarts.forEach(function(start){
        if(start.file==null)return;
        doc.setPage(start.page);
        tocLines(toc.filter(function(item){return item.file===start.file;}).map(function(item,i){return i?item:{title:L('Zusammenfassung','Summary'),page:item.page};}),84,W/2+5,W-M-2);
      });
    }else tocLines(toc,84,W/2+5,W-M-2);
    function footerName(page){var name='';fileStarts.forEach(function(start){if(start.page<=page)name=start.name;});return name;}
    for(var p=1;p<=total;p++){
      doc.setPage(p);
      doc.setDrawColor.apply(doc,LINE);doc.setLineWidth(.2);doc.line(M,H-9.5,W-M,H-9.5);
      doc.setFont('helvetica','normal');doc.setFontSize(7);doc.setTextColor(135,145,160);
      doc.text(clean(footerName(p),70),M,H-5.5);
      doc.text(L('Seite ','Page ')+p+' '+L('von','of')+' '+total,W/2,H-5.5,{align:'center'});
      doc.text(L('Erstellt ','Created ')+createdAt+' · '+L('lokal im Browser','locally in the browser'),W-M,H-5.5,{align:'right'});
    }
    if(options.download===false)return doc.output('blob');
    var first=files[0],reportDate=multi?files.length+(en()?'_recordings':'_Messungen'):((first.date&&/\d/.test(first.date))?first.date.replace(/\./g,'-'):'Export');
    doc.save((en()?'Signal_Capture_':'Signalerfassung_')+reportDate+'.pdf');
    trackUsage('pdf_export');return null;
  }

  /* Rough page count per chapter for the PDF dialog ("approx."). */
  function estimate(files){
    var pages={summary:0,chart:0,zoom:0,details:0,capture:0,pairs:0,notes:0,stats:0,overview:0,excerpt:0},available={summary:true};
    files.forEach(function(file){
      var rows=rowsOf(file);if(!rows||!rows.length)return;
      var groups=Math.max(1,chartGroups(file,MAX_LANES_PER_PAGE).length),entries=annotationEntries(file).filter(function(e){return rows.some(function(r){return r.rowId>=e.start&&r.rowId<=e.end;});});
      var events=captureEvents(file,rows),pairs=pairReport(file),stat=numericSignals(file).length,signals=(file.signals||[]).length;
      var dataSignals=visibleSignals(file).filter(function(s){return !/^Marker$/i.test(s.id);}).length,refs=events.length+entries.length*2;
      pages.summary+=1;
      pages.chart+=groups;available.chart=true;
      if(isZoomed(file)){pages.zoom+=groups;available.zoom=true;}
      if(entries.length){pages.details+=Math.min(entries.length,MAX_DETAIL_CHARTS);pages.notes+=Math.ceil(entries.length/16);available.details=available.notes=true;}
      if(events.length){pages.capture+=Math.ceil(events.length/22)+(captureMarkersShown(file)?Math.ceil(Math.min(events.length,MAX_CAPTURE_CHARTS)/2):0);available.capture=true;}
      if(pairs.length){pages.pairs+=Math.max(1,Math.ceil(pairs.reduce(function(n,p){return n+Math.max(1,p.list.length);},0)/22));available.pairs=true;}
      if(stat){pages.stats+=Math.ceil(stat/22);available.stats=true;}
      pages.overview+=Math.max(1,Math.ceil(signals/22));available.overview=true;
      pages.excerpt+=Math.max(1,Math.ceil(dataSignals/6))*Math.max(1,Math.ceil(Math.min(refs||150,refs?MAX_EXCERPT_ROWS:150)/24));available.excerpt=true;
    });
    if(files.length>1)pages.summary+=1;
    return {pages:pages,available:available};
  }

  /* ---------- Excel: additional sheets ---------- */
  function argb(rgb){return 'FF'+rgb.map(function(c){return c.toString(16).padStart(2,'0');}).join('').toUpperCase();}
  function fillHex(hex){return {type:'pattern',pattern:'solid',fgColor:{argb:'FF'+String(hex).replace('#','').toUpperCase()}};}
  function styleHead(row,height){row.height=height||30;row.eachCell(function(cell){cell.fill=fillHex('#003D75');cell.font={name:'Aptos',bold:true,size:10,color:{argb:'FFFFFFFF'}};cell.alignment={vertical:'middle',horizontal:'center',wrapText:true};cell.border=thin('#2F6FA8');});}
  function thin(hex){var c={argb:'FF'+hex.replace('#','')};return {top:{style:'thin',color:c},left:{style:'thin',color:c},bottom:{style:'thin',color:c},right:{style:'thin',color:c}};}
  function band(ws,row,cols,text,color,size){ws.mergeCells(row,1,row,cols);var c=ws.getCell(row,1);c.value=text;c.fill=fillHex(color||'#003D75');c.font={name:'Aptos',bold:true,size:size||13,color:{argb:'FFFFFFFF'}};c.alignment={vertical:'middle',horizontal:'left'};ws.getRow(row).height=size>14?30:22;}
  function excelNumber(raw){var n=numericValue(raw);return n===null?clean(raw,60):n;}
  function excelSheets(wb,file,options){
    options=options||{};
    var prefix=options.prefix||'';
    function name(text){return (prefix+text).replace(/[\\/?*[\]:]/g,' ').substring(0,31);}
    var rows=rowsOf(file),events=captureEvents(file,rows),entries=annotationEntries(file),chartSel=chartSelection(file);
    /* Chart */
    var imgHeight=imageHeight(file,900,60,1.1);
    var image=chartImage(file,{width:1600,height:imgHeight,dpr:1.5,scale:1.1,title:L('Kurvendiagramm','Curve chart')+' · '+clean(file.filename,80),subtitle:periodLabel(file)});
    if(image){
      var chartWs=wb.addWorksheet(name(L('Diagramm','Chart')),{properties:{tabColor:{argb:'FF00A1A7'}},views:[{showGridLines:false}]});
      chartWs.columns=[{width:3}].concat(Array.from({length:20},function(){return {width:9};}));
      band(chartWs,1,18,L('Kurvendiagramm der Auswertung','Curve chart of the evaluation'),'#003D75',16);
      band(chartWs,2,18,chartSel.signals.length+' '+L('Kurven','curves')+' · '+periodLabel(file)+' · '+L('Erfassungsmarker oben nummeriert, eigene Markierungen unten mit Buchstaben','capture markers numbered at the top, own markings lettered at the bottom'),'#0055A0',11);
      var id=wb.addImage({base64:image.canvas.toDataURL('image/png'),extension:'png'});
      chartWs.addImage(id,{tl:{col:1,row:3},ext:{width:1280,height:Math.round(1280*imgHeight/1600)}});
    }
    /* Capture markers */
    if(events.length){
      var signals=capturedSignals(file).filter(function(s){return !/^Marker$/i.test(s.id);});
      var capWs=wb.addWorksheet(name(L('Erfassungsmarker','Capture markers')),{properties:{tabColor:{argb:'FF0B4F8A'}},views:[{state:'frozen',xSplit:3,ySplit:4,showGridLines:false}]});
      var cols=3+signals.length;
      capWs.columns=[{width:9},{width:17},{width:13}].concat(signals.map(function(){return {width:16};}));
      band(capWs,1,Math.max(cols,6),L('Erfassungsmarker (Markerknopf während der Messfahrt)','Capture markers (marker button during the test drive)'),'#003D75',15);
      band(capWs,2,Math.max(cols,6),L('Messwerte aller sichtbaren Signale (Zahlen- und Statussignale) in der Zeile, in der der Markerzähler hochzählt.','Values of all visible signals (numeric and status signals) in the row where the marker counter increases.'),'#0055A0',11);
      capWs.getRow(4).values=[L('Nr.','No.'),L('Zeitstempel','Timestamp'),L('t ab Start [s]','t from start [s]')].concat(signals.map(function(s){return nameOf(s)+(s.unit?'\n['+clean(s.unit,16)+']':'');}));
      styleHead(capWs.getRow(4),58);
      events.forEach(function(event,i){
        var row=capWs.getRow(5+i);
        row.values=[event.value,event.row.ts,Math.round(relSec(file,event.row)*1000)/1000].concat(signals.map(function(s){return excelNumber(event.row.parts[s.index]);}));
        row.height=20;
        row.eachCell(function(cell,col){cell.border=thin('#D7E2EC');cell.alignment={vertical:'middle',horizontal:'center'};cell.fill=fillHex(i%2?'#F7FAFC':'#FFFFFF');if(col===1){cell.fill=fillHex('#E2EEFA');cell.font={name:'Aptos',bold:true,size:10,color:{argb:'FF0B4F8A'}};}});
      });
      capWs.autoFilter={from:{row:4,column:1},to:{row:4,column:cols}};
    }
    /* Notes and ranges (sheet name kept stable for existing evaluations) */
    if(entries.length){
      var ws=wb.addWorksheet(name(L('Notizen und Zeitbereiche','Notes and time ranges')),{properties:{tabColor:{argb:'FFE4002B'}},views:[{state:'frozen',ySplit:1}]});
      ws.columns=[{width:10},{width:14},{width:20},{width:20},{width:12},{width:90}];
      ws.addRow(en()?['Label','Type','From','To','Duration','Note (complete file)']:['Kennung','Typ','Von','Bis','Dauer','Notiz (gesamte Datei)']);
      styleHead(ws.getRow(1),24);
      entries.forEach(function(entry){
        var row=ws.addRow([entry.letter,typeLabel(entry),file.rawRows[entry.start].ts,file.rawRows[entry.end].ts,durationLabel(file,entry),entry.note||'']);
        row.alignment={wrapText:true,vertical:'top'};
        row.getCell(1).fill=fillHex(entry.color);row.getCell(1).font={name:'Aptos',bold:true,color:{argb:window.Annotations&&Annotations.textOn(entry.color)==='#ffffff'?'FFFFFFFF':'FF13263A'}};row.getCell(1).alignment={horizontal:'center',vertical:'top'};
        row.eachCell(function(cell){cell.border=thin('#D7E2EC');});
      });
    }
  }
  return {pdf:pdf,estimate:estimate,sections:SECTIONS.slice(),chartImage:chartImage,chartPngs:chartPngs,canvasBlob:canvasBlob,excelSheets:excelSheets,signalStats:signalStats,numericSignals:numericSignals,rowsOf:rowsOf};
})();
