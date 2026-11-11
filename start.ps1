# Meridian — start everything on Windows:  powershell -ExecutionPolicy Bypass -File start.ps1
# Opens three windows: core (FastAPI :8000), voice (OmniVoice :8102), web (Next.js :3000).
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$env:HF_HUB_DISABLE_SYMLINKS_WARNING = "1"

if (-not (Test-Path "$root\.venv")) { Write-Host "Run setup first: see README.md (Setup)"; exit 1 }
if (-not (Test-Path "$root\vendor\day-trader-skill-in")) { & "$root\.venv\Scripts\python.exe" "$root\scripts\make_india_edition.py" }

Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; .\.venv\Scripts\python.exe -m uvicorn core.main:app --host 127.0.0.1 --port 8000"
if (Test-Path "$root\voice-tts\.venv") {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root'; .\voice-tts\.venv\Scripts\python.exe -m uvicorn server:app --app-dir voice-tts --host 127.0.0.1 --port 8102"
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$root\web'; npm run dev"
Start-Sleep -Seconds 8
Start-Process "http://localhost:3000"
