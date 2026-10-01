'use strict';

const mailer = require('./mailer');

const recipient = String(process.argv[2] || process.env.REQUEST_NOTIFY_TO || '').trim();
const language = process.argv[3] === 'en' ? 'en' : 'de';
const mode = ['welcome', 'feedback-reply'].includes(process.argv[4]) ? process.argv[4] : 'all';
if (!recipient) throw new Error('Testempfänger fehlt.');
if (!mailer.configured()) throw new Error('Der E-Mail-Versand ist nicht konfiguriert.');

(async () => {
  if (mode === 'feedback-reply') {
    // Same template the Admin Hub uses for replies to feedback forms.
    await mailer.sendAdminMessage({
      email: recipient,
      name: language === 'en' ? 'Alex Smith' : 'Stefan Herrmann',
      language,
      subject: language === 'en' ? 'Thank you for your feedback (test)' : 'Danke für dein Feedback (Test)',
      message: language === 'en'
        ? 'Hello Alex,\n\nthank you for taking the time to fill in the feedback form. Your input really helps me improve the analysis tool for everyday workshop use.\n\nI will get back to you as soon as your points have been implemented.\n\nBest regards\nDavid'
        : 'Hallo Stefan,\n\nvielen Dank, dass du dir die Zeit für den Feedbackbogen genommen hast. Deine Hinweise helfen mir sehr, das Analyse-Tool für den Werkstattalltag besser zu machen.\n\nIch melde mich, sobald deine Punkte umgesetzt sind.\n\nViele Grüße\nDavid'
    });
    console.log(`Test-Antwort auf Feedback (${language.toUpperCase()}) wurde an ${recipient} versendet.`);
    return;
  }
  const request = {
    name: language === 'en' ? 'Alex Smith (English test)' : 'Max Mustermann (Test)',
    email: recipient,
    createdAt: new Date().toISOString(),
    language
  };
  if (mode === 'all') {
    await mailer.sendAccessRequestConfirmation(request);
    await mailer.sendAccessRequestNotification(request);
  }
  await mailer.sendWelcomeEmail({
    name: language === 'en' ? 'Alex Smith' : 'Max Mustermann',
    email: recipient,
    username: language === 'en' ? 'alex.smith' : 'max.mustermann',
    password: 'Start!2026-Secure',
    language
  });
  console.log(`${mode === 'welcome' ? 'Zugangsdaten-Testmail' : 'Testmails'} (${language.toUpperCase()}) wurde an ${recipient} versendet.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
