'use strict';

const mailer = require('./mailer');

const recipient = String(process.argv[2] || process.env.REQUEST_NOTIFY_TO || '').trim();
const language = process.argv[3] === 'en' ? 'en' : 'de';
if (!recipient) throw new Error('Testempfänger fehlt.');
if (!mailer.configured()) throw new Error('Der E-Mail-Versand ist nicht konfiguriert.');

(async () => {
  const request = {
    name: language === 'en' ? 'Alex Smith (English test)' : 'Max Mustermann (Test)',
    email: recipient,
    createdAt: new Date().toISOString(),
    language
  };
  await mailer.sendAccessRequestConfirmation(request);
  await mailer.sendAccessRequestNotification(request);
  await mailer.sendWelcomeEmail({
    name: language === 'en' ? 'Alex Smith' : 'Max Mustermann',
    email: recipient,
    username: language === 'en' ? 'alex.smith' : 'max.mustermann',
    password: 'Start!2026-Secure',
    language
  });
  console.log(`Testmails (${language.toUpperCase()}) wurden an ${recipient} versendet.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
