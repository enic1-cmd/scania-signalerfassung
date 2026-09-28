/* Open the picker while the button click still grants user activation. */
var exportSaveBusy=false;
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
  var workspace=captureExportState(sourceFile),file=workspace.file;
  var suffix=kind==='zip'?(lang==='en'?'Support_package':'Supportpaket'):(lang==='en'?'Evaluation':'Auswertung');
  var name=safeFileName(normalizedSignalFileName(file.filename)).replace(/\.txt$/i,'')+'_'+suffix+'.'+kind;
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
    if(kind==='pdf')blob=exportPDF({file:file,download:false});
    else if(kind==='zip')blob=await exportSupportZip({file:file,workspace:workspace,download:false});
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
