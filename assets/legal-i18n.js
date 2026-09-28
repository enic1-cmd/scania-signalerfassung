(function(){
  'use strict';

  const STORAGE_KEY = 'signalerfassung.lang';
  const shared = {
    de: {
      navAria: 'Hauptnavigation', brandAria: 'Zur Landingpage', brand: 'Analyse-Tool',
      home: 'Landingpage', legal: 'Impressum', privacy: 'Datenschutz', app: 'App &ouml;ffnen',
      portals: 'Relevante Portale &ouml;ffnen', language: 'Sprache', currentName: 'Deutsch',
      footer: '&copy; 2026 David Breuer Apps. Alle Rechte vorbehalten.'
    },
    en: {
      navAria: 'Main navigation', brandAria: 'Go to landing page', brand: 'Analysis Tool',
      home: 'Landing page', legal: 'Legal notice', privacy: 'Privacy', app: 'Open app',
      portals: 'Open relevant portals', language: 'Language', currentName: 'English',
      footer: '&copy; 2026 David Breuer Apps. All rights reserved.'
    }
  };

  const pages = {
    imprint: {
      de: {
        title: 'Impressum | SWS / SDP3 Signalerfassung Analyse-Tool', eyebrow: 'Rechtliche Angaben', heading: 'Impressum',
        sections: [
          '<h2>Angaben gem&auml;&szlig; &sect; 5 DDG</h2><p><strong>David Breuer Apps</strong><br>David Breuer<br>Steckendorfer Stra&szlig;e 119<br>47798 Krefeld<br>Deutschland</p>',
          '<h2>Kontakt</h2><p>E-Mail: <a href="mailto:contact.breuer.apps@gmail.com">contact.breuer.apps@gmail.com</a></p>',
          '<h2>Verantwortlich f&uuml;r den Inhalt</h2><p>David Breuer<br>Steckendorfer Stra&szlig;e 119<br>47798 Krefeld</p>',
          '<h2>Hinweis zu Marken und externen Systemen</h2><p>Dieses Analyse-Tool ist ein internes beziehungsweise inoffizielles Hilfswerkzeug. Es steht nicht in Verbindung mit Scania CV AB oder verbundenen Unternehmen. Genannte Marken, Portale, Produktnamen und Systembezeichnungen sind Eigentum der jeweiligen Rechteinhaber und werden nur beschreibend verwendet.</p>',
          '<h2>Haftung f&uuml;r Inhalte</h2><p>Die Inhalte dieser Website wurden mit Sorgfalt erstellt. F&uuml;r die Richtigkeit, Vollst&auml;ndigkeit und Aktualit&auml;t der Inhalte kann jedoch keine Gew&auml;hr &uuml;bernommen werden. Das Tool dient der strukturierten Aufbereitung von Messdaten und ersetzt keine fachliche Diagnose oder verbindliche Herstellerdokumentation.</p>',
          '<h2>Haftung f&uuml;r Links</h2><p>Diese Website enth&auml;lt Links zu externen Websites. Auf deren Inhalte besteht kein Einfluss. F&uuml;r die Inhalte der verlinkten Seiten ist stets der jeweilige Anbieter oder Betreiber verantwortlich. Bei Bekanntwerden von Rechtsverletzungen werden entsprechende Links entfernt.</p>'
        ]
      },
      en: {
        title: 'Legal Notice | SWS / SDP3 Signal Capture Analysis Tool', eyebrow: 'Legal information', heading: 'Legal notice',
        sections: [
          '<h2>Information pursuant to Section 5 of the German Digital Services Act (DDG)</h2><p><strong>David Breuer Apps</strong><br>David Breuer<br>Steckendorfer Stra&szlig;e 119<br>47798 Krefeld<br>Germany</p>',
          '<h2>Contact</h2><p>Email: <a href="mailto:contact.breuer.apps@gmail.com">contact.breuer.apps@gmail.com</a></p>',
          '<h2>Responsible for content</h2><p>David Breuer<br>Steckendorfer Stra&szlig;e 119<br>47798 Krefeld<br>Germany</p>',
          '<h2>Trademarks and external systems</h2><p>This analysis tool is an internal and unofficial utility. It is not affiliated with Scania CV AB or any affiliated company. All trademarks, portals, product names and system names mentioned are the property of their respective owners and are used for descriptive purposes only.</p>',
          '<h2>Liability for content</h2><p>The content of this website has been prepared with care. However, no guarantee can be given for its accuracy, completeness or timeliness. The tool is intended to structure measurement data and does not replace a professional diagnosis or binding manufacturer documentation.</p>',
          '<h2>Liability for links</h2><p>This website contains links to external websites whose content is outside our control. The respective provider or operator is always responsible for the content of linked pages. Links will be removed if we become aware of any legal infringement.</p>'
        ]
      }
    },
    privacy: {
      de: {
        title: 'Datenschutz | SWS / SDP3 Signalerfassung Analyse-Tool', eyebrow: 'Datenschutzhinweise', heading: 'Datenschutzerkl&auml;rung', updated: 'Stand: 16. September 2026',
        sections: [
          '<h2>1. Verantwortlicher</h2><p><strong>David Breuer Apps</strong><br>David Breuer<br>Steckendorfer Stra&szlig;e 119<br>47798 Krefeld<br>Deutschland</p><p>E-Mail: <a href="mailto:david.breuer@breuer-trucks.de">david.breuer@breuer-trucks.de</a></p>',
          '<h2>2. Lokale Verarbeitung der Messdateien</h2><p>Die ausgew&auml;hlten Signalerfassungsdateien werden ausschlie&szlig;lich im Browser auf dem Endger&auml;t verarbeitet. Die Messdateien, ihre Dateinamen und die daraus erzeugten Excel- oder PDF-Dateien werden nicht an den Server von David Breuer Apps &uuml;bertragen. Die f&uuml;r den Export ben&ouml;tigten Programmbibliotheken werden von diesem Server bereitgestellt.</p>',
          '<h2>3. Hosting bei STRATO</h2><p>Die Website wird auf einem Server der <strong>STRATO GmbH, Otto-Ostrowski-Stra&szlig;e 7, 10249 Berlin</strong>, betrieben. STRATO verarbeitet Verbindungsdaten, soweit dies zur Bereitstellung und Absicherung des Hostings erforderlich ist. Nach Angaben von STRATO werden IP-Adressen zur Erkennung und Abwehr von Angriffen h&ouml;chstens sieben Tage gespeichert.</p><p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse besteht im sicheren, stabilen und effizienten Betrieb der Website. Mit STRATO besteht eine Vereinbarung zur Auftragsverarbeitung nach Art. 28 DSGVO.</p>',
          '<h2>4. Benutzerzugang</h2><p>Der Zugriff ist auf angelegte Benutzer beschr&auml;nkt. Gespeichert werden der Benutzername und ein nicht im Klartext lesbarer Passwort-Hash. Das eingegebene Passwort wird nur zur Pr&uuml;fung des Zugangs verwendet. Die Zugangsdaten bleiben gespeichert, bis das Benutzerkonto durch den Administrator ge&auml;ndert oder gel&ouml;scht wird.</p><p>Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt im Schutz des nicht&ouml;ffentlichen Analyse-Tools vor unberechtigtem Zugriff.</p>',
          '<h2>5. Zugangsanfragen</h2><p>Beim Absenden des Formulars &bdquo;Zugang anfragen&ldquo; werden der angegebene Name, die E-Mail-Adresse, der Bearbeitungsstatus und der Zeitpunkt der Anfrage gespeichert. Die Angaben werden ausschlie&szlig;lich verwendet, um die Anfrage zu pr&uuml;fen und einen pers&ouml;nlichen Zugang vorzubereiten. Offene und abgeschlossene Anfragen werden sp&auml;testens nach 365 Tagen aus der Anfrageverwaltung entfernt.</p><p>Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse besteht in einer kontrollierten, sicheren und nachvollziehbaren Vergabe von Zug&auml;ngen zum nicht&ouml;ffentlichen Analyse-Tool.</p>',
          '<h2>6. Cookies und externe Dienste</h2><p>Diese Website setzt keine Tracking- oder Werbe-Cookies ein und verwendet keine externen Analysedienste. Die Zugangskontrolle erfolgt &uuml;ber die Anmeldefunktion des Webbrowsers. Links zu externen Portalen werden erst aufgerufen, wenn sie aktiv angeklickt werden; ab diesem Zeitpunkt ist der jeweilige Betreiber f&uuml;r die dortige Datenverarbeitung verantwortlich.</p>',
          '<h2>7. Kontakt per E-Mail</h2><p>Bei einer Kontaktaufnahme per E-Mail werden die &uuml;bermittelten Angaben zur Bearbeitung der Anfrage verarbeitet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO, bei vorvertraglichen oder vertraglichen Anliegen Art. 6 Abs. 1 lit. b DSGVO. Die Daten werden gel&ouml;scht, sobald sie f&uuml;r die Bearbeitung nicht mehr erforderlich sind und keine gesetzlichen Aufbewahrungspflichten entgegenstehen.</p>',
          '<h2>8. Ihre Rechte</h2><p>Im Rahmen der gesetzlichen Voraussetzungen bestehen Rechte auf Auskunft, Berichtigung, L&ouml;schung, Einschr&auml;nkung der Verarbeitung, Daten&uuml;bertragbarkeit und Widerspruch gegen eine Verarbeitung auf Grundlage berechtigter Interessen. Au&szlig;erdem besteht ein Beschwerderecht bei einer Datenschutzaufsichtsbeh&ouml;rde.</p><p>Zur Aus&uuml;bung dieser Rechte gen&uuml;gt eine Nachricht an <a href="mailto:david.breuer@breuer-trucks.de">david.breuer@breuer-trucks.de</a>.</p>',
          '<h2>9. Stand und &Auml;nderungen</h2><p>Diese Datenschutzerkl&auml;rung entspricht dem technischen Stand vom 16. September 2026. Sie wird angepasst, wenn sich die eingesetzten Funktionen oder Verarbeitungen &auml;ndern.</p>'
        ]
      },
      en: {
        title: 'Privacy Policy | SWS / SDP3 Signal Capture Analysis Tool', eyebrow: 'Privacy information', heading: 'Privacy policy', updated: 'Last updated: September 16, 2026',
        sections: [
          '<h2>1. Data controller</h2><p><strong>David Breuer Apps</strong><br>David Breuer<br>Steckendorfer Stra&szlig;e 119<br>47798 Krefeld<br>Germany</p><p>Email: <a href="mailto:david.breuer@breuer-trucks.de">david.breuer@breuer-trucks.de</a></p>',
          '<h2>2. Local processing of measurement files</h2><p>The selected signal capture files are processed exclusively in the browser on the user\'s device. The measurement files, their file names and the Excel or PDF files created from them are not transferred to the David Breuer Apps server. The software libraries required for export are provided by this server.</p>',
          '<h2>3. Hosting by STRATO</h2><p>The website is hosted on a server operated by <strong>STRATO GmbH, Otto-Ostrowski-Stra&szlig;e 7, 10249 Berlin, Germany</strong>. STRATO processes connection data where necessary to provide and secure the hosting service. According to STRATO, IP addresses are stored for no more than seven days to detect and prevent attacks.</p><p>The legal basis is Article 6(1)(f) GDPR. The legitimate interest is the secure, stable and efficient operation of the website. A data processing agreement pursuant to Article 28 GDPR is in place with STRATO.</p>',
          '<h2>4. User access</h2><p>Access is restricted to registered users. The user name and a password hash that cannot be read as plain text are stored. The password entered is used only to verify access. Login data remains stored until the administrator changes or deletes the user account.</p><p>Processing is based on Article 6(1)(f) GDPR. The legitimate interest is to protect the non-public analysis tool against unauthorized access.</p>',
          '<h2>5. Access requests</h2><p>When the &ldquo;Request access&rdquo; form is submitted, the name and email address provided, the processing status and the time of the request are stored. This information is used exclusively to review the request and prepare personal access. Open and completed requests are removed from request management no later than 365 days after submission.</p><p>The legal basis is Article 6(1)(f) GDPR. The legitimate interest is the controlled, secure and traceable allocation of access to the non-public analysis tool.</p>',
          '<h2>6. Cookies and external services</h2><p>This website does not use tracking or advertising cookies and does not use external analytics services. Access control is handled by the web browser\'s login function. Links to external portals are opened only when actively selected; from that point onward, the respective operator is responsible for data processing on that portal.</p>',
          '<h2>7. Contact by email</h2><p>When you contact us by email, the information you provide is processed to handle your request. The legal basis is Article 6(1)(f) GDPR and, for pre-contractual or contractual matters, Article 6(1)(b) GDPR. The data is deleted once it is no longer required to handle the request and no statutory retention obligations apply.</p>',
          '<h2>8. Your rights</h2><p>Subject to the statutory requirements, you have rights of access, rectification, erasure, restriction of processing, data portability and objection to processing based on legitimate interests. You also have the right to lodge a complaint with a data protection supervisory authority.</p><p>To exercise these rights, send a message to <a href="mailto:david.breuer@breuer-trucks.de">david.breuer@breuer-trucks.de</a>.</p>',
          '<h2>9. Version and changes</h2><p>This privacy policy reflects the technical status as of September 16, 2026. It will be updated if the functions or processing activities used by the website change.</p>'
        ]
      }
    }
  };

  function applyLanguage(value){
    const lang = value === 'en' ? 'en' : 'de';
    const pageName = document.body.dataset.legalPage;
    const copy = pages[pageName] && pages[pageName][lang];
    const common = shared[lang];
    if(!copy) return;

    document.documentElement.lang = lang;
    document.title = copy.title;
    const nav = document.querySelector('.nav');
    if(nav) nav.setAttribute('aria-label', common.navAria);
    const brand = document.querySelector('.brand');
    if(brand) brand.setAttribute('aria-label', common.brandAria);
    const brandLabel = document.querySelector('.brand small');
    if(brandLabel) brandLabel.textContent = common.brand;
    const homeLink = document.querySelector('.navlinks a[href="/"]');
    const legalLink = document.querySelector('.navlinks a[href="impressum.html"]');
    const privacyLink = document.querySelector('.navlinks a[href="datenschutz.html"]');
    if(homeLink) homeLink.textContent = common.home;
    if(legalLink) legalLink.textContent = common.legal;
    if(privacyLink) privacyLink.textContent = common.privacy;
    const appLink = document.querySelector('.nav-cta');
    if(appLink) appLink.innerHTML = common.app;
    const portalButton = document.querySelector('.tool-launcher summary');
    if(portalButton){
      portalButton.setAttribute('aria-label', common.portals);
      portalButton.setAttribute('title', common.portals);
    }
    const eyebrow = document.querySelector('.hero .eyebrow');
    const heading = document.querySelector('.hero h1');
    const updated = document.querySelector('.hero .updated');
    if(eyebrow) eyebrow.innerHTML = copy.eyebrow;
    if(heading) heading.innerHTML = copy.heading;
    if(updated && copy.updated) updated.innerHTML = copy.updated;
    document.querySelectorAll('.content section').forEach((section,index) => {
      if(copy.sections[index]) section.innerHTML = copy.sections[index];
    });
    const footer = document.querySelector('footer');
    if(footer) footer.innerHTML = common.footer;
    document.querySelectorAll('.language-switch').forEach(menu => {
      const summary = menu.querySelector('summary');
      const current = menu.querySelector('.language-current');
      if(summary){
        summary.setAttribute('aria-label', `${common.language}: ${common.currentName}`);
        summary.setAttribute('title', common.language);
      }
      if(current) current.textContent = lang.toUpperCase();
      menu.querySelectorAll('[data-lang-set]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.langSet === lang));
      });
    });
    localStorage.setItem(STORAGE_KEY, lang);
  }

  document.querySelectorAll('[data-lang-set]').forEach(button => {
    button.addEventListener('click', () => {
      applyLanguage(button.dataset.langSet);
      const menu = button.closest('details');
      if(menu) menu.open = false;
    });
  });
  const launchers = [...document.querySelectorAll('.tool-launcher')];
  const languageMenus = [...document.querySelectorAll('.language-switch')];
  document.addEventListener('click', event => {
    [...launchers,...languageMenus].forEach(menu => {
      if(menu.open && !menu.contains(event.target)) menu.open = false;
    });
  });
  languageMenus.forEach(menu => menu.addEventListener('toggle', () => {
    if(menu.open) launchers.forEach(launcher => { launcher.open = false; });
  }));
  launchers.forEach(launcher => launcher.addEventListener('toggle', () => {
    if(launcher.open) languageMenus.forEach(menu => { menu.open = false; });
  }));
  applyLanguage(localStorage.getItem(STORAGE_KEY) || 'de');
})();
