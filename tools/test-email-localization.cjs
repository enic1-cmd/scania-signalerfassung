const assert=require('node:assert/strict');
const mailer=require('../server/mailer');

const base={name:'Alex Smith',email:'alex@example.com',createdAt:'2026-09-28T10:30:00.000Z'};
const confirmationEn=mailer.buildAccessRequestConfirmation({...base,language:'en'});
const notificationEn=mailer.buildAccessRequestNotification({...base,language:'en'});
const welcomeEn=mailer.buildWelcomeEmail({...base,username:'alex.smith',password:'Start!2026-Secure',language:'en'});
const confirmationDe=mailer.buildAccessRequestConfirmation({...base,language:'de'});
const welcomeDe=mailer.buildWelcomeEmail({...base,username:'alex.smith',password:'Start!2026-Sicher',language:'de'});

assert.equal(confirmationEn.subject,'Your access request has been received');
assert.equal(confirmationEn.headers['Content-Language'],'en');
assert.match(confirmationEn.html,/<html lang="en">/);
assert.match(confirmationEn.html,/What happens next/);
assert.match(confirmationEn.text,/reviewed personally/);
assert.doesNotMatch(confirmationEn.html,/Vielen Dank|Ihre Anfrage|Diese Nachricht/);

assert.match(notificationEn.subject,/Neue Zugangsanfrage/);
assert.equal(notificationEn.headers['Content-Language'],'de');
assert.match(notificationEn.html,/<html lang="de">/);
assert.match(notificationEn.html,/Neue Zugangsanfrage/);
assert.match(notificationEn.html,/Sprache/);
assert.match(notificationEn.text,/Sprache: EN/);
assert.doesNotMatch(notificationEn.html,/New access request|Review in Admin Hub/);
assert.equal(notificationEn.to,'david.breuer@breuer-trucks.de, contact.breuer.apps@gmail.com','Admin notification also goes to the app mailbox');

const adminMessage=mailer.buildAdminMessage({email:'alex@example.com',name:'Alex Smith',subject:'Hallo',message:'Test'});
assert.equal(adminMessage.bcc,'david.breuer@breuer-trucks.de, contact.breuer.apps@gmail.com','Admin message copy goes to both mailboxes');
const adminToArchive=mailer.buildAdminMessage({email:'Contact.Breuer.Apps@gmail.com',subject:'Hallo',message:'Test'});
assert.equal(adminToArchive.bcc,'david.breuer@breuer-trucks.de','No blind copy to the recipient itself');

assert.equal(welcomeEn.subject,'Your access to the Signal Capture Analysis Tool');
assert.equal(welcomeEn.headers['Content-Language'],'en');
assert.match(welcomeEn.html,/<html lang="en">/);
assert.match(welcomeEn.html,/Temporary password/);
assert.match(welcomeEn.html,/Open analysis app/);
assert.match(welcomeEn.text,/Username: alex\.smith/);
assert.doesNotMatch(welcomeEn.html,/Startpasswort|Bitte bewahre|freigeschaltet/);

assert.equal(confirmationDe.subject,'Ihre Zugangsanfrage ist eingegangen');
assert.equal(confirmationDe.headers['Content-Language'],'de');
assert.match(confirmationDe.html,/<html lang="de">/);
assert.equal(welcomeDe.headers['Content-Language'],'de');
assert.match(welcomeDe.html,/Startpasswort/);

console.log(JSON.stringify({result:'PASS',customerConfirmation:'DE/EN PASS',adminNotification:'always DE PASS',welcomeEmail:'DE/EN PASS'}));
