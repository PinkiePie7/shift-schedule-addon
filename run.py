#!/usr/bin/env python3
"""
Home Assistant Add-on: Shift Schedule Manager
Webový server pro správu pracovních směn s integrací do Home Assistant
"""

import os
import json
import logging
from datetime import datetime
from pathlib import Path
from http.server import HTTPServer, SimpleHTTPRequestHandler
import threading
import time

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cesty pro Home Assistant
CONFIG_DIR = Path("/config/shift_schedule")
DATA_FILE = CONFIG_DIR / "schedule_data.json"
BACKUP_DIR = CONFIG_DIR / "backups"
WEB_DIR = Path("/app/web")

class ShiftScheduleHandler(SimpleHTTPRequestHandler):
    """HTTP handler s podporou API"""
    
    def do_GET(self):
        """GET requests - poskytujeme web soubory a API"""
        if self.path.startswith('/api/'):
            self.handle_api_get()
        else:
            # Serve static files
            super().do_GET()
    
    def do_POST(self):
        """POST requests - ukládáme data"""
        if self.path.startswith('/api/'):
            self.handle_api_post()
        else:
            self.send_error(404)
    
    def handle_api_get(self):
        """Načítáme data z Home Assistant"""
        if self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            if DATA_FILE.exists():
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.wfile.write(json.dumps(data).encode())
            else:
                self.wfile.write(json.dumps({"error": "No data found"}).encode())
        else:
            self.send_error(404)
    
    def handle_api_post(self):
        """Ukládáme data do Home Assistant"""
        if self.path == '/api/data':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
                
                # Vytvoříme backup původních dat
                if DATA_FILE.exists():
                    self.create_backup()
                
                # Uložíme nová data
                CONFIG_DIR.mkdir(parents=True, exist_ok=True)
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                logger.info(f"Data uložena: {DATA_FILE}")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "ok"}).encode())
                
            except json.JSONDecodeError:
                self.send_error(400, "Invalid JSON")
            except Exception as e:
                logger.error(f"Chyba při ukládání dat: {e}")
                self.send_error(500, str(e))
        else:
            self.send_error(404)
    
    def create_backup(self):
        """Vytvoříme backup dat"""
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = BACKUP_DIR / f"backup_{timestamp}.json"
        
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
        
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, indent=2, ensure_ascii=False)
        
        # Uchovej pouze posledních 10 backupů
        backups = sorted(BACKUP_DIR.glob("backup_*.json"))
        if len(backups) > 10:
            for old_backup in backups[:-10]:
                old_backup.unlink()
                logger.info(f"Starý backup smazán: {old_backup.name}")
        
        logger.info(f"Backup vytvořen: {backup_file.name}")
    
    def end_headers(self):
        """Přidáme CORS headers"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()
    
    def do_OPTIONS(self):
        """Podpora CORS"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

def run_server():
    """Spustíme HTTP server"""
    os.chdir(WEB_DIR)
    
    server_address = ('0.0.0.0', 8080)
    httpd = HTTPServer(server_address, ShiftScheduleHandler)
    
    logger.info("=" * 60)
    logger.info("Shift Schedule Manager spuštěn")
    logger.info("Otevřete: http://homeassistant.local:8080")
    logger.info("Datový soubor: /config/shift_schedule/schedule_data.json")
    logger.info("Backupy: /config/shift_schedule/backups/")
    logger.info("=" * 60)
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Server vypnut.")
        httpd.server_close()

if __name__ == '__main__':
    # Inicializujeme strukturu
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    
    # Spustíme server
    run_server()
