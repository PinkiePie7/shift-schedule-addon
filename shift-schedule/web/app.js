// Manual Shift Scheduling System with Data Management
class ShiftScheduler {
    constructor() {
        this.currentTab = 'monthly-view'; // Changed default to monthly view
        this.currentMonthView = 11; // November
        this.currentYearView = 2025;
        this.technicians = [
            { name: 'Honza', surname: '', phone: '', external: false, id: 'honza' },
            { name: 'Martin', surname: '', phone: '', external: false, id: 'martin' },
            { name: 'Vale', surname: '', phone: '', external: false, id: 'vale' },
            { name: 'Filip', surname: '', phone: '', external: false, id: 'filip' },
            { name: 'David', surname: '', phone: '', external: false, id: 'david' },
            { name: 'Tesárek', surname: 'Firma Formica', phone: '', external: true, id: 'tesarek' }
        ];
        
        this.schedule = new Map(); // Manual assignments
        this.operationStart = new Date('2025-11-24');
        this.operationEnd = new Date('2026-01-31');
        
        // Period management
        this.defaultPeriod = {
            start: '2025-11-24',
            end: '2026-01-31'
        };
        this.pendingPeriod = null;
        
        this.editingIndex = -1;
        this.currentAssignmentDate = null;
        this.validationRules = {
            maxConsecutiveNights: 5,
            minDaysOffPerWeek: 1,
            noDoubleShifts: true
        };
        
        // Data management properties
        this.dataManager = new DataManager(this);
        this.autoSyncManager = new AutoSyncManager(this);
        this.networkSettings = {
            sharedFolderPath: '',
            autoSync: false,
            syncInterval: 300000 // 5 minutes
        };
        this.lastSyncTime = null;
        this.syncStatus = 'offline';
        this.backups = [];
        this.dataVersion = 1;
        this.lastModified = new Date().toISOString();
        this.currentUser = 'user';
        this.hasUnsavedChangesFlag = false;
        
        this.init();
    }
    
    init() {
        this.updateCurrentDate();
        this.renderTechnicians();
        this.initializeEmptySchedule();
        this.updateDisplay();
        this.bindEvents();
        this.initializeTabs();
        this.initializeMonthlyView();
        this.initializeStatistics();
        this.updateValidationSummary();
        this.initializeDataManagement();
        this.initializePeriodSettings();
        
        // Update current date every minute
        setInterval(() => {
            this.updateCurrentDate();
            this.updateValidationSummary();
        }, 60000);
    }

    // --- PERIOD SETTINGS LOGIC ---

    initializePeriodSettings() {
        // Fill form with current period
        document.getElementById('periodStartDate').value = this.operationStart.toISOString().substr(0, 10);
        document.getElementById('periodEndDate').value = this.operationEnd.toISOString().substr(0, 10);
        this.updatePeriodDisplay();
    }

    bindPeriodEvents() {
        document.getElementById('savePeriodBtn').addEventListener('click', () => {
            const proposedStart = document.getElementById('periodStartDate').value;
            const proposedEnd = document.getElementById('periodEndDate').value;
            const validation = this.validatePeriod(proposedStart, proposedEnd);
            if (!validation.valid) {
                this.showPeriodWarning(validation.message);
                return;
            }
            if (!this.periodChangeRequiresConfirmation(proposedStart, proposedEnd)) {
                this.applyPeriodChange(proposedStart, proposedEnd);
            } else {
                this.pendingPeriod = { start: proposedStart, end: proposedEnd };
                this.showPeriodConfirmation(proposedStart, proposedEnd);
            }
        });
        document.getElementById('resetPeriodBtn').addEventListener('click', () => {
            document.getElementById('periodStartDate').value = this.defaultPeriod.start;
            document.getElementById('periodEndDate').value = this.defaultPeriod.end;
            this.showPeriodWarning();
        });
        document.getElementById('closePeriodConfirm').addEventListener('click', () => {
            document.getElementById('periodConfirmModal').classList.remove('show');
        });
        document.getElementById('cancelPeriodChangeBtn').addEventListener('click', () => {
            document.getElementById('periodConfirmModal').classList.remove('show');
        });
        document.getElementById('confirmPeriodChangeBtn').addEventListener('click', () => {
            if (this.pendingPeriod) {
                this.applyPeriodChange(this.pendingPeriod.start, this.pendingPeriod.end);
                document.getElementById('periodConfirmModal').classList.remove('show');
                this.pendingPeriod = null;
            }
        });
    }

    validatePeriod(startStr, endStr) {
        // Returns { valid: bool, message: string }
        if (!startStr || !endStr) return { valid: false, message: 'Vyplňte obě data.' };
        const start = new Date(startStr);
        const end = new Date(endStr);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return { valid: false, message: 'Neplatné datum.' };
        if (start >= end) return { valid: false, message: 'Datum začátku musí být před datem konce.' };
        const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays < 7) return { valid: false, message: 'Období musí být alespoň 7 dní.' };
        if (diffDays > 366) return { valid: false, message: 'Období nesmí být delší než 1 rok.' };
        return { valid: true };
    }

    showPeriodWarning(msg) {
        const warnDiv = document.getElementById('periodWarnings');
        const contentDiv = document.getElementById('periodWarningContent');
        if (msg) {
            warnDiv.style.display = 'block';
            contentDiv.textContent = msg;
        } else {
            warnDiv.style.display = 'none';
            contentDiv.textContent = '';
        }
    }

    periodChangeRequiresConfirmation(startStr, endStr) {
        const start = new Date(startStr);
        const end = new Date(endStr);
        // If assignments exist outside the new period, require confirmation
        for (const key of this.schedule.keys()) {
            const d = new Date(key);
            if (d < start || d > end) {
                const s = this.schedule.get(key);
                if (s && this.isDayFullyAssigned(s)) {
                    return true;
                }
            }
        }
        return false;
    }

    showPeriodConfirmation(newStartStr, newEndStr) {
        // Fill modal info
        document.getElementById('currentPeriodInfo').textContent = `${this.formatCzDate(this.operationStart)} - ${this.formatCzDate(this.operationEnd)}`;
        document.getElementById('newPeriodInfo').textContent = `${this.formatCzDate(new Date(newStartStr))} - ${this.formatCzDate(new Date(newEndStr))}`;
        // Calculate days impact
        const newStart = new Date(newStartStr), newEnd = new Date(newEndStr);
        const oldStart = this.operationStart, oldEnd = this.operationEnd;
        const oldTotalDays = Math.ceil((oldEnd - oldStart)/(1000*60*60*24)) + 1;
        const newTotalDays = Math.ceil((newEnd-newStart)/(1000*60*60*24)) + 1;
        const added = newTotalDays - oldTotalDays;
        let html = `<div class='impact-item'><span>Celkový počet dní</span> <span class='impact-value ${added>0?'positive':(added<0?'negative':'') }'>${oldTotalDays} → ${newTotalDays} (${added>0?'+':''}${added})</span></div>`;
        // Find how many assignments will be lost
        let lost = 0;
        for (const key of this.schedule.keys()) {
            const d = new Date(key);
            if (d < newStart || d > newEnd) {
                const s = this.schedule.get(key);
                if (s && this.isDayFullyAssigned(s)) lost++;
            }
        }
        html += `<div class='impact-item'><span>Dotčené dny s přiřazeními</span> <span class='impact-value negative'>${lost}</span></div>`;
        document.getElementById('periodImpact').innerHTML = html;
        document.getElementById('periodConfirmModal').classList.add('show');
    }

    formatCzDate(date) {
        return date.toLocaleDateString('cs-CZ');
    }

    applyPeriodChange(startStr, endStr) {
        // Save backup before change
        this.createBackup();
        this.operationStart = new Date(startStr);
        this.operationEnd = new Date(endStr);
        // Remove assignments outside period
        for (const key of [...this.schedule.keys()]) {
            const d = new Date(key);
            if (d < this.operationStart || d > this.operationEnd) {
                this.schedule.delete(key);
            }
        }
        // Rebuild schedule for missing days (fill empty)
        let currentDate = new Date(this.operationStart);
        while (currentDate <= this.operationEnd) {
            const k = this.formatDate(currentDate);
            if (!this.schedule.has(k)) {
                this.schedule.set(k, {
                    morning: [], afternoon: [], night: [], standby: '', external: ''
                });
            }
            currentDate.setDate(currentDate.getDate()+1);
        }
        // Save to storage, update UI
        this.saveToStorage();
        this.updatePeriodDisplay();
        this.updateAllDisplays();
        // Hide warning
        this.showPeriodWarning();
    }

    updatePeriodDisplay() {
        // Header and in settings rules
        const display = `${this.formatCzDate(this.operationStart)} - ${this.formatCzDate(this.operationEnd)}`;
        const totalDays = Math.ceil((this.operationEnd-this.operationStart)/(1000*60*60*24))+1;
        document.getElementById('currentPeriodDisplay').textContent = display;
        document.getElementById('totalPeriodDays').textContent = totalDays + ' dní';
        const el = document.getElementById('settingsOperationPeriod');
        if (el) el.textContent = display;
    }

    updateCurrentDate() {
        const now = new Date();
        const options = { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        };
        document.getElementById('currentDate').textContent = 
            now.toLocaleDateString('cs-CZ', options);
    }
    
    bindEvents() {
        // Settings modal
        document.getElementById('settingsBtn').addEventListener('click', () => {
            document.getElementById('settingsModal').classList.add('show');
        });
        
        document.getElementById('closeSettings').addEventListener('click', () => {
            document.getElementById('settingsModal').classList.remove('show');
            this.resetForm();
        });
        
        // Shift assignment modal
        document.getElementById('closeAssignment').addEventListener('click', () => {
            document.getElementById('assignmentModal').classList.remove('show');
        });
        
        document.getElementById('saveAssignment').addEventListener('click', () => {
            this.saveShiftAssignment();
        });
        
        document.getElementById('clearDay').addEventListener('click', () => {
            this.clearDayAssignments();
        });
        
        document.getElementById('cancelAssignment').addEventListener('click', () => {
            document.getElementById('assignmentModal').classList.remove('show');
        });
        
        // Validation report modal
        document.getElementById('validationReport').addEventListener('click', () => {
            this.showValidationReport();
        });
        
        document.getElementById('closeValidation').addEventListener('click', () => {
            document.getElementById('validationModal').classList.remove('show');
        });
        
        document.getElementById('clearMonth').addEventListener('click', () => {
            if (confirm('Opravdu chcete vymazat všechna přiřazení pro tento měsíc?')) {
                this.clearMonthAssignments();
            }
        });
        
        // Assignment form change listeners
        ['morningTech1', 'morningTech2', 'afternoonTech1', 'afternoonTech2', 'nightTech1', 'nightTech2', 'standbyTech', 'externalTech'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                this.validateCurrentAssignment();
            });
        });
        
        // Technician form
        document.getElementById('technicianForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveTechnician();
        });
        
        document.getElementById('cancelForm').addEventListener('click', () => {
            this.resetForm();
        });
        
        document.getElementById('deleteBtn').addEventListener('click', () => {
            this.deleteTechnician();
        });
        
        // Tab navigation
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = e.currentTarget.dataset.tab;
                console.log('Tab clicked:', tabId);
                this.switchTab(tabId);
            });
        });
        
        // Monthly view controls
        document.getElementById('prevMonth').addEventListener('click', () => {
            this.changeMonth(-1);
        });
        
        document.getElementById('nextMonth').addEventListener('click', () => {
            this.changeMonth(1);
        });
        
        document.getElementById('printMonthly').addEventListener('click', () => {
            this.printMonthlyView();
        });
        
        document.getElementById('exportMonthly').addEventListener('click', () => {
            this.exportMonthlyView();
        });
        
        // Statistics controls
        document.getElementById('monthFilter').addEventListener('change', () => {
            this.updateStatistics();
        });
        
        document.getElementById('shiftFilter').addEventListener('change', () => {
            this.updateStatistics();
        });
        
        document.getElementById('printStats').addEventListener('click', () => {
            this.printStatistics();
        });
        
        document.getElementById('exportStats').addEventListener('click', () => {
            this.exportStatistics();
        });
        
        // Close modals on outside click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                e.target.classList.remove('show');
                this.resetForm();
            }
        });
        
        // Load saved data on startup
        this.loadFromStorage();
        
        // Update period display
        this.updatePeriodDisplay();
        
        // Data management event handlers
        this.bindDataManagementEvents();
        
        // Period management event handlers
        this.bindPeriodEvents();
    }
    
    initializeEmptySchedule() {
        // Initialize empty schedule for manual assignment
        this.schedule.clear();
        // Create a new date object to avoid modifying the original
        let currentDate = new Date(this.operationStart);
        currentDate.setHours(0, 0, 0, 0);
        const endDate = new Date(this.operationEnd);
        endDate.setHours(0, 0, 0, 0);
        
        // Use <= to include both start and end dates
        while (currentDate <= endDate) {
            const dateStr = this.formatDate(currentDate);
            this.schedule.set(dateStr, {
                morning: [],
                afternoon: [],
                night: [],
                standby: '',
                external: ''
            });
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }
    
    openAssignmentDialog(date) {
        console.log('Opening assignment dialog for:', date);
        
        // Normalize dates for comparison
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        const opStart = new Date(this.operationStart);
        opStart.setHours(0, 0, 0, 0);
        const opEnd = new Date(this.operationEnd);
        opEnd.setHours(0, 0, 0, 0);
        
        if (checkDate < opStart || checkDate > opEnd) {
            console.log('Date outside operation period');
            return; // Don't allow assignment outside operation period
        }
        
        // Store normalized date
        this.currentAssignmentDate = checkDate;
        const dateStr = this.formatDate(checkDate);
        
        console.log('Dialog date normalized:', checkDate, 'DateStr:', dateStr);
        
        const existingShifts = this.schedule.get(dateStr) || {
            morning: [], afternoon: [], night: [], standby: '', external: ''
        };
        
        console.log('Existing shifts for', dateStr, ':', existingShifts);
        console.log('Schedule keys:', Array.from(this.schedule.keys()));
        
        // Update modal title with normalized date
        const titleElement = document.getElementById('assignmentModalTitle');
        if (titleElement) {
            titleElement.textContent = 
                `Zadání směn pro ${checkDate.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`;
        }
        
        // Populate technician dropdowns
        this.populateTechnicianSelectors();
        
        // Set current values
        const elements = {
            morningTech1: document.getElementById('morningTech1'),
            morningTech2: document.getElementById('morningTech2'),
            afternoonTech1: document.getElementById('afternoonTech1'),
            afternoonTech2: document.getElementById('afternoonTech2'),
            nightTech1: document.getElementById('nightTech1'),
            nightTech2: document.getElementById('nightTech2'),
            standbyTech: document.getElementById('standbyTech'),
            externalTech: document.getElementById('externalTech')
        };
        
        if (elements.morningTech1) elements.morningTech1.value = existingShifts.morning[0] || '';
        if (elements.morningTech2) elements.morningTech2.value = existingShifts.morning[1] || '';
        if (elements.afternoonTech1) elements.afternoonTech1.value = existingShifts.afternoon[0] || '';
        if (elements.afternoonTech2) elements.afternoonTech2.value = existingShifts.afternoon[1] || '';
        if (elements.nightTech1) elements.nightTech1.value = existingShifts.night[0] || '';
        if (elements.nightTech2) elements.nightTech2.value = existingShifts.night[1] || '';
        if (elements.standbyTech) elements.standbyTech.value = existingShifts.standby || '';
        if (elements.externalTech) elements.externalTech.value = existingShifts.external || '';
        
        // Validate current assignment
        this.validateCurrentAssignment();
        
        // Show modal
        const modal = document.getElementById('assignmentModal');
        if (modal) {
            modal.classList.add('show');
            console.log('Assignment modal shown');
        } else {
            console.error('Assignment modal not found');
        }
    }
    
    populateTechnicianSelectors() {
        const coreTechnicians = this.technicians.filter(t => !t.external);
        const externalTechnicians = this.technicians.filter(t => t.external);
        
        // Core technician selectors
        ['morningTech1', 'morningTech2', 'afternoonTech1', 'afternoonTech2', 'nightTech1', 'nightTech2', 'standbyTech'].forEach(id => {
            const select = document.getElementById(id);
            select.innerHTML = '<option value="">Nezadáno</option>';
            
            coreTechnicians.forEach(tech => {
                const option = document.createElement('option');
                option.value = tech.name;
                option.textContent = tech.name;
                select.appendChild(option);
            });
        });
        
        // External technician selector
        const externalSelect = document.getElementById('externalTech');
        externalSelect.innerHTML = '<option value="">Nezadáno</option>';
        
        externalTechnicians.forEach(tech => {
            const option = document.createElement('option');
            option.value = tech.name;
            option.textContent = `${tech.name} (${tech.surname})`;
            externalSelect.appendChild(option);
        });
    }
    
    updateDisplay() {
        this.updateCurrentDayDisplay();
        this.updateWeeklySchedule();
    }
    
    updateCurrentDayDisplay() {
        // Create today's date at midnight to avoid timezone issues
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayStr = this.formatDate(today);
        
        console.log('Current day display - Today:', today, 'TodayStr:', todayStr);
        console.log('Schedule has today:', this.schedule.has(todayStr));
        
        // Normalize dates for comparison
        const todayCheck = new Date(today);
        todayCheck.setHours(0, 0, 0, 0);
        const opStartCheck = new Date(this.operationStart);
        opStartCheck.setHours(0, 0, 0, 0);
        const opEndCheck = new Date(this.operationEnd);
        opEndCheck.setHours(0, 0, 0, 0);
        
        // Check if today is within operation period
        if (todayCheck < opStartCheck || todayCheck > opEndCheck) {
            // Show message for outside operation period
            const message = today < this.operationStart ? 
                `Pracovní období začíná ${this.formatCzDate(this.operationStart)}` :
                `Pracovní období skončilo ${this.formatCzDate(this.operationEnd)}`;
            
            document.getElementById('currentMorning').textContent = message;
            document.getElementById('currentAfternoon').textContent = '-';
            document.getElementById('currentNight').textContent = '-';
            document.getElementById('currentStandby').textContent = 'Pohotovost: -';
            document.getElementById('currentExternal').textContent = '-';
            return;
        }
        
        const todayShifts = this.schedule.get(todayStr);
        console.log('Today shifts data:', todayShifts);
        
        if (todayShifts) {
            document.getElementById('currentMorning').textContent = 
                todayShifts.morning.length > 0 ? todayShifts.morning.join(', ') : '-';
            document.getElementById('currentAfternoon').textContent = 
                todayShifts.afternoon.length > 0 ? todayShifts.afternoon.join(', ') : '-';
            document.getElementById('currentNight').textContent = 
                todayShifts.night.length > 0 ? todayShifts.night.join(', ') : '-';
            document.getElementById('currentStandby').textContent = 
                `Pohotovost: ${todayShifts.standby || '-'}`;
            document.getElementById('currentExternal').textContent = 
                todayShifts.external || '-';
        } else {
            document.getElementById('currentMorning').textContent = '-';
            document.getElementById('currentAfternoon').textContent = '-';
            document.getElementById('currentNight').textContent = '-';
            document.getElementById('currentStandby').textContent = 'Pohotovost: -';
            document.getElementById('currentExternal').textContent = '-';
        }
    }
    
    updateWeeklySchedule() {
        const tbody = document.getElementById('scheduleBody');
        tbody.innerHTML = '';
        
        // Create today's date at midnight to avoid timezone issues
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() + 1); // Start from tomorrow
        
        // Normalize dates for comparison
        const todayNorm = new Date(today);
        todayNorm.setHours(0, 0, 0, 0);
        const opEndNorm = new Date(this.operationEnd);
        opEndNorm.setHours(0, 0, 0, 0);
        const opStartNorm = new Date(this.operationStart);
        opStartNorm.setHours(0, 0, 0, 0);
        
        // Check if current period is active
        if (todayNorm > opEndNorm) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.textContent = 'Pracovní období již skončilo.';
            cell.style.textAlign = 'center';
            cell.style.fontStyle = 'italic';
            cell.style.color = 'var(--color-text-secondary)';
            row.appendChild(cell);
            tbody.appendChild(row);
            return;
        }
        
        if (todayNorm < opStartNorm) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.textContent = `Pracovní období začíná ${this.formatCzDate(this.operationStart)}.`;
            cell.style.textAlign = 'center';
            cell.style.fontStyle = 'italic';
            cell.style.color = 'var(--color-text-secondary)';
            row.appendChild(cell);
            tbody.appendChild(row);
            return;
        }
        
        for (let i = 0; i < 7; i++) {
            const date = new Date(startDate);
            date.setDate(date.getDate() + i);
            
            // Normalize for comparison
            const dateNorm = new Date(date);
            dateNorm.setHours(0, 0, 0, 0);
            const opEndNorm2 = new Date(this.operationEnd);
            opEndNorm2.setHours(0, 0, 0, 0);
            const opStartNorm2 = new Date(this.operationStart);
            opStartNorm2.setHours(0, 0, 0, 0);
            
            if (dateNorm > opEndNorm2) break;
            if (dateNorm < opStartNorm2) continue;
            
            const dateStr = this.formatDate(date);
            const shifts = this.schedule.get(dateStr);
            
            const row = document.createElement('tr');
            
            // Add validation styling
            const validation = this.validateDayAssignment(dateStr);
            if (validation.hasErrors) {
                row.classList.add('has-errors');
                row.style.backgroundColor = 'rgba(var(--color-error-rgb), 0.05)';
            } else if (validation.hasWarnings) {
                row.classList.add('has-warnings');
                row.style.backgroundColor = 'rgba(var(--color-warning-rgb), 0.05)';
            }
            
            // Date cell with working edit button
            const dateCell = document.createElement('td');
            dateCell.className = 'date-cell';
            const dateText = date.toLocaleDateString('cs-CZ', {
                weekday: 'short',
                day: 'numeric',
                month: 'short'
            });
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn--sm btn--outline';
            editBtn.textContent = 'Upravit';
            editBtn.style.marginLeft = '8px';
            editBtn.style.fontSize = '10px';
            editBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openAssignmentDialog(new Date(date));
            });
            dateCell.innerHTML = dateText + ' ';
            dateCell.appendChild(editBtn);
            row.appendChild(dateCell);
            
            // Morning shift cell
            const morningCell = document.createElement('td');
            morningCell.className = 'shift-cell';
            morningCell.textContent = shifts?.morning.length > 0 ? shifts.morning.join(', ') : '-';
            row.appendChild(morningCell);
            
            // Afternoon shift cell
            const afternoonCell = document.createElement('td');
            afternoonCell.className = 'shift-cell';
            afternoonCell.textContent = shifts?.afternoon.length > 0 ? shifts.afternoon.join(', ') : '-';
            row.appendChild(afternoonCell);
            
            // Night shift cell
            const nightCell = document.createElement('td');
            nightCell.className = 'shift-cell';
            if (shifts?.night.length > 0) {
                nightCell.innerHTML = `${shifts.night.join(', ')}`;
                if (shifts.standby) {
                    nightCell.innerHTML += `<span class="standby-indicator">Pohotovost: ${shifts.standby}</span>`;
                }
            } else if (shifts?.standby) {
                nightCell.innerHTML = `<span style="font-style: italic;">Jen pohotovost: ${shifts.standby}</span>`;
            } else {
                nightCell.textContent = '-';
            }
            row.appendChild(nightCell);
            
            // External technician cell (read-only display)
            const externalCell = document.createElement('td');
            externalCell.className = 'external-cell';
            externalCell.textContent = shifts?.external || '-';
            row.appendChild(externalCell);
            
            tbody.appendChild(row);
        }
    }
    
    renderTechnicians() {
        const grid = document.getElementById('techniciansGrid');
        grid.innerHTML = '';
        
        this.technicians.forEach((tech, index) => {
            const item = document.createElement('div');
            item.className = 'technician-item';
            
            const info = document.createElement('div');
            info.className = 'technician-info';
            
            const name = document.createElement('div');
            name.className = 'technician-name';
            name.textContent = `${tech.name} ${tech.surname}`.trim();
            
            const type = document.createElement('span');
            type.className = `technician-type ${tech.external ? 'external' : ''}`;
            type.textContent = tech.external ? 'Externí' : 'Základní';
            name.appendChild(type);
            
            const details = document.createElement('div');
            details.className = 'technician-details';
            details.textContent = tech.phone || 'Bez telefonu';
            
            info.appendChild(name);
            info.appendChild(details);
            
            const actions = document.createElement('div');
            actions.className = 'technician-actions';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn--sm btn--secondary';
            editBtn.textContent = 'Upravit';
            editBtn.onclick = () => this.editTechnician(index);
            
            actions.appendChild(editBtn);
            
            item.appendChild(info);
            item.appendChild(actions);
            grid.appendChild(item);
        });
    }
    
    editTechnician(index) {
        const tech = this.technicians[index];
        this.editingIndex = index;
        
        document.getElementById('formTitle').textContent = 'Upravit technika';
        document.getElementById('firstName').value = tech.name;
        document.getElementById('lastName').value = tech.surname;
        document.getElementById('phone').value = tech.phone;
        document.getElementById('external').checked = tech.external;
        document.getElementById('editIndex').value = index;
        document.getElementById('deleteBtn').style.display = 'inline-block';
    }
    
    saveTechnician() {
        const name = document.getElementById('firstName').value.trim();
        const surname = document.getElementById('lastName').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const external = document.getElementById('external').checked;
        const editIndex = parseInt(document.getElementById('editIndex').value);
        
        if (!name) {
            alert('Křestní jméno je povinné!');
            return;
        }
        
        const technician = { name, surname, phone, external };
        
        if (editIndex >= 0) {
            // Update existing technician
            const oldTech = this.technicians[editIndex];
            this.technicians[editIndex] = technician;
            
            // Update schedule if name changed
            if (oldTech.name !== name) {
                this.updateScheduleForRenamedTechnician(oldTech.name, name);
            }
        } else {
            // Add new technician
            this.technicians.push(technician);
        }
        
        this.renderTechnicians();
        this.resetForm();
        
        // Mark data as changed
        this.markDataChanged();
        
        // Update displays when technicians are modified
        this.updateDisplay();
        this.updateMonthlyView();
        this.updateValidationSummary();
    }
    
    updateScheduleForRenamedTechnician(oldName, newName) {
        for (const [date, shifts] of this.schedule) {
            if (shifts.morning.includes(oldName)) {
                const index = shifts.morning.indexOf(oldName);
                shifts.morning[index] = newName;
            }
            if (shifts.afternoon.includes(oldName)) {
                const index = shifts.afternoon.indexOf(oldName);
                shifts.afternoon[index] = newName;
            }
            if (shifts.night.includes(oldName)) {
                const index = shifts.night.indexOf(oldName);
                shifts.night[index] = newName;
            }
            if (shifts.standby === oldName) {
                shifts.standby = newName;
            }
            if (shifts.external === oldName) {
                shifts.external = newName;
            }
        }
    }
    
    deleteTechnician() {
        if (this.editingIndex >= 0) {
            const tech = this.technicians[this.editingIndex];
            
            if (confirm(`Opravdu chcete smazat technika ${tech.name}?`)) {
                this.technicians.splice(this.editingIndex, 1);
                this.renderTechnicians();
                this.resetForm();
                
                // Update displays after deletion
                this.updateDisplay();
                this.updateMonthlyView();
                this.updateValidationSummary();
            }
        }
    }
    
    resetForm() {
        document.getElementById('technicianForm').reset();
        document.getElementById('formTitle').textContent = 'Přidat technika';
        document.getElementById('editIndex').value = '-1';
        document.getElementById('deleteBtn').style.display = 'none';
        this.editingIndex = -1;
    }
    
    formatDate(date) {
        // Ensure consistent date formatting without timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    
    initializeTabs() {
        this.switchTab('monthly-view'); // Start with monthly view as primary
    }
    
    switchTab(tabId) {
        // Handle settings as modal
        if (tabId === 'settings') {
            document.getElementById('settingsModal').classList.add('show');
            return;
        }
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            }
        });
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const targetContent = document.getElementById(tabId);
        if (targetContent) {
            targetContent.classList.add('active');
            console.log('Switched to tab:', tabId);
        } else {
            console.error('Tab content not found:', tabId);
        }
        
        this.currentTab = tabId;
        
        // Always fully update all displays (sync date)
        this.updateAllDisplays();
        
        // Update content based on active tab
        if (tabId === 'monthly-view') {
            this.updateMonthlyView();
        } else if (tabId === 'statistics') {
            this.updateStatistics();
        } else if (tabId === 'current-week') {
            this.updateDisplay();
        } else if (tabId === 'data-management') {
            this.updateSyncStatus();
            this.updateBackupList();
        }
    }
    
    initializeMonthlyView() {
        // Set current month view to first month of operation period
        const periodMonths = this.getPeriodMonths();
        if (periodMonths.length > 0) {
            this.currentMonthView = periodMonths[0].month;
            this.currentYearView = periodMonths[0].year;
        }
        this.updateMonthlyView();
    }
    
    changeMonth(direction) {
        const periodMonths = this.getPeriodMonths();
        const currentIndex = periodMonths.findIndex(m => m.month === this.currentMonthView && m.year === this.currentYearView);
        
        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= periodMonths.length) newIndex = periodMonths.length - 1;
        
        if (newIndex !== currentIndex) {
            this.currentMonthView = periodMonths[newIndex].month;
            this.currentYearView = periodMonths[newIndex].year;
        }
        
        this.updateMonthDisplay();
        this.updateMonthlyView();
    }
    
    updateMonthDisplay() {
        const monthNames = {
            1: 'Leden', 2: 'Únor', 3: 'Březen', 4: 'Duben', 5: 'Květen', 6: 'Červen',
            7: 'Červenec', 8: 'Srpen', 9: 'Září', 10: 'Říjen', 11: 'Listopad', 12: 'Prosinec'
        };
        
        const periodMonths = this.getPeriodMonths();
        if (periodMonths.length === 1) {
            // Single month view
            document.getElementById('currentMonthDisplay').textContent = 
                `${monthNames[this.currentMonthView]} ${this.currentYearView}`;
        } else {
            // Multi-month view
            const firstMonth = periodMonths[0];
            const lastMonth = periodMonths[periodMonths.length - 1];
            document.getElementById('currentMonthDisplay').textContent = 
                `${monthNames[firstMonth.month]} ${firstMonth.year} - ${monthNames[lastMonth.month]} ${lastMonth.year}`;
        }
    }
    
    updateMonthlyView() {
        this.updateMonthDisplay();
        this.generateCalendars();
    }
    
    getPeriodMonths() {
        // Get all months within the operational period
        const months = [];
        let currentDate = new Date(this.operationStart.getFullYear(), this.operationStart.getMonth(), 1);
        const endMonth = new Date(this.operationEnd.getFullYear(), this.operationEnd.getMonth(), 1);
        
        while (currentDate <= endMonth) {
            months.push({
                month: currentDate.getMonth() + 1,
                year: currentDate.getFullYear()
            });
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        
        return months;
    }
    
    generateCalendars() {
        const container = document.getElementById('calendarsContainer');
        container.innerHTML = '';
        
        // Generate calendars for all months within the operation period
        const periodMonths = this.getPeriodMonths();
        
        periodMonths.forEach(({month, year}) => {
            const calendar = this.createCalendar(month, year);
            container.appendChild(calendar);
        });
    }
    
    createCalendar(month, year) {
        const calendar = document.createElement('div');
        calendar.className = 'calendar';
        
        const monthNames = {
            1: 'Leden', 2: 'Únor', 3: 'Březen', 4: 'Duben', 5: 'Květen', 6: 'Červen',
            7: 'Červenec', 8: 'Srpen', 9: 'Září', 10: 'Říjen', 11: 'Listopad', 12: 'Prosinec'
        };
        const header = document.createElement('div');
        header.className = 'calendar-header';
        header.textContent = `${monthNames[month]} ${year}`;
        calendar.appendChild(header);
        
        const grid = document.createElement('div');
        grid.className = 'calendar-grid';
        
        // Day headers
        const dayHeaders = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
        dayHeaders.forEach(day => {
            const dayHeader = document.createElement('div');
            dayHeader.className = 'calendar-day-header';
            dayHeader.textContent = day;
            grid.appendChild(dayHeader);
        });
        
        // Get first day of month and number of days
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        const daysInMonth = lastDay.getDate();
        const startingDayOfWeek = (firstDay.getDay() + 6) % 7; // Convert to Monday = 0
        
        // Add empty cells for days before month starts
        for (let i = 0; i < startingDayOfWeek; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day empty';
            grid.appendChild(emptyCell);
        }
        
        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayCell = this.createDayCell(date, day);
            grid.appendChild(dayCell);
        }
        
        calendar.appendChild(grid);
        return calendar;
    }
    
    createDayCell(date, day) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        
        // Check if it's weekend
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            cell.classList.add('weekend');
        }
        
        // Check if it's today (normalize for comparison)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const cellDateNorm = new Date(date);
        cellDateNorm.setHours(0, 0, 0, 0);
        if (cellDateNorm.getTime() === today.getTime()) {
            cell.classList.add('today');
        }
        
        // Normalize dates for comparison (set to midnight)
        const cellDate = new Date(date);
        cellDate.setHours(0, 0, 0, 0);
        const opStart = new Date(this.operationStart);
        opStart.setHours(0, 0, 0, 0);
        const opEnd = new Date(this.operationEnd);
        opEnd.setHours(0, 0, 0, 0);
        
        // Check if it's outside operation period - use <= and >= for inclusive range
        if (cellDate < opStart || cellDate > opEnd) {
            cell.classList.add('non-operational');
            // Show day number but grayed out
            cell.style.opacity = '0.3';
            cell.style.cursor = 'not-allowed';
        } else {
            cell.classList.add('clickable');
            cell.style.cursor = 'pointer';
            cell.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Calendar day clicked:', date);
                this.openAssignmentDialog(new Date(date));
            });
        }
        
        const dayNumber = document.createElement('div');
        dayNumber.className = 'day-number';
        dayNumber.textContent = day;
        cell.appendChild(dayNumber);
        
        const shiftsContainer = document.createElement('div');
        shiftsContainer.className = 'day-shifts';
        
        // CRITICAL FIX: Use the same date formatting for schedule lookup
        const dateStr = this.formatDate(cellDate);
        const shifts = this.schedule.get(dateStr);
        
        console.log('Calendar cell - Date:', date, 'DateStr:', dateStr, 'Has shifts:', !!shifts);
        
        // Check if date is within operation period using normalized dates
        const isInOperationPeriod = cellDate >= opStart && cellDate <= opEnd;
        
        if (shifts && isInOperationPeriod) {
            // Validate day and add appropriate class
            const validation = this.validateDayAssignment(dateStr);
            if (validation.hasErrors) {
                cell.classList.add('has-errors');
            } else if (validation.hasWarnings) {
                cell.classList.add('has-warnings');
            } else if (this.isDayFullyAssigned(shifts)) {
                cell.classList.add('assigned');
            } else {
                cell.classList.add('unassigned');
            }
            
            // Morning shift
            if (shifts.morning.length > 0) {
                const morningDiv = document.createElement('div');
                morningDiv.className = 'shift-info morning';
                morningDiv.textContent = `R: ${shifts.morning.join(', ')}`;
                morningDiv.title = `Ranní: ${shifts.morning.join(', ')}`;
                shiftsContainer.appendChild(morningDiv);
            } else {
                const morningDiv = document.createElement('div');
                morningDiv.className = 'shift-info morning';
                morningDiv.textContent = 'R: -';
                morningDiv.title = 'Ranní: nezadáno';
                morningDiv.style.opacity = '0.5';
                shiftsContainer.appendChild(morningDiv);
            }
            
            // Afternoon shift
            if (shifts.afternoon.length > 0) {
                const afternoonDiv = document.createElement('div');
                afternoonDiv.className = 'shift-info afternoon';
                afternoonDiv.textContent = `O: ${shifts.afternoon.join(', ')}`;
                afternoonDiv.title = `Odpolední: ${shifts.afternoon.join(', ')}`;
                shiftsContainer.appendChild(afternoonDiv);
            } else {
                const afternoonDiv = document.createElement('div');
                afternoonDiv.className = 'shift-info afternoon';
                afternoonDiv.textContent = 'O: -';
                afternoonDiv.title = 'Odpolední: nezadáno';
                afternoonDiv.style.opacity = '0.5';
                shiftsContainer.appendChild(afternoonDiv);
            }
            
            // Night shift
            if (shifts.night.length > 0) {
                const nightDiv = document.createElement('div');
                nightDiv.className = 'shift-info night';
                nightDiv.textContent = `N: ${shifts.night.join(', ')}`;
                nightDiv.title = `Noční: ${shifts.night.join(', ')}`;
                shiftsContainer.appendChild(nightDiv);
            } else {
                const nightDiv = document.createElement('div');
                nightDiv.className = 'shift-info night';
                nightDiv.textContent = 'N: -';
                nightDiv.title = 'Noční: nezadáno';
                nightDiv.style.opacity = '0.5';
                shiftsContainer.appendChild(nightDiv);
            }
            
            // Standby duty (show if assigned)
            if (shifts.standby) {
                const standbyDiv = document.createElement('div');
                standbyDiv.className = 'shift-info night';
                standbyDiv.textContent = `P: ${shifts.standby}`;
                standbyDiv.title = `Pohotovost: ${shifts.standby}`;
                standbyDiv.style.opacity = '0.8';
                standbyDiv.style.fontSize = '10px';
                shiftsContainer.appendChild(standbyDiv);
            }
            
            // External technician
            if (shifts.external) {
                const externalDiv = document.createElement('div');
                externalDiv.className = 'shift-info external';
                externalDiv.textContent = `E: ${shifts.external}`;
                externalDiv.title = `Externí: ${shifts.external}`;
                shiftsContainer.appendChild(externalDiv);
            }
        }
        
        cell.appendChild(shiftsContainer);
        return cell;
    }
    
    getInitials(name) {
        return name.split(' ').map(part => part.charAt(0)).join('').toUpperCase();
    }
    
    saveShiftAssignment() {
        console.log('Saving shift assignment for:', this.currentAssignmentDate);
        
        if (!this.currentAssignmentDate) {
            console.error('No current assignment date set');
            return;
        }
        
        // Normalize the date before formatting
        const normalizedDate = new Date(this.currentAssignmentDate);
        normalizedDate.setHours(0, 0, 0, 0);
        const dateStr = this.formatDate(normalizedDate);
        
        console.log('Normalized date for save:', normalizedDate, 'DateStr:', dateStr);
        
        const getElementValue = (id) => {
            const element = document.getElementById(id);
            return element ? element.value : '';
        };
        
        const assignment = {
            morning: [
                getElementValue('morningTech1'),
                getElementValue('morningTech2')
            ].filter(v => v),
            afternoon: [
                getElementValue('afternoonTech1'),
                getElementValue('afternoonTech2')
            ].filter(v => v),
            night: [
                getElementValue('nightTech1'),
                getElementValue('nightTech2')
            ].filter(v => v),
            standby: getElementValue('standbyTech') || '',
            external: getElementValue('externalTech') || ''
        };
        
        console.log('Assignment data:', assignment);
        console.log('Saving to schedule with key:', dateStr);
        
        this.schedule.set(dateStr, assignment);
        
        // Verify it was saved
        console.log('Verification - schedule has key:', this.schedule.has(dateStr));
        console.log('Verification - schedule data:', this.schedule.get(dateStr));
        
        // Mark data as changed
        this.markDataChanged();
        
        // Close modal and update display
        const modal = document.getElementById('assignmentModal');
        if (modal) {
            modal.classList.remove('show');
        }
        
        // Force refresh of all views
        this.updateDisplay();
        this.updateMonthlyView();
        this.updateValidationSummary();
        
        // Auto-save to localStorage
        this.saveToStorage();
        
        console.log('Shift assignment saved successfully');
        console.log('Total schedule entries:', this.schedule.size);
    }
    
    clearDayAssignments() {
        if (confirm('Opravdu chcete vymazat všechna přiřazení pro tento den?')) {
            const dateStr = this.formatDate(this.currentAssignmentDate);
            this.schedule.set(dateStr, {
                morning: [],
                afternoon: [],
                night: [],
                standby: '',
                external: ''
            });
            
            // Clear form
            document.getElementById('morningTech1').value = '';
            document.getElementById('morningTech2').value = '';
            document.getElementById('afternoonTech1').value = '';
            document.getElementById('afternoonTech2').value = '';
            document.getElementById('nightTech1').value = '';
            document.getElementById('nightTech2').value = '';
            document.getElementById('standbyTech').value = '';
            document.getElementById('externalTech').value = '';
            
            this.validateCurrentAssignment();
        }
    }
    
    validateCurrentAssignment() {
        const warningsContainer = document.getElementById('assignmentWarnings');
        if (!warningsContainer) {
            console.warn('Assignment warnings container not found');
            return;
        }
        
        const warnings = [];
        
        const getElementValue = (id) => {
            const element = document.getElementById(id);
            return element ? element.value : '';
        };
        
        const morningTech1 = getElementValue('morningTech1');
        const morningTech2 = getElementValue('morningTech2');
        const afternoonTech1 = getElementValue('afternoonTech1');
        const afternoonTech2 = getElementValue('afternoonTech2');
        const nightTech1 = getElementValue('nightTech1');
        const nightTech2 = getElementValue('nightTech2');
        const standbyTech = getElementValue('standbyTech');
        
        const assignedTechs = [morningTech1, morningTech2, afternoonTech1, afternoonTech2, nightTech1, nightTech2, standbyTech].filter(t => t);
        
        // Check for double assignments
        const techCounts = {};
        assignedTechs.forEach(tech => {
            techCounts[tech] = (techCounts[tech] || 0) + 1;
        });
        
        Object.entries(techCounts).forEach(([tech, count]) => {
            if (count > 1) {
                warnings.push(`⚠️ ${tech} má přiřazeno více směn tentýž den`);
            }
        });
        
        // Check consecutive night shifts
        [nightTech1, nightTech2].filter(t => t).forEach(nightTech => {
            if (nightTech && this.currentAssignmentDate) {
                const consecutiveNights = this.getConsecutiveNightShifts(nightTech, this.currentAssignmentDate);
                if (consecutiveNights >= this.validationRules.maxConsecutiveNights) {
                    warnings.push(`⚠️ ${nightTech} má ${consecutiveNights + 1} nočních směn v řadě`);
                }
            }
        });
        
        // Check consecutive standby duties
        if (standbyTech && this.currentAssignmentDate) {
            const consecutiveStandbys = this.getConsecutiveStandbyDuties(standbyTech, this.currentAssignmentDate);
            if (consecutiveStandbys >= this.validationRules.maxConsecutiveNights) {
                warnings.push(`⚠️ ${standbyTech} má ${consecutiveStandbys + 1} pohotovostí v řadě`);
            }
        }
        
        // Display warnings
        if (warnings.length > 0) {
            warningsContainer.innerHTML = warnings.map(w => 
                `<div class="warning-item"><span class="warning-icon">⚠️</span>${w}</div>`
            ).join('');
            warningsContainer.classList.add('show');
        } else {
            warningsContainer.classList.remove('show');
        }
    }
    
    clearMonthAssignments() {
        const startDate = new Date(this.currentYearView, this.currentMonthView - 1, 1);
        const endDate = new Date(this.currentYearView, this.currentMonthView, 0);
        
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            if (currentDate >= this.operationStart && currentDate <= this.operationEnd) {
                const dateStr = this.formatDate(currentDate);
                this.schedule.set(dateStr, {
                    morning: [],
                    afternoon: [],
                    night: [],
                    standby: '',
                    external: ''
                });
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        this.updateMonthlyView();
        this.updateDisplay();
        this.updateValidationSummary();
        this.saveToStorage();
    }
    
    initializeStatistics() {
        this.updateStatistics();
    }
    
    updateStatistics() {
        const monthFilter = document.getElementById('monthFilter').value;
        const shiftFilter = document.getElementById('shiftFilter').value;
        
        const stats = this.calculateStatistics(monthFilter, shiftFilter);
        this.renderStatistics(stats);
        this.renderChart(stats);
    }
    
    calculateStatistics(monthFilter, shiftFilter) {
        const coreTechnicians = this.technicians.filter(t => !t.external);
        const stats = coreTechnicians.map(tech => ({
            name: tech.name,
            morningShifts: 0,
            afternoonShifts: 0,
            nightShifts: 0,
            standbyDuties: 0,
            totalDays: 0,
            daysOff: 0
        }));
        
        let totalOperationDays = 0;
        
        for (const [dateStr, shifts] of this.schedule) {
            const date = new Date(dateStr + 'T00:00:00');
            const month = date.getMonth() + 1;
            
            // Apply month filter
            if (monthFilter !== 'all' && month !== parseInt(monthFilter)) {
                continue;
            }
            
            totalOperationDays++;
            
            stats.forEach(stat => {
                const techName = stat.name;
                let hasWork = false;
                
                if ((shiftFilter === 'all' || shiftFilter === 'morning') && shifts.morning.includes(techName)) {
                    stat.morningShifts++;
                    hasWork = true;
                }
                
                if ((shiftFilter === 'all' || shiftFilter === 'afternoon') && shifts.afternoon.includes(techName)) {
                    stat.afternoonShifts++;
                    hasWork = true;
                }
                
                if ((shiftFilter === 'all' || shiftFilter === 'night') && shifts.night.includes(techName)) {
                    stat.nightShifts++;
                    hasWork = true;
                }
                
                if (shifts.standby === techName) {
                    stat.standbyDuties++;
                    // Standby counts as work only if it's not already counted as night shift
                    if (!hasWork) hasWork = true;
                }
                
                if (hasWork) {
                    stat.totalDays++;
                } else {
                    stat.daysOff++;
                }
            });
        }
        
        // Calculate utilization
        stats.forEach(stat => {
            stat.utilization = totalOperationDays > 0 ? (stat.totalDays / totalOperationDays * 100) : 0;
            stat.totalShifts = stat.morningShifts + stat.afternoonShifts + stat.nightShifts;
        });
        
        return {
            individual: stats,
            summary: this.calculateSummaryStats(stats, totalOperationDays)
        };
    }
    
    calculateSummaryStats(stats, totalDays) {
        const mostWorked = stats.reduce((prev, curr) => prev.totalDays > curr.totalDays ? prev : curr);
        const mostBalanced = stats.reduce((prev, curr) => {
            const prevBalance = Math.abs(prev.morningShifts - prev.afternoonShifts) + Math.abs(prev.afternoonShifts - prev.nightShifts);
            const currBalance = Math.abs(curr.morningShifts - curr.afternoonShifts) + Math.abs(curr.afternoonShifts - curr.nightShifts);
            return prevBalance < currBalance ? prev : curr;
        });
        
        const avgUtilization = stats.reduce((sum, stat) => sum + stat.utilization, 0) / stats.length;
        const totalShifts = stats.reduce((sum, stat) => sum + stat.totalShifts, 0);
        
        return {
            mostWorked: mostWorked.name,
            mostWorkedDays: mostWorked.totalDays,
            mostBalanced: mostBalanced.name,
            avgUtilization: avgUtilization.toFixed(1),
            totalShifts,
            totalDays
        };
    }
    
    renderStatistics(stats) {
        this.renderSummaryCards(stats.summary);
        this.renderStatisticsTable(stats.individual);
    }
    
    renderSummaryCards(summary) {
        const container = document.getElementById('summaryCards');
        container.innerHTML = '';
        
        const cards = [
            {
                title: 'Nejvíce pracujících',
                value: summary.mostWorked,
                subtitle: `${summary.mostWorkedDays} dní`,
                highlight: true
            },
            {
                title: 'Nejflexibilnější',
                value: summary.mostBalanced,
                subtitle: 'rovnoměrné rozdělení'
            },
            {
                title: 'Průměrná obsazenost',
                value: `${summary.avgUtilization}%`,
                subtitle: 'všech techniků'
            },
            {
                title: 'Celkem přiřazení',
                value: summary.totalShifts,
                subtitle: 'flexibilní obsazení'
            }
        ];
        
        cards.forEach(cardData => {
            const card = document.createElement('div');
            card.className = `summary-card ${cardData.highlight ? 'highlight' : ''}`;
            
            const title = document.createElement('div');
            title.className = 'card-title';
            title.textContent = cardData.title;
            
            const value = document.createElement('div');
            value.className = 'card-value';
            value.textContent = cardData.value;
            
            const subtitle = document.createElement('div');
            subtitle.className = 'card-subtitle';
            subtitle.textContent = cardData.subtitle;
            
            card.appendChild(title);
            card.appendChild(value);
            card.appendChild(subtitle);
            
            container.appendChild(card);
        });
    }
    
    renderStatisticsTable(stats) {
        const tbody = document.getElementById('statisticsBody');
        tbody.innerHTML = '';
        
        stats.forEach(stat => {
            const row = document.createElement('tr');
            
            const cells = [
                stat.name,
                stat.morningShifts,
                stat.afternoonShifts,
                stat.nightShifts,
                stat.standbyDuties,
                stat.totalDays,
                stat.daysOff
            ];
            
            cells.forEach(cellData => {
                const cell = document.createElement('td');
                cell.textContent = cellData;
                row.appendChild(cell);
            });
            
            // Utilization cell with bar
            const utilizationCell = document.createElement('td');
            const utilizationBar = document.createElement('div');
            utilizationBar.className = 'utilization-bar';
            
            const utilizationFill = document.createElement('div');
            utilizationFill.className = 'utilization-fill';
            utilizationFill.style.width = `${stat.utilization}%`;
            
            const utilizationText = document.createElement('span');
            utilizationText.className = 'utilization-text';
            utilizationText.textContent = `${stat.utilization.toFixed(1)}%`;
            
            utilizationBar.appendChild(utilizationFill);
            utilizationBar.appendChild(utilizationText);
            utilizationCell.appendChild(utilizationBar);
            row.appendChild(utilizationCell);
            
            tbody.appendChild(row);
        });
    }
    
    renderChart(stats) {
        const canvas = document.getElementById('shiftsChart');
        
        // Check if Chart.js is available
        if (typeof Chart === 'undefined') {
            canvas.style.display = 'none';
            const fallback = document.createElement('div');
            fallback.innerHTML = '<p style="text-align: center; padding: 40px; color: var(--color-text-secondary);">Graf není dostupný</p>';
            canvas.parentNode.appendChild(fallback);
            return;
        }
        
        const ctx = canvas.getContext('2d');
        
        // Destroy existing chart if it exists
        if (window.shiftsChartInstance) {
            window.shiftsChartInstance.destroy();
        }
        
        const data = {
            labels: stats.individual.map(s => s.name),
            datasets: [
                {
                    label: 'Ranní směny',
                    data: stats.individual.map(s => s.morningShifts),
                    backgroundColor: '#1FB8CD',
                    borderWidth: 1
                },
                {
                    label: 'Odpolední směny',
                    data: stats.individual.map(s => s.afternoonShifts),
                    backgroundColor: '#FFC185',
                    borderWidth: 1
                },
                {
                    label: 'Noční směny',
                    data: stats.individual.map(s => s.nightShifts),
                    backgroundColor: '#B4413C',
                    borderWidth: 1
                }
            ]
        };
        
        const config = {
            type: 'bar',
            data: data,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Flexibilní obsazení podle techniků (operativní řízení)'
                    },
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        },
                        title: {
                            display: true,
                            text: 'Počet přiřazení'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Technici'
                        }
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index'
                }
            }
        };
        
        window.shiftsChartInstance = new Chart(ctx, config);
    }
    
    printMonthlyView() {
        const printContent = document.getElementById('monthly-view').innerHTML;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Měsíční pohled - ${new Date().toLocaleDateString('cs-CZ')}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .calendars-container { display: grid; grid-template-columns: 1fr; gap: 20px; }
                        .calendar { border: 1px solid #ccc; padding: 15px; page-break-inside: avoid; }
                        .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; }
                        .calendar-day { min-height: 80px; border: 1px solid #ddd; padding: 4px; font-size: 10px; }
                        .day-number { font-weight: bold; margin-bottom: 4px; }
                        .legend-items { display: flex; gap: 15px; flex-wrap: wrap; }
                        .legend-item { display: flex; align-items: center; gap: 5px; }
                        .legend-color { width: 12px; height: 12px; border: 1px solid #000; }
                        .monthly-controls { display: none; }
                    </style>
                </head>
                <body>${printContent}</body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    }
    
    exportMonthlyView() {
        const data = this.getMonthlyViewData();
        const csvContent = this.convertToCSV(data);
        this.downloadCSV(csvContent, `mesicni_pohled_${new Date().toISOString().split('T')[0]}.csv`);
    }
    
    printStatistics() {
        const printContent = document.getElementById('statistics').innerHTML;
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Statistiky - ${new Date().toLocaleDateString('cs-CZ')}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                        th { background-color: #f5f5f5; font-weight: bold; }
                        .statistics-controls, .stats-charts { display: none; }
                        .summary-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
                        .summary-card { border: 1px solid #ddd; padding: 10px; text-align: center; }
                    </style>
                </head>
                <body>${printContent}</body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    }
    
    exportStatistics() {
        const monthFilter = document.getElementById('monthFilter').value;
        const stats = this.calculateStatistics(monthFilter, 'all');
        const csvData = [
            ['Technik', 'Ranní směny', 'Odpolední směny', 'Noční směny', 'Pohotovosti', 'Celkem dní', 'Volné dny', 'Vytížení (%)']
        ];
        
        stats.individual.forEach(stat => {
            csvData.push([
                stat.name,
                stat.morningShifts,
                stat.afternoonShifts,
                stat.nightShifts,
                stat.standbyDuties,
                stat.totalDays,
                stat.daysOff,
                stat.utilization.toFixed(1)
            ]);
        });
        
        const csvContent = csvData.map(row => row.join(',')).join('\n');
        this.downloadCSV(csvContent, `statistiky_${new Date().toISOString().split('T')[0]}.csv`);
    }
    
    initializeDataManagement() {
        this.loadNetworkSettings();
        this.updateSyncStatus();
        this.updateBackupList();
        
        // Load auto-sync setting and start if enabled
        if (this.networkSettings.autoSync) {
            this.startAutoSync();
        }
    }
    
    bindDataManagementEvents() {
        // Sync controls
        document.getElementById('syncNowBtn').addEventListener('click', () => {
            this.syncNow();
        });
        
        document.getElementById('testConnectionBtn').addEventListener('click', () => {
            this.testNetworkConnection();
        });
        
        document.getElementById('autoSyncToggle').addEventListener('change', (e) => {
            this.toggleAutoSync(e.target.checked);
        });
        
        // File operations
        document.getElementById('exportDataBtn').addEventListener('click', () => {
            this.exportData();
        });
        
        document.getElementById('importDataBtn').addEventListener('click', () => {
            document.getElementById('importFileInput').click();
        });
        
        document.getElementById('importFileInput').addEventListener('change', (e) => {
            this.importData(e.target.files[0]);
        });
        
        document.getElementById('saveToNetworkBtn').addEventListener('click', () => {
            this.saveToNetwork();
        });
        
        document.getElementById('loadFromNetworkBtn').addEventListener('click', () => {
            this.loadFromNetwork();
        });
        
        // Network settings
        document.getElementById('saveNetworkSettingsBtn').addEventListener('click', () => {
            this.saveNetworkSettings();
        });
        
        // Backup management
        document.getElementById('createBackupBtn').addEventListener('click', () => {
            this.createBackup();
        });
        
        document.getElementById('downloadBackupBtn').addEventListener('click', () => {
            this.downloadBackup();
        });
        
        // Conflict resolution
        document.getElementById('closeConflict').addEventListener('click', () => {
            document.getElementById('conflictModal').classList.remove('show');
        });
        
        document.getElementById('keepLocalBtn').addEventListener('click', () => {
            this.resolveConflict('local');
        });
        
        document.getElementById('keepRemoteBtn').addEventListener('click', () => {
            this.resolveConflict('remote');
        });
        
        document.getElementById('mergeDataBtn').addEventListener('click', () => {
            this.resolveConflict('merge');
        });
    }
    
    // Data Export/Import Functions
    exportData() {
        const exportData = this.createDataExport();
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `shift-schedule-${new Date().toISOString().split('T')[0]}.json`;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showStatusMessage('Data exportována úspěšně', 'success');
    }
    
    async importData(file) {
        if (!file) return;
        
        try {
            const text = await file.text();
            const importData = JSON.parse(text);
            
            if (this.validateImportData(importData)) {
                // Create backup before import
                this.createBackup();
                
                // Import data
                this.applyImportData(importData);
                
                // Update displays
                this.updateAllDisplays();
                
                this.showStatusMessage('Data importována úspěšně', 'success');
            } else {
                this.showStatusMessage('Neplatný formát souboru', 'error');
            }
        } catch (error) {
            console.error('Import error:', error);
            this.showStatusMessage('Chyba při importu dat', 'error');
        }
        
        // Clear file input
        document.getElementById('importFileInput').value = '';
    }
    
    createDataExport() {
        const scheduleData = Object.fromEntries(this.schedule);
        
        return {
            version: '1.0',
            lastModified: this.lastModified,
            modifiedBy: this.currentUser,
            checksum: this.generateChecksum(scheduleData),
            dataVersion: this.dataVersion,
            data: {
                technicians: this.technicians,
                schedule: scheduleData,
                operationPeriod: {
                    start: this.operationStart.toISOString(),
                    end: this.operationEnd.toISOString()
                },
                validationRules: this.validationRules
            }
        };
    }
    
    validateImportData(data) {
        return data &&
               data.version &&
               data.data &&
               data.data.technicians &&
               data.data.schedule &&
               Array.isArray(data.data.technicians) &&
               typeof data.data.schedule === 'object';
    }
    
    applyImportData(importData) {
        this.technicians = importData.data.technicians;
        this.schedule = new Map(Object.entries(importData.data.schedule));
        
        if (importData.data.operationPeriod) {
            this.operationStart = new Date(importData.data.operationPeriod.start);
            this.operationEnd = new Date(importData.data.operationPeriod.end);
        }
        
        if (importData.data.validationRules) {
            this.validationRules = { ...this.validationRules, ...importData.data.validationRules };
        }
        
        this.dataVersion = (importData.dataVersion || 0) + 1;
        this.lastModified = new Date().toISOString();
        this.saveToStorage();
    }
    
    // Network Operations
    async saveToNetwork() {
        if (!this.networkSettings.sharedFolderPath) {
            this.showStatusMessage('Není nastavena cesta k síťové složce', 'error');
            return;
        }
        
        this.updateSyncStatus('syncing');
        
        try {
            const result = await this.dataManager.saveToNetworkFile();
            
            if (result.success) {
                this.lastSyncTime = new Date();
                this.hasUnsavedChangesFlag = false;
                this.updateSyncStatus('synced');
                this.showStatusMessage(result.message, 'success');
            } else {
                this.updateSyncStatus('error');
                this.showStatusMessage(result.message, 'error');
            }
            
        } catch (error) {
            console.error('Network save error:', error);
            this.updateSyncStatus('error');
            this.showStatusMessage('Chyba při ukládání do sítě', 'error');
        }
    }
    
    async loadFromNetwork() {
        if (!this.networkSettings.sharedFolderPath) {
            this.showStatusMessage('Není nastavena cesta k síťové složce', 'error');
            return;
        }
        
        this.updateSyncStatus('syncing');
        
        try {
            const result = await this.dataManager.loadFromNetworkFile();
            
            if (result.success && result.data) {
                // Check for conflicts before applying data
                const currentData = this.createDataExport();
                const hasConflict = this.detectDataConflict(currentData, result.data);
                
                if (hasConflict) {
                    this.showConflictResolution(currentData, result.data);
                    this.updateSyncStatus('offline');
                } else {
                    // No conflict, apply data directly
                    this.createBackup(); // Create backup before import
                    this.applyImportData(result.data);
                    this.updateAllDisplays();
                    this.lastSyncTime = new Date();
                    this.hasUnsavedChangesFlag = false;
                    this.updateSyncStatus('synced');
                    this.showStatusMessage('Data načtena ze sítě úspěšně', 'success');
                }
            } else {
                this.updateSyncStatus('error');
                this.showStatusMessage(result.message || 'Chyba při načítání ze sítě', 'error');
            }
            
        } catch (error) {
            console.error('Network load error:', error);
            this.updateSyncStatus('error');
            this.showStatusMessage('Chyba při načítání ze sítě', 'error');
        }
    }
    
    async syncNow() {
        if (!this.networkSettings.sharedFolderPath) {
            this.showStatusMessage('Není nastavena cesta k síťové složce', 'error');
            return;
        }
        
        this.updateSyncStatus('syncing');
        
        try {
            // In real implementation, this would:
            // 1. Check if remote file exists
            // 2. Compare versions/timestamps
            // 3. Handle conflicts
            // 4. Sync data
            
            // For demo purposes
            setTimeout(() => {
                this.lastSyncTime = new Date();
                this.updateSyncStatus('synced');
                this.showStatusMessage('Synchronizace dokončena', 'success');
            }, 2000);
            
        } catch (error) {
            console.error('Sync error:', error);
            this.updateSyncStatus('error');
            this.showStatusMessage('Chyba synchronizace', 'error');
        }
    }
    
    async testNetworkConnection() {
        const path = document.getElementById('sharedFolderPath').value.trim();
        
        if (!path) {
            this.showSetupStatus('Zadejte cestu k síťové složce', 'error');
            return;
        }
        
        this.showSetupStatus('Testování připojení...', 'info');
        
        try {
            const result = await this.dataManager.testNetworkAccess(path);
            this.showSetupStatus(result.message, result.success ? 'success' : 'error');
        } catch (error) {
            console.error('Network test error:', error);
            this.showSetupStatus('Chyba při testování připojení', 'error');
        }
    }
    
    validateNetworkPath(path) {
        return this.dataManager.validateNetworkPath(path);
    }
    
    // Network Settings
    saveNetworkSettings() {
        const path = document.getElementById('sharedFolderPath').value.trim();
        
        if (!path) {
            this.showSetupStatus('Cesta k síťové složce je povinná', 'error');
            return;
        }
        
        this.networkSettings.sharedFolderPath = path;
        this.saveNetworkSettingsToStorage();
        
        this.showSetupStatus('Nastavení uloženo úspěšně', 'success');
        this.updateSyncStatus();
    }
    
    loadNetworkSettings() {
        try {
            const saved = window.networkSettings;
            if (saved) {
                this.networkSettings = { ...this.networkSettings, ...saved };
                document.getElementById('sharedFolderPath').value = this.networkSettings.sharedFolderPath || '';
                document.getElementById('autoSyncToggle').checked = this.networkSettings.autoSync || false;
            }
        } catch (error) {
            console.warn('Could not load network settings:', error);
        }
    }
    
    saveNetworkSettingsToStorage() {
        try {
            window.networkSettings = this.networkSettings;
        } catch (error) {
            console.warn('Could not save network settings:', error);
        }
    }
    
    // Auto-sync functionality
    toggleAutoSync(enabled) {
        this.networkSettings.autoSync = enabled;
        this.saveNetworkSettingsToStorage();
        
        if (enabled && this.networkSettings.sharedFolderPath) {
            this.autoSyncManager.start(this.networkSettings.syncInterval);
            this.showStatusMessage('Automatická synchronizace zapnuta', 'success');
        } else {
            this.autoSyncManager.stop();
            if (enabled) {
                this.showStatusMessage('Nastavte cestu k síťové složce pro automatickou synchronizaci', 'info');
            }
        }
    }
    
    hasUnsavedChanges() {
        return this.hasUnsavedChangesFlag;
    }
    
    markDataChanged() {
        this.hasUnsavedChangesFlag = true;
        this.lastModified = new Date().toISOString();
        this.dataVersion++;
        
        // Update sync status to show pending changes
        if (this.syncStatus === 'synced') {
            this.updateSyncStatus('pending');
        }
    }
    
    // Backup Management
    createBackup() {
        const backup = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            name: `Záloha ${new Date().toLocaleString('cs-CZ')}`,
            data: this.createDataExport()
        };
        
        this.backups.unshift(backup);
        
        // Keep only last 10 backups
        if (this.backups.length > 10) {
            this.backups = this.backups.slice(0, 10);
        }
        
        this.saveBackupsToStorage();
        this.updateBackupList();
        
        this.showStatusMessage('Záloha vytvořena úspěšně', 'success');
        return backup.id;
    }
    
    restoreBackup(backupId) {
        const backup = this.backups.find(b => b.id === backupId);
        
        if (!backup) {
            this.showStatusMessage('Záloha nenalezena', 'error');
            return;
        }
        
        if (confirm(`Opravdu chcete obnovit zálohu z ${new Date(backup.timestamp).toLocaleString('cs-CZ')}?`)) {
            // Create backup of current state before restore
            this.createBackup();
            
            // Restore data
            this.applyImportData(backup.data);
            this.updateAllDisplays();
            
            this.showStatusMessage('Záloha obnovena úspěšně', 'success');
        }
    }
    
    downloadBackup() {
        if (this.backups.length === 0) {
            this.showStatusMessage('Žádné zálohy nejsou k dispozici', 'error');
            return;
        }
        
        const latestBackup = this.backups[0];
        const jsonString = JSON.stringify(latestBackup.data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `backup-${latestBackup.id}.json`;
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showStatusMessage('Záloha stažena úspěšně', 'success');
    }
    
    updateBackupList() {
        const container = document.getElementById('backupItems');
        
        if (this.backups.length === 0) {
            container.innerHTML = '<div class="no-backups">Žádné zálohy nejsou k dispozici</div>';
            return;
        }
        
        container.innerHTML = this.backups.map(backup => {
            const timestamp = new Date(backup.timestamp).toLocaleString('cs-CZ');
            return `
                <div class="backup-item">
                    <div class="backup-info">
                        <div class="backup-name">${backup.name}</div>
                        <div class="backup-details">${timestamp}</div>
                    </div>
                    <div class="backup-actions-item">
                        <button class="btn btn--sm btn--outline" onclick="app.restoreBackup('${backup.id}')">Obnovit</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    saveBackupsToStorage() {
        try {
            window.shiftsBackups = this.backups;
        } catch (error) {
            console.warn('Could not save backups:', error);
        }
    }
    
    loadBackupsFromStorage() {
        try {
            const saved = window.shiftsBackups;
            if (saved && Array.isArray(saved)) {
                this.backups = saved;
            }
        } catch (error) {
            console.warn('Could not load backups:', error);
        }
    }
    
    // Conflict Resolution
    showConflictResolution(localData, remoteData) {
        document.getElementById('localVersionInfo').innerHTML = `
            <strong>Lokální verze:</strong><br>
            Upraveno: ${new Date(localData.lastModified).toLocaleString('cs-CZ')}<br>
            Verze: ${localData.dataVersion || 1}
        `;
        
        document.getElementById('remoteVersionInfo').innerHTML = `
            <strong>Síťová verze:</strong><br>
            Upraveno: ${new Date(remoteData.lastModified).toLocaleString('cs-CZ')}<br>
            Verze: ${remoteData.dataVersion || 1}
        `;
        
        this.conflictData = { local: localData, remote: remoteData };
        document.getElementById('conflictModal').classList.add('show');
    }
    
    resolveConflict(resolution) {
        if (!this.conflictData) return;
        
        switch (resolution) {
            case 'local':
                // Keep local data, upload to network
                this.saveToNetwork();
                break;
                
            case 'remote':
                // Use remote data
                this.createBackup(); // Backup local first
                this.applyImportData(this.conflictData.remote);
                this.updateAllDisplays();
                break;
                
            case 'merge':
                // Create backup and use remote
                this.createBackup();
                this.applyImportData(this.conflictData.remote);
                this.updateAllDisplays();
                this.showStatusMessage('Data sloučena s vytvořením zálohy', 'success');
                break;
        }
        
        this.conflictData = null;
        document.getElementById('conflictModal').classList.remove('show');
    }
    
    // Status and UI Updates
    updateSyncStatus(status = null) {
        if (status) {
            this.syncStatus = status;
        }
        
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const syncIndicator = document.getElementById('syncIndicator');
        const syncText = document.getElementById('syncText');
        const lastSyncEl = document.getElementById('lastSyncTime');
        
        // Update status dot and text
        statusDot.className = 'status-dot';
        switch (this.syncStatus) {
            case 'synced':
                statusDot.classList.add('online');
                statusText.textContent = 'Online - synchronizováno';
                syncIndicator.textContent = '🟢';
                syncText.textContent = 'Data jsou aktuální';
                break;
            case 'syncing':
                statusDot.classList.add('syncing');
                statusText.textContent = 'Synchronizace...';
                syncIndicator.textContent = '🟡';
                syncText.textContent = 'Synchronizace probíhá';
                break;
            case 'pending':
                statusDot.classList.add('syncing');
                statusText.textContent = 'Čekají změny k uložení';
                syncIndicator.textContent = '🟠';
                syncText.textContent = 'Čekají změny k uložení';
                break;
            case 'error':
                statusDot.classList.add('error');
                statusText.textContent = 'Chyba synchronizace';
                syncIndicator.textContent = '🔴';
                syncText.textContent = 'Chyba synchronizace';
                break;
            default:
                statusDot.classList.add('offline');
                statusText.textContent = 'Offline režim';
                syncIndicator.textContent = '🔵';
                syncText.textContent = 'Offline režim';
        }
        
        // Update last sync time
        if (this.lastSyncTime) {
            lastSyncEl.textContent = `Poslední synchronizace: ${this.lastSyncTime.toLocaleString('cs-CZ')}`;
        } else {
            lastSyncEl.textContent = 'Poslední synchronizace: Nikdy';
        }
    }
    
    showStatusMessage(message, type) {
        // Create status notification
        const notification = document.createElement('div');
        notification.className = `status-notification ${type}`;
        notification.textContent = message;
        
        // Style notification
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1001;
            padding: 12px 20px;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            font-weight: 500;
            max-width: 400px;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;
        
        // Set colors based on type
        switch (type) {
            case 'success':
                notification.style.backgroundColor = 'var(--color-success)';
                notification.style.color = 'white';
                break;
            case 'error':
                notification.style.backgroundColor = 'var(--color-error)';
                notification.style.color = 'white';
                break;
            case 'info':
                notification.style.backgroundColor = 'var(--color-info)';
                notification.style.color = 'white';
                break;
            default:
                notification.style.backgroundColor = 'var(--color-surface)';
                notification.style.color = 'var(--color-text)';
                notification.style.border = '1px solid var(--color-border)';
        }
        
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        });
        
        // Remove after delay
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }
    
    showSetupStatus(message, type) {
        const statusEl = document.getElementById('setupStatus');
        const messageEl = document.getElementById('setupMessage');
        
        statusEl.className = `setup-status ${type}`;
        messageEl.textContent = message;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
    
    updateAllDisplays() {
        this.renderTechnicians();
        this.updateDisplay();
        this.updateMonthlyView();
        this.updateStatistics();
        this.updateValidationSummary();
    }
    
    // Conflict Detection
    detectDataConflict(localData, remoteData) {
        // Check if there's a version conflict
        const localVersion = localData.dataVersion || 1;
        const remoteVersion = remoteData.dataVersion || 1;
        const localModified = new Date(localData.lastModified);
        const remoteModified = new Date(remoteData.lastModified);
        
        // Consider it a conflict if:
        // 1. Both have been modified and versions don't match
        // 2. Modified times are significantly different (more than 1 minute apart)
        const timeDiff = Math.abs(localModified - remoteModified);
        const hasTimeConflict = timeDiff > 60000; // 1 minute
        const hasVersionConflict = localVersion !== remoteVersion;
        
        return hasTimeConflict || hasVersionConflict;
    }
    
    // Enhanced sync with conflict detection
    async syncNow() {
        if (!this.networkSettings.sharedFolderPath) {
            this.showStatusMessage('Není nastavena cesta k síťové složce', 'error');
            return;
        }
        
        this.updateSyncStatus('syncing');
        
        try {
            // Check if we have local changes
            if (this.hasUnsavedChanges()) {
                // Try to load remote data first to check for conflicts
                const result = await this.dataManager.loadFromNetworkFile();
                
                if (result.success && result.data) {
                    const currentData = this.createDataExport();
                    const hasConflict = this.detectDataConflict(currentData, result.data);
                    
                    if (hasConflict) {
                        this.showConflictResolution(currentData, result.data);
                        this.updateSyncStatus('offline');
                        return;
                    }
                }
                
                // No conflict or no remote data, save local changes
                await this.saveToNetwork();
            } else {
                // No local changes, try to load remote updates
                await this.loadFromNetwork();
            }
            
        } catch (error) {
            console.error('Sync error:', error);
            this.updateSyncStatus('error');
            this.showStatusMessage('Chyba synchronizace', 'error');
        }
    }
    
    // Utility functions
    generateChecksum(data) {
        const str = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(16);
    }
    
    updateValidationSummary() {
        const validation = this.getFullValidation();
        const countEl = document.getElementById('validationCount');
        const totalIssues = validation.errors.length + validation.warnings.length;
        
        if (totalIssues === 0) {
            countEl.textContent = '0 problémů';
            countEl.className = 'validation-count';
        } else if (validation.errors.length > 0) {
            countEl.textContent = `${totalIssues} problémů`;
            countEl.className = 'validation-count has-errors';
        } else {
            countEl.textContent = `${totalIssues} upozornění`;
            countEl.className = 'validation-count has-warnings';
        }
    }
    
    showValidationReport() {
        const validation = this.getFullValidation();
        const reportContainer = document.getElementById('validationReportContent');
        
        let html = '<div class="validation-summary-stats">';
        html += `<div class="validation-stat"><div class="validation-stat-number">${validation.stats.totalDays}</div><div class="validation-stat-label">Celkem dní</div></div>`;
        html += `<div class="validation-stat"><div class="validation-stat-number">${validation.stats.assignedDays}</div><div class="validation-stat-label">S obsazením</div></div>`;
        html += `<div class="validation-stat"><div class="validation-stat-number">${validation.stats.unassignedDays}</div><div class="validation-stat-label">Bez obsazení</div></div>`;
        html += `<div class="validation-stat"><div class="validation-stat-number">${Math.round(validation.stats.completionPercentage)}%</div><div class="validation-stat-label">Obsazenost</div></div>`;
        html += '</div>';
        
        if (validation.errors.length > 0) {
            html += '<div class="validation-section"><h4>Chyby (nutno opravit)</h4>';
            html += '<ul class="validation-list">';
            validation.errors.forEach(error => {
                html += `<li class="error">${error}</li>`;
            });
            html += '</ul></div>';
        }
        
        if (validation.warnings.length > 0) {
            html += '<div class="validation-section"><h4>Upozornění</h4>';
            html += '<ul class="validation-list">';
            validation.warnings.forEach(warning => {
                html += `<li class="warning">${warning}</li>`;
            });
            html += '</ul></div>';
        }
        
        if (validation.unassignedDates.length > 0) {
            html += '<div class="validation-section"><h4>Dny bez obsazení</h4>';
            html += '<ul class="validation-list">';
            validation.unassignedDates.forEach(dateStr => {
                const date = new Date(dateStr + 'T00:00:00');
                const formatted = date.toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
                html += `<li class="warning">${formatted} - žádné obsazení ve směnách</li>`;
            });
            html += '</ul></div>';
        }
        
        // Add operational insights
        if (validation.stats.partialDays > 0) {
            html += '<div class="validation-section"><h4>Provozní přehled</h4>';
            html += '<ul class="validation-list">';
            html += `<li class="info">Dny s částečným obsazením: ${validation.stats.partialDays}</li>`;
            html += `<li class="info">Dny s plným obsazením: ${validation.stats.fullDays}</li>`;
            html += `<li class="info">Průměrný počet pracovníků/den: ${validation.stats.avgStaffPerDay.toFixed(1)}</li>`;
            html += '</ul></div>';
        }
        
        reportContainer.innerHTML = html;
        document.getElementById('validationModal').classList.add('show');
    }
    
    getFullValidation() {
        const errors = [];
        const warnings = [];
        const unassignedDates = [];
        let assignedDays = 0;
        let totalDays = 0;
        let partialDays = 0;
        let fullDays = 0;
        let totalStaff = 0;
        
        // Check each day in operation period
        let currentDate = new Date(this.operationStart);
        while (currentDate <= this.operationEnd) {
            const dateStr = this.formatDate(currentDate);
            const shifts = this.schedule.get(dateStr);
            const validation = this.validateDayAssignment(dateStr);
            
            totalDays++;
            
            if (shifts) {
                const hasAnyAssignment = shifts.morning.length > 0 || shifts.afternoon.length > 0 || shifts.night.length > 0 || shifts.standby || shifts.external;
                const staffCount = shifts.morning.length + shifts.afternoon.length + shifts.night.length + (shifts.standby ? 1 : 0) + (shifts.external ? 1 : 0);
                const staffedShifts = [shifts.morning.length > 0, shifts.afternoon.length > 0, shifts.night.length > 0].filter(Boolean).length;
                
                if (hasAnyAssignment) {
                    assignedDays++;
                    totalStaff += staffCount;
                    
                    if (staffedShifts >= 2) {
                        fullDays++;
                    } else {
                        partialDays++;
                    }
                } else {
                    unassignedDates.push(dateStr);
                }
            } else {
                unassignedDates.push(dateStr);
            }
            
            errors.push(...validation.errors);
            warnings.push(...validation.warnings);
            
            currentDate.setDate(currentDate.getDate() + 1);
        }
        
        return {
            errors,
            warnings,
            unassignedDates,
            stats: {
                totalDays,
                assignedDays,
                unassignedDays: totalDays - assignedDays,
                partialDays,
                fullDays,
                completionPercentage: (assignedDays / totalDays) * 100,
                avgStaffPerDay: assignedDays > 0 ? totalStaff / assignedDays : 0
            }
        };
    }
    
    validateDayAssignment(dateStr) {
        const shifts = this.schedule.get(dateStr);
        const errors = [];
        const warnings = [];
        
        if (!shifts) return { errors, warnings, hasErrors: false, hasWarnings: false };
        
        // Check for double assignments within shifts (not across shifts - that's allowed for flexibility)
        const checkDuplicatesInShift = (shiftArray, shiftName) => {
            const counts = {};
            shiftArray.forEach(tech => {
                if (tech) {
                    counts[tech] = (counts[tech] || 0) + 1;
                    if (counts[tech] > 1) {
                        errors.push(`${dateStr}: ${tech} má duplicitní přiřazení v ${shiftName}`);
                    }
                }
            });
        };
        
        checkDuplicatesInShift(shifts.morning, 'ranní směně');
        checkDuplicatesInShift(shifts.afternoon, 'odpolední směně');
        checkDuplicatesInShift(shifts.night, 'noční směně');
        
        // Warn about same person in multiple shifts (operational warning, not error)
        const allTechs = [...shifts.morning, ...shifts.afternoon, ...shifts.night].filter(t => t);
        const techCounts = {};
        allTechs.forEach(tech => {
            techCounts[tech] = (techCounts[tech] || 0) + 1;
        });
        
        Object.entries(techCounts).forEach(([tech, count]) => {
            if (count > 1) {
                warnings.push(`${dateStr}: ${tech} má více směn tentýž den (provozní upozornění)`);
            }
        });
        
        // Check consecutive night shifts for all night technicians
        shifts.night.forEach(nightTech => {
            if (nightTech) {
                const consecutiveNights = this.getConsecutiveNightShifts(nightTech, new Date(dateStr + 'T00:00:00'));
                if (consecutiveNights > this.validationRules.maxConsecutiveNights) {
                    warnings.push(`${dateStr}: ${nightTech} má příliš mnoho nočních směn v řadě (${consecutiveNights})`);
                }
            }
        });
        
        return {
            errors,
            warnings,
            hasErrors: errors.length > 0,
            hasWarnings: warnings.length > 0
        };
    }
    
    isDayFullyAssigned(shifts) {
        // In flexible mode, consider day assigned if at least one shift has someone
        return shifts.morning.length > 0 || 
               shifts.afternoon.length > 0 || 
               shifts.night.length > 0 || 
               shifts.standby !== '' || 
               shifts.external !== '';
    }
    
    getConsecutiveNightShifts(techName, currentDate) {
        let count = 0;
        let checkDate = new Date(currentDate);
        checkDate.setDate(checkDate.getDate() - 1);
        
        // Count backwards
        while (checkDate >= this.operationStart) {
            const dateStr = this.formatDate(checkDate);
            const shifts = this.schedule.get(dateStr);
            
            if (shifts && shifts.night.includes(techName)) {
                count++;
            } else {
                break;
            }
            
            checkDate.setDate(checkDate.getDate() - 1);
        }
        
        return count;
    }
    
    getConsecutiveStandbyDuties(techName, currentDate) {
        let count = 0;
        let checkDate = new Date(currentDate);
        checkDate.setDate(checkDate.getDate() - 1);
        
        // Count backwards
        while (checkDate >= this.operationStart) {
            const dateStr = this.formatDate(checkDate);
            const shifts = this.schedule.get(dateStr);
            
            if (shifts && shifts.standby === techName) {
                count++;
            } else {
                break;
            }
            
            checkDate.setDate(checkDate.getDate() - 1);
        }
        
        return count;
    }
    
    saveToStorage() {
        try {
            const scheduleData = Object.fromEntries(this.schedule);
            const data = {
                schedule: scheduleData,
                technicians: this.technicians,
                lastModified: new Date().toISOString(),
                dataVersion: this.dataVersion,
                currentUser: this.currentUser
            };
            // Note: localStorage is not available in sandbox, using in-memory storage
            window.shiftScheduleData = data;
            
            // Also save network settings and backups
            this.saveNetworkSettingsToStorage();
            this.saveBackupsToStorage();
            
            // Update last modified time
            this.lastModified = data.lastModified;
        } catch (error) {
            console.warn('Could not save to storage:', error);
        }
    }
    
    loadFromStorage() {
        try {
            const data = window.shiftScheduleData;
            if (data && data.schedule) {
                this.schedule = new Map(Object.entries(data.schedule));
                if (data.technicians) {
                    this.technicians = data.technicians;
                }
                if (data.lastModified) {
                    this.lastModified = data.lastModified;
                }
                if (data.dataVersion) {
                    this.dataVersion = data.dataVersion;
                }
                if (data.currentUser) {
                    this.currentUser = data.currentUser;
                }
                
                // Load network settings and backups
                this.loadNetworkSettings();
                this.loadBackupsFromStorage();
                
                return true;
            }
        } catch (error) {
            console.warn('Could not load from storage:', error);
        }
        return false;
    }
    
    getMonthlyViewData() {
        const data = [];
        for (const [dateStr, shifts] of this.schedule) {
            const date = new Date(dateStr + 'T00:00:00');
            if (date >= this.operationStart && date <= this.operationEnd) {
                const validation = this.validateDayAssignment(dateStr);
                let status = 'Nezadáno';
                const hasAnyAssignment = shifts.morning.length > 0 || shifts.afternoon.length > 0 || shifts.night.length > 0 || shifts.standby || shifts.external;
                
                if (hasAnyAssignment) {
                    if (validation.hasErrors) {
                        status = 'Chyba';
                    } else if (validation.hasWarnings) {
                        status = 'Upozornění';
                    } else {
                        // Check if it's well-staffed (has coverage in most shifts)
                        const staffedShifts = [shifts.morning.length > 0, shifts.afternoon.length > 0, shifts.night.length > 0].filter(Boolean).length;
                        status = staffedShifts >= 2 ? 'Dobré obsazení' : 'Částečné obsazení';
                    }
                }
                
                data.push({
                    datum: dateStr,
                    den: date.toLocaleDateString('cs-CZ', { weekday: 'long' }),
                    ranniSmena: shifts.morning.length > 0 ? `${shifts.morning.length} člověk: ${shifts.morning.join(', ')}` : 'Nezadáno',
                    odpoledniSmena: shifts.afternoon.length > 0 ? `${shifts.afternoon.length} člověk: ${shifts.afternoon.join(', ')}` : 'Nezadáno',
                    nocniSmena: shifts.night.length > 0 ? `${shifts.night.length} člověk: ${shifts.night.join(', ')}` : 'Nezadáno',
                    pohotovost: shifts.standby || '-',
                    externiTechnik: shifts.external || '-',
                    stav: status
                });
            }
        }
        return data.sort((a, b) => a.datum.localeCompare(b.datum));
    }
    
    convertToCSV(data) {
        if (data.length === 0) return '';
        
        // Add BOM for proper Czech character encoding
        const headers = Object.keys(data[0]).map(key => {
            const translations = {
                datum: 'Datum',
                den: 'Den',
                ranniSmena: 'Ranní směna',
                odpoledniSmena: 'Odpolední směna',
                nocniSmena: 'Noční směna',
                pohotovost: 'Pohotovost',
                externiTechnik: 'Externí technik',
                stav: 'Stav'
            };
            return translations[key] || key;
        }).join(';');
        
        const rows = data.map(item => 
            Object.values(item).map(value => 
                typeof value === 'string' && value.includes(',') ? `"${value}"` : value
            ).join(';')
        );
        
        return '\uFEFF' + [headers, ...rows].join('\n');
    }
    
    downloadCSV(content, filename) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}

// Data Manager Class for handling file operations and network sync
class DataManager {
    constructor(scheduler) {
        this.scheduler = scheduler;
        this.fileSystemSupported = 'showSaveFilePicker' in window;
    }
    
    async saveToNetworkFile() {
        if (!this.fileSystemSupported) {
            return this.fallbackDownload();
        }
        
        try {
            const fileHandle = await window.showSaveFilePicker({
                suggestedName: 'shift-schedule.json',
                types: [{
                    description: 'JSON files',
                    accept: { 'application/json': ['.json'] }
                }]
            });
            
            const writable = await fileHandle.createWritable();
            const exportData = this.scheduler.createDataExport();
            await writable.write(JSON.stringify(exportData, null, 2));
            await writable.close();
            
            return { success: true, message: 'Soubor úspěšně uložen' };
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, message: 'Uložení zrušeno' };
            }
            throw error;
        }
    }
    
    async loadFromNetworkFile() {
        if (!this.fileSystemSupported) {
            return this.fallbackFileInput();
        }
        
        try {
            const [fileHandle] = await window.showOpenFilePicker({
                types: [{
                    description: 'JSON files',
                    accept: { 'application/json': ['.json'] }
                }]
            });
            
            const file = await fileHandle.getFile();
            const contents = await file.text();
            const data = JSON.parse(contents);
            
            if (this.scheduler.validateImportData(data)) {
                return { success: true, data: data };
            } else {
                return { success: false, message: 'Neplatný formát souboru' };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { success: false, message: 'Načítání zrušeno' };
            }
            throw error;
        }
    }
    
    fallbackDownload() {
        // Fallback for browsers without File System Access API
        const exportData = this.scheduler.createDataExport();
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'shift-schedule.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        return { success: true, message: 'Soubor stažen do složky Downloads' };
    }
    
    fallbackFileInput() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const contents = await file.text();
                        const data = JSON.parse(contents);
                        
                        if (this.scheduler.validateImportData(data)) {
                            resolve({ success: true, data: data });
                        } else {
                            resolve({ success: false, message: 'Neplatný formát souboru' });
                        }
                    } catch (error) {
                        resolve({ success: false, message: 'Chyba při čtení souboru' });
                    }
                } else {
                    resolve({ success: false, message: 'Žádný soubor nevybrán' });
                }
            };
            
            input.click();
        });
    }
    
    validateNetworkPath(path) {
        // Enhanced validation for network paths
        const patterns = [
            /^\\\\[a-zA-Z0-9.-]+\\[a-zA-Z0-9_.-]+.*$/,  // UNC: server share
            /^[a-zA-Z]:\\.*$/,                              // Mapped drive
            /^\/[a-zA-Z0-9_.-]+.*$/                        // Unix-style path
        ];
        
        return patterns.some(pattern => pattern.test(path));
    }
    
    async testNetworkAccess(path) {
        // In a real implementation, this would:
        // 1. Try to create a test file
        // 2. Check read and write permissions
        // 3. Verify network connectivity
        
        // For demo purposes, simulate network test
        return new Promise((resolve) => {
            setTimeout(() => {
                const isValid = this.validateNetworkPath(path);
                resolve({
                    success: isValid,
                    message: isValid 
                        ? 'Cesta má správný formát. V produkční verzi by se testovala skutečná dostupnost.' 
                        : 'Neplatný formát síťové cesty.'
                });
            }, 1000);
        });
    }
}

// Enhanced automatic sync manager
class AutoSyncManager {
    constructor(scheduler) {
        this.scheduler = scheduler;
        this.syncInterval = null;
        this.lastSyncAttempt = null;
        this.syncInProgress = false;
        this.retryCount = 0;
        this.maxRetries = 3;
    }
    
    start(interval = 300000) { // 5 minutes default
        this.stop(); // Clear any existing interval
        
        this.syncInterval = setInterval(() => {
            this.performSync();
        }, interval);
        
        console.log('Auto-sync started with interval:', interval / 1000, 'seconds');
    }
    
    stop() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('Auto-sync stopped');
        }
    }
    
    async performSync() {
        if (this.syncInProgress) {
            return; // Skip if sync already in progress
        }
        
        this.syncInProgress = true;
        this.lastSyncAttempt = new Date();
        
        try {
            // Check if local data has changes since last sync
            const hasLocalChanges = this.scheduler.hasUnsavedChanges();
            
            if (hasLocalChanges) {
                await this.scheduler.saveToNetwork();
            }
            
            // Reset retry count on successful sync
            this.retryCount = 0;
            
        } catch (error) {
            console.error('Auto-sync failed:', error);
            this.retryCount++;
            
            if (this.retryCount >= this.maxRetries) {
                this.scheduler.showStatusMessage(
                    `Automatická synchronizace selhala ${this.maxRetries}x. Zkontrolujte síťové připojení.`, 
                    'error'
                );
                this.stop(); // Stop auto-sync after max retries
            }
        } finally {
            this.syncInProgress = false;
        }
    }
    
    getStatus() {
        return {
            running: this.syncInterval !== null,
            lastAttempt: this.lastSyncAttempt,
            inProgress: this.syncInProgress,
            retryCount: this.retryCount
        };
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Load Chart.js library
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    script.onload = () => {
        window.app = new ShiftScheduler();
    };
    script.onerror = () => {
        // Fallback if Chart.js fails to load
        console.warn('Chart.js failed to load, initializing without charts');
        window.app = new ShiftScheduler();
    };
    document.head.appendChild(script);
});