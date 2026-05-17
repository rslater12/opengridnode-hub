import mqtt from 'mqtt';

export class MqttAdapter {
    constructor({ brokerUrl }) {
        this.brokerUrl = brokerUrl;
        this.client = null;
        this.latest = {
            houseLoad: 0,
            p_battery: 0,
            soc: 0,
            batteryCapacityKwh: null,
            energyRemainingKwh: null,
            solarTodayKwh: 0,
            storageTodayKwh: 0,
            dischargeRate: 0,
            reserve: 0,
            exportPower: 0,
            exportTodayKwh: 0,
            solarPower: 0,
            batteryToGrid: 0,
            batteryToHouse: 0,
            gridToBattery: 0,
            gridToHouse: 0,
            solarToBattery: 0,
            solarToGrid: 0,
            solarToHouse: 0
        };
    }

    connect() {
        return new Promise((resolve) => {
            this.client = mqtt.connect(this.brokerUrl, {
                connectTimeout: 5000,
                reconnectPeriod: 10000
            });

            this.client.on('connect', () => {
                // Using '#' ensures we catch deep nested paths like GivEnergy/ID/Power/Power/Load_Power
                this.client.subscribe('GivEnergy/#');
                console.log('[MQTT] Connected and monitoring core energy topics');
                resolve();
            });

            this.client.on('message', (topic, raw) => {
                try {
                    const cleanRaw = raw.toString().trim();
                    const value = Number(cleanRaw);

                    if (isNaN(value)) return;
                    const lowerTopic = topic.toLowerCase();

                    if (lowerTopic.endsWith('/p_battery')) {
                        this.latest.p_battery = value;
                    }

                    if (lowerTopic.endsWith('/load_power')) {
                        this.latest.houseLoad = value;
                    }

                    if (lowerTopic.endsWith('/battery_capacity_kwh')) {
                        this.latest.batteryCapacityKwh = value;
                    }

                    if (lowerTopic.endsWith('/battery_percent')) {
                        this.latest.soc = value;
                    }

                    if (lowerTopic.endsWith('/pv_power')) {
                        this.latest.solarPower = value;
                    }

                    if (lowerTopic.endsWith('/pv_energy_today_kwh')) {
                        this.latest.solarTodayKwh = value;
                    }

                    if (lowerTopic.endsWith('/battery_charge_energy_today_kwh')) {


                        this.latest.storageTodayKwh = value;


                    }

                    if (lowerTopic.endsWith('/battery_discharge_rate')) {
                        this.latest.dischargeRate = value;
                    }

                    if (lowerTopic.endsWith('/export_power')) {
                        this.latest.exportPower = Math.max(0, value);
                    }
                    //  if (lowerTopic.endsWith('/p_grid_out')) {
                    //     this.latest.exportPower = Math.max(0, value);
                    // }

                    if (lowerTopic.endsWith('/e_grid_out_day')) {
                        this.latest.exportTodayKwh = value;
                    }

                    if (lowerTopic.endsWith('/battery_to_grid')) {
                        this.latest.batteryToGrid = value;
                    }

                    if (lowerTopic.endsWith('/battery_to_house')) {
                        this.latest.batteryToHouse = value;
                    }

                    if (lowerTopic.endsWith('/grid_to_battery')) {
                        this.latest.gridToBattery = value;
                    }

                    if (lowerTopic.endsWith('/grid_to_house')) {
                       
                        this.latest.gridToHouse = value;
                    }

                    if (lowerTopic.endsWith('/solar_to_battery')) {
                        this.latest.solarToBattery = value;
                    }

                    if (lowerTopic.endsWith('/solar_to_grid')) {
                        // console.debug('solar to grid:', value);
                        this.latest.solarToGrid = value;
                    }

                    if (lowerTopic.endsWith('/solar_to_house')) {
                        this.latest.solarToHouse = value;
                    }

                    if (this.latest.batteryCapacityKwh !== null && this.latest.soc !== null) {
                        this.latest.energyRemainingKwh = Number(((this.latest.soc / 100) * this.latest.batteryCapacityKwh).toFixed(2));
                    }

                } catch (error) {
                    console.debug('MQTT parse error', error.message);
                }
            });
        });
    }

    async readMetrics() {
        return { ...this.latest };
    }
}