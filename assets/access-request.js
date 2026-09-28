(function(){
  'use strict';

  const STORAGE_KEY='signalerfassung.lang';
  const form=document.getElementById('access-request-form');
  const button=document.getElementById('submit-request');
  const errorBox=document.getElementById('request-error');
  const success=document.getElementById('request-success');
  const cardHead=document.querySelector('.request-card>.card-head');
  const firstName=document.getElementById('request-firstname');
  const launcher=document.getElementById('tool-launcher');
  const languageMenus=[...document.querySelectorAll('.language-switch')];
  let activeLanguage='de';
  let submitting=false;

  const copy={
    de:{
      title:'Zugang anfragen | Signalerfassung Analyse-Tool',
      description:'Pers&ouml;nlichen Zugang zum Signalerfassung Analyse-Tool anfragen.',
      navAria:'Hauptnavigation',brandAria:'Startseite',toolsAria:'Scania Tools &ouml;ffnen',language:'Sprache',currentName:'Deutsch',
      submit:'Anfrage absenden',sending:'Anfrage wird gesendet&hellip;',submitError:'Die Anfrage konnte nicht gesendet werden.',rateLimit:'Zu viele Anfragen. Bitte versuche es in einer Minute erneut.',fallbackName:'Hallo',
      placeholders:{name:'Max Mustermann',email:'name@unternehmen.de'},
      selectors:{
        '.brand small':'Analyse-Tool',
        '.navlinks a[href="index.html#funktionen"]':'Funktionen',
        '.navlinks a[href="index.html#workflow"]':'Workflow',
        '.navlinks a[href="index.html#export"]':'Export',
        '.navlinks a[href="index.html#support"]':'Support',
        '.nav-request':'Zugang anfragen',
        '.nav-cta':'<span>App &ouml;ffnen</span>',
        '.product-kicker':'<span></span>SWS / SDP3 Analyse-Tool',
        '#page-title':'Dein Zugang zur Analyse.<br><em>Pers&ouml;nlich freigegeben.</em>',
        '.request-copy .lead':'Fordere deinen pers&ouml;nlichen Zugang zum Analyse-Tool an. Jede Anfrage wird gepr&uuml;ft, damit Messdaten und Funktionen in einem gesch&uuml;tzten Arbeitsbereich bleiben.',
        '.trust-row span:nth-child(1)':'<svg><use href="#icon-shield"/></svg>Gesch&uuml;tzter App-Zugang',
        '.trust-row span:nth-child(2)':'<svg><use href="#icon-check"/></svg>Messdaten bleiben lokal',
        '.process li:nth-child(1) strong':'Anfrage senden',
        '.process li:nth-child(1) small':'Name und E-Mail eintragen',
        '.process li:nth-child(2) strong':'Pers&ouml;nliche Pr&uuml;fung',
        '.process li:nth-child(2) small':'Freigabe im Admin Hub',
        '.process li:nth-child(3) strong':'Zugang erhalten',
        '.process li:nth-child(3) small':'Zugangsdaten per E-Mail',
        '.card-head .card-kicker':'Gesch&uuml;tzter Analysebereich',
        '#form-title':'Zugang anfragen',
        '.card-head p':'Pers&ouml;nlich gepr&uuml;ft. Sicher freigegeben.',
        'label[for="request-name"]':'Vor- und Nachname',
        'label[for="request-email"]':'E-Mail-Adresse',
        '.security-note p':'<strong>Vertraulich behandelt.</strong> Deine Angaben werden ausschlie&szlig;lich zur Bearbeitung der Zugangsanfrage verwendet.',
        '.form-legal':'Mit dem Absenden best&auml;tigst du, die <a href="datenschutz.html">Datenschutzhinweise</a> zur Zugangsanfrage gelesen zu haben.',
        '.success .card-kicker':'Anfrage erfasst',
        '.success-thanks':'Danke,',
        '.success-arrived':'Deine Anfrage ist angekommen.',
        '.success p':'Du erh&auml;ltst gleich eine Best&auml;tigung per E-Mail. Nach der pers&ouml;nlichen Pr&uuml;fung senden wir dir deine Zugangsdaten.',
        '.success-link':'Zur Landingpage',
        '.footer-inner > span:first-child':'Signalerfassung Analyse-Tool <b>&middot;</b> <a class="creator-link" href="https://reflex.scania.com/profile/dbreue" target="_blank" rel="noopener noreferrer">David Breuer</a> Apps',
        '.footer-inner > span:last-child a:nth-child(1)':'Impressum',
        '.footer-inner > span:last-child a:nth-child(2)':'Datenschutz'
      }
    },
    en:{
      title:'Request access | Signal Capture Analysis Tool',
      description:'Request personal access to the Signal Capture Analysis Tool.',
      navAria:'Main navigation',brandAria:'Home',toolsAria:'Open Scania tools',language:'Language',currentName:'English',
      submit:'Submit request',sending:'Sending request&hellip;',submitError:'The request could not be sent.',rateLimit:'Too many requests. Please try again in one minute.',fallbackName:'Hello',
      placeholders:{name:'John Smith',email:'name@company.com'},
      selectors:{
        '.brand small':'Analysis Tool',
        '.navlinks a[href="index.html#funktionen"]':'Features',
        '.navlinks a[href="index.html#workflow"]':'Workflow',
        '.navlinks a[href="index.html#export"]':'Export',
        '.navlinks a[href="index.html#support"]':'Support',
        '.nav-request':'Request access',
        '.nav-cta':'<span>Open app</span>',
        '.product-kicker':'<span></span>SWS / SDP3 Analysis Tool',
        '#page-title':'Your access to analysis.<br><em>Personally approved.</em>',
        '.request-copy .lead':'Request personal access to the analysis tool. Every request is reviewed so measurement data and functions remain within a protected workspace.',
        '.trust-row span:nth-child(1)':'<svg><use href="#icon-shield"/></svg>Protected app access',
        '.trust-row span:nth-child(2)':'<svg><use href="#icon-check"/></svg>Measurement data stays local',
        '.process li:nth-child(1) strong':'Submit request',
        '.process li:nth-child(1) small':'Enter your name and email',
        '.process li:nth-child(2) strong':'Personal review',
        '.process li:nth-child(2) small':'Approval in the Admin Hub',
        '.process li:nth-child(3) strong':'Receive access',
        '.process li:nth-child(3) small':'Credentials by email',
        '.card-head .card-kicker':'Protected analysis area',
        '#form-title':'Request access',
        '.card-head p':'Personally reviewed. Securely approved.',
        'label[for="request-name"]':'Full name',
        'label[for="request-email"]':'Email address',
        '.security-note p':'<strong>Handled confidentially.</strong> Your details are used exclusively to process your access request.',
        '.form-legal':'By submitting, you confirm that you have read the <a href="datenschutz.html">privacy information</a> for access requests.',
        '.success .card-kicker':'Request received',
        '.success-thanks':'Thank you,',
        '.success-arrived':'Your request has been received.',
        '.success p':'You will receive a confirmation email shortly. After personal review, we will send your credentials.',
        '.success-link':'Back to landing page',
        '.footer-inner > span:first-child':'Signal Capture Analysis Tool <b>&middot;</b> <a class="creator-link" href="https://reflex.scania.com/profile/dbreue" target="_blank" rel="noopener noreferrer">David Breuer</a> Apps',
        '.footer-inner > span:last-child a:nth-child(1)':'Legal notice',
        '.footer-inner > span:last-child a:nth-child(2)':'Privacy'
      }
    }
  };

  function currentCopy(){return copy[activeLanguage];}

  function applyLanguage(value){
    activeLanguage=value==='en'?'en':'de';
    const text=currentCopy();
    document.documentElement.lang=activeLanguage;
    document.title=text.title;
    const description=document.querySelector('meta[name="description"]');
    if(description)description.content=text.description;
    const nav=document.querySelector('.nav');
    if(nav)nav.setAttribute('aria-label',text.navAria);
    const brand=document.querySelector('.brand');
    if(brand)brand.setAttribute('aria-label',text.brandAria);
    const toolButton=launcher&&launcher.querySelector('summary');
    if(toolButton){toolButton.setAttribute('aria-label',text.toolsAria);toolButton.setAttribute('title',text.toolsAria);}
    const trust=document.querySelector('.trust-row');
    if(trust)trust.setAttribute('aria-label',activeLanguage==='en'?'Benefits':'Vorteile');
    const process=document.querySelector('.process');
    if(process)process.setAttribute('aria-label',activeLanguage==='en'?'How approval works':'So funktioniert die Freigabe');
    Object.entries(text.selectors).forEach(([selector,html])=>{
      document.querySelectorAll(selector).forEach(node=>{node.innerHTML=html;});
    });
    const nameInput=document.getElementById('request-name');
    const emailInput=document.getElementById('request-email');
    if(nameInput)nameInput.placeholder=text.placeholders.name;
    if(emailInput)emailInput.placeholder=text.placeholders.email;
    if(button)button.querySelector('span').innerHTML=submitting?text.sending:text.submit;
    languageMenus.forEach(menu=>{
      const summary=menu.querySelector('summary');
      const current=menu.querySelector('.language-current');
      if(summary){summary.setAttribute('aria-label',`${text.language}: ${text.currentName}`);summary.setAttribute('title',text.language);}
      if(current)current.textContent=activeLanguage.toUpperCase();
      menu.querySelectorAll('[data-lang-set]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.langSet===activeLanguage)));
    });
    localStorage.setItem(STORAGE_KEY,activeLanguage);
  }

  document.querySelectorAll('[data-lang-set]').forEach(item=>item.addEventListener('click',()=>{
    applyLanguage(item.dataset.langSet);
    const menu=item.closest('details');
    if(menu)menu.open=false;
  }));
  document.addEventListener('click',event=>{
    if(launcher&&launcher.open&&!launcher.contains(event.target))launcher.open=false;
    languageMenus.forEach(menu=>{if(menu.open&&!menu.contains(event.target))menu.open=false;});
  });
  if(launcher)launcher.addEventListener('toggle',()=>{if(launcher.open)languageMenus.forEach(menu=>{menu.open=false;});});
  languageMenus.forEach(menu=>menu.addEventListener('toggle',()=>{if(menu.open&&launcher)launcher.open=false;}));

  applyLanguage(localStorage.getItem(STORAGE_KEY)||'de');
  if(!form||!button||!errorBox||!success)return;

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    submitting=true;
    button.disabled=true;
    button.querySelector('span').innerHTML=currentCopy().sending;
    errorBox.hidden=true;
    try{
      const response=await fetch('/api/access-requests',{
        method:'POST',
        credentials:'same-origin',
        headers:{'Content-Type':'application/json','X-Requested-With':'signalerfassung-access-request'},
        body:JSON.stringify({
          name:document.getElementById('request-name').value,
          email:document.getElementById('request-email').value,
          website:document.getElementById('request-website').value,
          language:activeLanguage
        })
      });
      await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(response.status===429?currentCopy().rateLimit:currentCopy().submitError);
      const enteredName=document.getElementById('request-name').value.trim().split(/\s+/)[0];
      if(firstName)firstName.textContent=enteredName||currentCopy().fallbackName;
      form.hidden=true;
      if(cardHead)cardHead.hidden=true;
      success.hidden=false;
    }catch(error){
      errorBox.textContent=error.message||currentCopy().submitError;
      errorBox.hidden=false;
      button.disabled=false;
    }finally{
      submitting=false;
      button.querySelector('span').innerHTML=currentCopy().submit;
    }
  });
})();
