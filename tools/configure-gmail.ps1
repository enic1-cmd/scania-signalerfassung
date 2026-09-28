$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Signalerfassung - Gmail sicher verbinden'
Write-Host ''
Write-Host 'Signalerfassung Analyse-Tool' -ForegroundColor Cyan
Write-Host 'Gmail-Versand sicher verbinden' -ForegroundColor White
Write-Host ''
Write-Host 'Bitte das 16-stellige Google-App-Passwort fuer' -ForegroundColor Gray
Write-Host 'contact.breuer.apps@gmail.com eingeben.' -ForegroundColor Yellow
Write-Host 'Die Eingabe bleibt unsichtbar und wird nicht lokal gespeichert.' -ForegroundColor Gray
Write-Host ''
$secure = Read-Host 'Google-App-Passwort' -AsSecureString
$pointer = [IntPtr]::Zero
$success = $false
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Replace(' ', '')
  if ($password.Length -lt 16) { throw 'Das App-Passwort ist zu kurz. Bitte das vollstaendige App-Passwort verwenden.' }
  $config = @(
    'SMTP_HOST=smtp.gmail.com'
    'SMTP_PORT=465'
    'SMTP_SECURE=true'
    'SMTP_USER=contact.breuer.apps@gmail.com'
    "SMTP_PASS=$password"
    'REQUEST_NOTIFY_TO=david.breuer@breuer-trucks.de'
  ) -join "`n"
  $config | & ssh root@212.227.45.108 "umask 027; cat > /var/www/signalerfassung.com/shared/mail.env; chown root:www-data /var/www/signalerfassung.com/shared/mail.env; chmod 0640 /var/www/signalerfassung.com/shared/mail.env"
  if ($LASTEXITCODE -ne 0) { throw 'Die geschuetzte Serverdatei konnte nicht geschrieben werden.' }
  Write-Host ''
  Write-Host 'Gmail wurde sicher auf dem Server hinterlegt.' -ForegroundColor Green
  $success = $true
} catch {
  Write-Host ''
  Write-Host 'Die Gmail-Konfiguration konnte nicht gespeichert werden:' -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Yellow
} finally {
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $password = $null
  $config = $null
  $secure = $null
}
Write-Host ''
if ($success) {
  Read-Host 'Zum Schliessen Enter druecken'
} else {
  Read-Host 'Enter druecken, um das Fenster zu schliessen und den Vorgang erneut zu starten'
  exit 1
}
