import mqtt from 'mqtt';
import { TcpClient } from 'jsmodbus';
import net from 'net';

export class GenericAdapter {
    constructor() {
        this.type = process.env.LOCAL_TYPE || 'mqtt';
        this.latest = {
            exportPower: 0,
            solarPower: 0,
            batteryPower: 0,
            houseLoad: 0,
            soc: 0,
            batteryCapacityKwh: null,
            energyRemainingKwh: null,
            solarTodayKwh: 0,
            storageTodayKwh: 0,
            dischargeRate: 0,
            exportTodayKwh: 0,
            batteryToGrid: 0,
            batteryToHouse: 0,
            gridToBattery: 0,
            gridToHouse: 0,
            solarToBattery: 0,
            solarToGrid: 0,
            solarToHouse: 0
        };

        // MQTT Config
        this.mqttUrl = process.env.LOCAL_MQTT_URL || 'mqtt://127.0.0.1:1883';
        this.topics = {
            exportPower: process.env.LOCAL_MQTT_EXPORT_TOPIC || 'home/sensor/export/state',
            solarPower: process.env.LOCAL_MQTT_SOLAR_TOPIC || 'home/sensor/solar/state',
            batteryPower: process.env.LOCAL_MQTT_BATTERY_POWER_TOPIC || 'home/sensor/battery_power/state',
            houseLoad: process.env.LOCAL_MQTT_LOAD_TOPIC || 'home/sensor/load/state',
            soc: process.env.LOCAL_MQTT_SOC_TOPIC || 'home/sensor/soc/state',
            batteryCapacity: process.env.LOCAL_MQTT_CAPACITY_TOPIC || 'home/sensor/capacity/state',
            solarToday: process.env.LOCAL_MQTT_SOLAR_TODAY_TOPIC || 'home/sensor/solar_today/state',
            storageToday: process.env.LOCAL_MQTT_STORAGE_TODAY_TOPIC || 'home/sensor/storage_today/state',
            exportToday: process.env.LOCAL_MQTT_EXPORT_TODAY_TOPIC || 'home/sensor/export_today/state',
            dischargeRate: process.env.LOCAL_MQTT_DISCHARGE_RATE_TOPIC || 'home/sensor/discharge_rate/state',
            reserve: process.env.LOCAL_MQTT_RESERVE_TOPIC || 'home/sensor/reserve/state',
            batteryToGrid: process.env.LOCAL_MQTT_BATT_GRID_TOPIC || 'home/flow/battery_to_grid',
            batteryToHouse: process.env.LOCAL_MQTT_BATT_HOUSE_TOPIC || 'home/flow/battery_to_house',
            gridToBattery: process.env.LOCAL_MQTT_GRID_BATT_TOPIC || 'home/flow/grid_to_battery',
            gridToHouse: process.env.LOCAL_MQTT_GRID_HOUSE_TOPIC || 'home/flow/grid_to_house',
            solarToBattery: process.env.LOCAL_MQTT_SOLAR_BATT_TOPIC || 'home/flow/solar_to_battery',
            solarToGrid: process.env.LOCAL_MQTT_SOLAR_GRID_TOPIC || 'home/flow/solar_to_grid',
            solarToHouse: process.env.LOCAL_MQTT_SOLAR_HOUSE_TOPIC || 'home/flow/solar_to_house'
        };

        // Modbus Config
        this.modbusHost = process.env.LOCAL_MODBUS_HOST || '192.168.1.50';
        this.modbusPort = Number(process.env.LOCAL_MODBUS_PORT) || 502;
        this.modbusRegister = Number(process.env.LOCAL_MODBUS_REGISTER) || 3005;
    }

    async connect() {
        console.log(`[Generic Adapter] Initializing via: ${this.type.toUpperCase()}`);
        if (this.type === 'mqtt') {
            this.setupMqtt();
        } else if (this.type === 'modbus') {
            this.setupModbus();
        }
        return true;
    }

    setupMqtt() {
        const client = mqtt.connect(this.mqttUrl);
        client.on('connect', () => {
            console.log(`[Generic MQTT] Connected to ${this.mqttUrl}`);
            client.subscribe(Object.values(this.topics));
        });

        client.on('message', (topic, message) => {
            const val = parseFloat(message.toString());
            if (isNaN(val)) return;

            if (topic === this.topics.exportPower) this.latest.exportPower = Math.max(0, val);
            if (topic === this.topics.solarPower) this.latest.solarPower = val;
            if (topic === this.topics.batteryPower) this.latest.batteryPower = val;
            if (topic === this.topics.houseLoad) this.latest.houseLoad = val;
            if (topic === this.topics.soc) this.latest.soc = val;
            if (topic === this.topics.batteryCapacity) this.latest.batteryCapacityKwh = val;
            if (topic === this.topics.solarToday) this.latest.solarTodayKwh = val;
            if (topic === this.topics.storageToday) this.latest.storageTodayKwh = val;
            if (topic === this.topics.exportToday) this.latest.exportTodayKwh = val;
            if (topic === this.topics.dischargeRate) this.latest.dischargeRate = val;
            if (topic === this.topics.reserve) this.latest.reserve = val;
            if (topic === this.topics.batteryToGrid) this.latest.batteryToGrid = val;
            if (topic === this.topics.batteryToHouse) this.latest.batteryToHouse = val;
            if (topic === this.topics.gridToBattery) this.latest.gridToBattery = val;
            if (topic === this.topics.gridToHouse) this.latest.gridToHouse = val;
            if (topic === this.topics.solarToBattery) this.latest.solarToBattery = val;
            if (topic === this.topics.solarToGrid) this.latest.solarToGrid = val;
            if (topic === this.topics.solarToHouse) this.latest.solarToHouse = val;
        });
    }

    setupModbus() {
        const socket = new net.Socket();
        const client = new TcpClient(socket);

        socket.on('connect', () => {
            console.log(`[Generic Modbus] Connected to ${this.modbusHost}`);
            setInterval(() => {
                client.readHoldingRegisters(this.modbusRegister, 1)
                    .then((resp) => {
                        this.latest.exportPower = Number(resp.response.body.values[0]);
                    })
                    .catch((err) => console.error('[Modbus Error]', err.message));
            }, 10000);
        });

        socket.on('error', (err) => console.error('[Modbus Socket Error]', err.message));
        socket.connect({ host: this.modbusHost, port: this.modbusPort });
    }

    async readMetrics() {
        // Calculate energy remaining if capacity and SOC are available
        if (this.latest.batteryCapacityKwh !== null && this.latest.soc !== null) {
            this.latest.energyRemainingKwh = Number(((this.latest.soc / 100) * this.latest.batteryCapacityKwh).toFixed(2));
        }

        return {
            ...this.latest,
            p_battery: this.latest.batteryPower, // Map consistent key name for Hub
            reserve: this.latest.reserve || 0
        };
    }
}