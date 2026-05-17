/**
 * BLUEPRINT: Use this template to create a new hardware adapter.
 * For example: 'TeslaAdapter', 'VictronAdapter', 'SunsynkAdapter'
 */
export class TemplateAdapter {
    constructor() {
        this.latest = {
            houseLoad: 0,            // Watts
            p_battery: 0,            // Watts (+ for charging, - for discharge)
            soc: 0,                 // %
            batteryCapacityKwh: 0,   // kWh
            energyRemainingKwh: 0,   // kWh
            solarTodayKwh: 0,        // kWh
            storageTodayKwh: 0,      // kWh
            exportTodayKwh: 0,       // kWh
            exportPower: 0,          // Watts
            solarPower: 0,           // Watts
            batteryToGrid: 0,        // Watts
            batteryToHouse: 0,       // Watts
            gridToBattery: 0,        // Watts
            gridToHouse: 0,          // Watts
            solarToBattery: 0,       // Watts
            solarToGrid: 0,          // Watts
            solarToHouse: 0,         // Watts
            dischargeRate: 0,        // Watts
            reserve: 0               // Watts
        };
    }

    /**
     * connect() is called once when the client starts.
     * Use this to initialize your API, Modbus, or MQTT client.
     */
    async connect() {
        console.log('[Template] Initializing connection to your hardware API...');
        return true;
    }

    /**
     * readMetrics() is called by the heartbeat loop.
     * Return an object containing all standard energy fields.
     */
    async readMetrics() {
        // logic to fetch data from your API/Source goes here

        return {
            ...this.latest,
            // Add any custom flow logic (e.g., solarToGrid) here
        };
    }
}