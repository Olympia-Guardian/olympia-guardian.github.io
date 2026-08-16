@echo off
REM Sauvegarde quotidienne de la base de production, lancee par le Planificateur
REM de taches de Windows. Passer par un .cmd plutot que d'appeler npm directement
REM depuis la tache : le planificateur ne resout pas les scripts PowerShell de npm
REM et n'a pas le PATH d'une session interactive.
REM
REM Installation (une fois, dans une console) :
REM   schtasks /create /tn "Codex Olympia - sauvegarde" /tr "c:\Dev\OGS\scripts\backup-task.cmd" /sc daily /st 21:00
REM Changer l'heure : refaire le /create ci-dessus avec /f. Passer par
REM /change demande un mot de passe et desactive la tache si on ne le donne pas.
REM Desinstallation :
REM   schtasks /delete /tn "Codex Olympia - sauvegarde" /f

cd /d "%~dp0.."
if not exist "backups" mkdir "backups"
echo === %DATE% %TIME% >> "backups\journal.log"
call node scripts\backup.mjs >> "backups\journal.log" 2>&1
if errorlevel 1 (
  echo ECHEC de la sauvegarde >> "backups\journal.log"
) else (
  echo OK >> "backups\journal.log"
)
