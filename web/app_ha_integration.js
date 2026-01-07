// API URLs
const API_BASE = '/api';
const API_DATA = `${API_BASE}/data`;

// Funkce pro načítání dat z Home Assistant
async function loadDataFromHA() {
    try {
        const response = await fetch(API_DATA);
        if (!response.ok) return null;
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Chyba při načítání dat:', error);
        return null;
    }
}

// Funkce pro uložení dat do Home Assistant
async function saveDataToHA(data) {
    try {
        // Přidáme metadata
        data.lastModified = new Date().toISOString();
        data.dataVersion = (data.dataVersion || 0) + 1;
        
        const response = await fetch(API_DATA, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            console.error('Chyba při ukládání dat:', response.statusText);
            return false;
        }
        
        console.log('✓ Data úspěšně uložena v Home Assistant');
        return true;
    } catch (error) {
        console.error('Chyba při komunikaci s API:', error);
        return false;
    }
}

// Rozšíření třídy ShiftScheduler
class ShiftScheduler {
    constructor() {
        this.currentTab = 'monthly-view';
        this.currentMonthView = 11;
        this.currentYearView = 2025;
        
        // Výchozí technici
        this.technicians = [
            { name: 'Honza', surname: '', phone: '', external: false, id: 'honza' },
            { name: 'Martin', surname: '', phone: '', external: false, id: 'martin' },
            { name: 'Vale', surname: '', phone: '', external: false, id: 'vale' },
            { name: 'Filip', surname: '', phone: '', external: false, id: 'filip' },
            { name: 'David', surname: '', phone: '', external: false, id: 'david' },
            { name: 'Tesárek', surname: 'Firma Formica', phone: '', external: true, id: 'tesarek' }
        ];
        
        this.schedule = new Map();
        this.operationStart = new Date('2025-11-24');
        this.operationEnd = new Date('2026-01-31');
        
        this.init();
    }
    
    async init() {
        console.log('Inicializuji aplikaci...');
        
        // Načteme data z Home Assistant
        const haData = await loadDataFromHA();
        
        if (haData && haData.data) {
            console.log('✓ Data načtena z Home Assistant');
            this.restoreFromData(haData.data);
        } else {
            console.log('Žádná data v Home Assistant, používám výchozí');
            this.initializeDefaults();
        }
        
        this.updateCurrentDate();
        this.renderTechnicians();
        this.initializeEmptySchedule();
        this.updateDisplay();
        this.bindEvents();
        this.initializeTabs();
        this.initializeMonthlyView();
        this.initializeStatistics();
        
        // Auto-save každých 30 sekund
        setInterval(() => {
            if (this.hasUnsavedChangesFlag) {
                this.saveToHA();
                this.hasUnsavedChangesFlag = false;
            }
        }, 30000);
        
        // Periodická kontrola dat
        setInterval(() => {
            this.checkAndSyncHA();
        }, 60000);
    }
    
    initializeDefaults() {
        this.schedule = new Map();
        this.operationStart = new Date('2025-11-24');
        this.operationEnd = new Date('2026-01-31');
    }
    
    restoreFromData(data) {
        if (data.technicians) {
            this.technicians = data.technicians;
        }
        if (data.period) {
            this.operationStart = new Date(data.period.start);
            this.operationEnd = new Date(data.period.end);
        }
        if (data.schedule) {
            Object.keys(data.schedule).forEach(date => {
                this.schedule.set(date, data.schedule[date]);
            });
        }
    }
    
    async saveToHA() {
        // Příprava dat pro uložení
        const dataToSave = {
            version: '2.0',
            lastModified: new Date().toISOString(),
            dataVersion: 1,
            data: {
                technicians: this.technicians,
                period: {
                    start: this.formatDateISO(this.operationStart),
                    end: this.formatDateISO(this.operationEnd)
                },
                schedule: Object.fromEntries(this.schedule)
            }
        };
        
        const success = await saveDataToHA(dataToSave);
        if (success) {
            this.showNotification('✓ Data uložena', 'success');
        }
    }
    
    async checkAndSyncHA() {
        // Periodická synchronizace s Home Assistant
        const haData = await loadDataFromHA();
        if (haData && haData.data) {
            const haDataVersion = haData.dataVersion || 0;
            const localDataVersion = this.currentDataVersion || 0;
            
            if (haDataVersion > localDataVersion) {
                console.log('Novější verze dat v Home Assistant, synchronizuji...');
                this.restoreFromData(haData.data);
                this.updateDisplay();
            }
        }
    }
    
    onScheduleChanged() {
        this.hasUnsavedChangesFlag = true;
        this.updateDisplay();
        
        // Okamžité uložení při kritických změnách
        this.saveToHA();
    }
    
    formatDateISO(date) {
        return date.toISOString().split('T')[0];
    }
    
    updateCurrentDate() {
        const today = new Date();
        const dateStr = today.toLocaleDateString('cs-CZ', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const el = document.getElementById('currentDate');
        if (el) {
            el.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
        }
    }
    
    renderTechnicians() {
        // Vykreslení techniků (byl v původním app.js)
    }
    
    initializeEmptySchedule() {
        // Inicializace prázdného rozvrhu
    }
    
    updateDisplay() {
        // Aktualizace zobrazení
    }
    
    bindEvents() {
        // Binding event listenerů
    }
    
    initializeTabs() {
        // Inicializace záložek
    }
    
    initializeMonthlyView() {
        // Měsíční pohled
    }
    
    initializeStatistics() {
        // Statistiky
    }
    
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Vytvoříme vizuální notifikaci (optional)
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            background: ${type === 'success' ? '#2ecc71' : '#e74c3c'};
            color: white;
            border-radius: 5px;
            z-index: 9999;
            animation: slideIn 0.3s ease-in-out;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Spustíme aplikaci
document.addEventListener('DOMContentLoaded', () => {
    window.shiftScheduler = new ShiftScheduler();
});
