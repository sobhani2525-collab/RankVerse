@echo off
rem Weekly translation run (free-allowance gateways): overviews of the most
rem voted titles first, then people biographies. Each script stops cleanly on
rem the first 429, so this is safe to schedule. Needs the venv, .env pointing
rem at the production DB (public access ON in Liara) and the gateway key.
cd /d "%~dp0\.."
call venv\Scripts\activate.bat
python scripts\translate_overviews_direct.py --workers 4 --no-thinking --yes
python scripts\translate_biographies_direct.py --workers 4 --no-thinking --yes
