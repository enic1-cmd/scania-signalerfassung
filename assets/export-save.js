/* Open the picker while the button click still grants user activation. */
var exportSaveBusy=false,exportScope='all';
/* With several loaded recordings, PDF and Excel cover all of them (one report / one workbook) or only the active one.
   The support ZIP always contains every recording. */
function exportAllFiles(){return S.files.length>1&&exportScope==='all';}
function syncExportScope(){
  var box=document.querySelector('.export-scope');if(!box)return;
  var en=window.AppI18n&&AppI18n.currentLang&&AppI18n.currentLang()==='en',count=S.files.length;
  box.hidden=count<2;
  box.querySelector('.export-scope-label').textContent=en?'Scope':'Umfang';
  box.querySelector('[data-export-scope="all"]').textContent=(en?'All files':'Alle Dateien')+' ('+count+')';
  box.querySelector('[data-export-scope="active"]').textContent=en?'This file only':'Nur diese Datei';
  box.setAttribute('aria-label',en?'Export scope':'Exportumfang');
  box.querySelectorAll('[data-export-scope]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.exportScope===exportScope));});
}
document.querySelectorAll('[data-export-scope]').forEach(function(button){
  button.addEventListener('click',function(event){event.preventDefault();event.stopPropagation();exportScope=button.dataset.exportScope;syncExportScope();});
});
async function saveExport(kind){
  if(exportSaveBusy)return;
  var i18n=window.AppI18n||{};
  var t=typeof i18n.t==='function'?i18n.t:function(key){return key;};
  var lang=typeof i18n.currentLang==='function'?i18n.currentLang():'de';
  var formats={
    pdf:{mime:'application/pdf',label:t('pdfEval')},
    xlsx:{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',label:t('excelEval')},
    zip:{mime:'application/zip',label:t('supportZip')}
  };
  var format=formats[kind],sourceFile=active();
  if(!format||!sourceFile.filtered||!sourceFile.filtered.length){alert(t('noExportData'));return;}
  var workspace=captureExportState(sourceFile),file=workspace.file,all=exportAllFiles()&&kind!=='zip';
  var suffix=kind==='zip'?(lang==='en'?'Support_package':'Supportpaket'):(lang==='en'?'Evaluation':'Auswertung');
  var stem=all?(lang==='en'?'Signal_Capture_'+workspace.files.length+'_recordings':'Signalerfassung_'+workspace.files.length+'_Messungen'):safeFileName(normalizedSignalFileName(file.filename)).replace(/\.txt$/i,'');
  var name=stem+'_'+suffix+'.'+kind;
  var handle=null,buttons=Array.from(document.querySelectorAll('.export-option'));
  var states=buttons.map(function(b){return b.disabled;});
  exportSaveBusy=true;buttons.forEach(function(b){b.disabled=true;});
  try{
    if(typeof window.showSaveFilePicker==='function'){
      var accept={};accept[format.mime]=['.'+kind];
      try{
        handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:format.label,accept:accept}]});
      }catch(error){if(error.name==='AbortError')return;throw error;}
    }else if(!confirm(t('browserDownloadConfirm')))return;
    showToast(format.label+t('creating'));
    var blob;
    if(kind==='pdf')blob=all?exportPDF({files:workspace.files,download:false}):exportPDF({file:file,download:false});
    else if(kind==='zip')blob=await exportSupportZip({file:file,workspace:workspace,download:false});
    else if(all)blob=await exportAllXLSX(workspace.files);
    else{
      var rows=file.rawRows;
      blob=await exportStyledXLSX(file,rows,file.filtered,visibleSignals(file),rows[0].ts.substring(0,8),rows[rows.length-1].ts.substring(0,8),{download:false});
    }
    if(!(blob instanceof Blob))throw new Error(t('exportFileFailed'));
    if(handle){
      var writable=await handle.createWritable();
      try{await writable.write(blob);await writable.close();}
      catch(error){try{await writable.abort();}catch(ignore){}throw error;}
    }else downloadBlob(blob,name);
    if(kind==='pdf'||kind==='xlsx')trackUsage(kind==='pdf'?'pdf_export':'excel_export');
    showToast(format.label+(handle?t('saved'):t('downloaded')));
  }catch(error){
    console.error(error);alert(t('exportSaveFailed')+(error.message||error));
  }finally{
    exportSaveBusy=false;buttons.forEach(function(b,i){b.disabled=states[i];});
  }
}
