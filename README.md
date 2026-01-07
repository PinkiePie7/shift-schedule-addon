# Home Assistant Add-on: Systém plánování směn

Kompletní webová aplikace pro manuální plánování a správu pracovních směn v dílně, integrovaná přímo do Home Assistant.

## Možnosti

### Automatické zálohování
- **backup_enabled**: Zapnout/vypnout automatické zálohování (výchozí: zapnuto)
- **backup_interval**: Interval zálohování v sekundách (výchozí: 86400 = 24 hodin)

## Instalace

### Metoda 1: Přidání custom repozitáře

1. Jděte na Home Assistant → **Nastavení** → **Add-on a integrace**
2. Klikněte na **Obchod s add-ony** (vpravo dole)
3. Klikněte na tři tečky → **Vlastní repozitáře**
4. Přidejte: `https://github.com/vaseuživatel/shift-schedule-addon`
5. Zavřete dialog
6. Vyhledejte **"Plánování směn"** v obchodě
7. Klikněte **Instalovat**

### Metoda 2: Ruční instalace

1. SSH do Home Assistant:
   ```bash
   ssh root@homeassistant.local
   ```

2. Přejděte do složky add-onů:
   ```bash
   cd /addons
   ```

3. Naklonujte repozitář:
   ```bash
   git clone https://github.com/vaseuživatel/shift-schedule-addon shift-schedule
   ```

4. Restartujte Home Assistant

## Spuštění

Po instalaci a spuštění add-onu:

1. Otevřete v prohlížeči: **http://homeassistant.local:8080**
2. Aplikace se automaticky připojí k Home Assistant
3. Všechna data se ukládají v: `/config/shift_schedule/schedule_data.json`
4. Backupy se vytváří automaticky v: `/config/shift_schedule/backups/`

## Funkce

### Plánování směn
- Manuální přiřazování techniků na ranní, odpolední a noční směny
- Flexibilní obsazení (1-2 techniky na směnu)
- Nezávislé nastavení noční pohotovosti
- Přiřazení externích techniků

### Zobrazení
- **Aktuální týden**: Týdenní přehled s následujícími 7 dny
- **Měsíční pohled**: Kalendářní zobrazení listopadu, prosince a ledna
- **Statistiky**: Detailní analýza vytížení techniků
- **Nastavení**: Správa techniků a konfigurace

### Správa dat
- **Automatické ukládání** do Home Assistant
- **Automatické zálohování** (posledních 10 verzí)
- **Zavedené techniky**: Honza, Martin, Vale, Filip, David, Tesárek (externí)
- **Pracovní období**: 24.11.2025 - 31.01.2026

## Struktura dat

Všechna data se ukládají v Home Assistant v JSON souboru:

```json
{
  "version": "2.0",
  "lastModified": "2026-01-07T10:00:00Z",
  "period": {
    "start": "2025-11-24",
    "end": "2026-01-31"
  },
  "technicians": [
    {
      "id": "honza",
      "name": "Honza",
      "external": false,
      "phone": ""
    }
  ],
  "schedule": {
    "2025-11-24": {
      "morning": ["Honza", "Martin"],
      "afternoon": ["Vale"],
      "night": ["Filip"],
      "standby": "David",
      "external": "Tesárek"
    }
  }
}
```

## Konfigurace Home Assistant

Pokud chcete přistupovat k datům z Home Assistant automací:

```yaml
# configuration.yaml
template:
  - sensor:
      - name: "Shift Schedule Status"
        unique_id: shift_schedule_status
        state: "{{ state_attr('sensor.shift_schedule', 'status') }}"
```

## Řešení problémů

### Aplikace se nenačítá
- Zkontrolujte, zda je add-on spuštěný
- Zkontrolujte porty v nastavení add-onu
- Podívejte se do logů add-onu: **Nastavení → Add-on a integrace → Plánování směn → Logs**

### Data se neukládají
- Zkontrolujte oprávnění složky `/config/shift_schedule`
- Ověřte, zda má add-on přístup k `/config`
- Restart add-onu

### Prázdné zálohy
- Zálohy se vytváří automaticky při ukládání dat
- Zkontrolujte složku `/config/shift_schedule/backups/`

## Vývojářské informace

### Struktura add-onu
```
shift-schedule/
├── addon_manifest.json    # Metadata add-onu
├── Dockerfile             # Docker image
├── run.py                 # Python server
└── web/
    ├── index.html         # Hlavní aplikace
    ├── app.js             # JavaScript logika
    └── style.css          # Styly
```

### API Endpoints

#### GET /api/data
Načte aktuální data ze Home Assistant

```bash
curl http://homeassistant.local:8080/api/data
```

#### POST /api/data
Uloží data do Home Assistant

```bash
curl -X POST -H "Content-Type: application/json" \
  -d @schedule_data.json \
  http://homeassistant.local:8080/api/data
```

## Podpora

- Dokumentace: Viz README v repozitáři
- Problémy: Nahlašte na GitHubu
- Logy: Viz kapitola "Řešení problémů"

## Autor

Vytvořeno pro Home Assistant

## Licence

MIT License - Volný software
