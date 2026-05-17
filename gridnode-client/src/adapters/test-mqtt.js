import { MqttAdapter } from './mqttAdapter.js';

async function runTest() {
    console.log('--- GridNode MQTT Test Booting ---');
    
    // Replace with your actual MQTT broker IP if it's not local
    const adapter = new MqttAdapter({ 
        brokerUrl: 'mqtt://192.168.168.8:1883' 
    });

    console.log('Connecting to broker...');
    await adapter.connect();

    // Poll every 2 seconds and log the output to the console
    setInterval(async () => {
        const data = await adapter.readMetrics();
       // console.log(data)
       // console.clear(); // Keeps the console tidy
        // console.log('====================================');
        // console.log('   GRIDNODE LIVE BATTERY METRICS    ');
        // console.log('====================================');
        // console.log(` Time:       ${new Date().toLocaleTimeString()}`);
        // console.log(` Status:     ${data.batteryCapacityKwh > 0 ? '🟢 Active' : '🟠 Waiting for Data...'}`);
        // console.log('------------------------------------');
        // console.log(` House Load:      ${data.houseLoad} W`);
        // console.log(` Battery Power:   ${data.p_battery} W`);
        // console.log(` State of Charge: ${data.soc}%`);
        // console.log(` Capacity:        ${data.batteryCapacityKwh} kWh`);
        // console.log(` Energy Left:     ${data.energyRemainingKwh} kWh`);
        // console.log('------------------------------------');
        // console.log(` Solar Today:     ${data.solarTodayKwh} kWh`);
        // console.log(` Storage Today:   ${data.storageTodayKwh} kWh`);
        // console.log('====================================');
        // console.log(' Press Ctrl+C to exit');
    }, 5000);
}

runTest().catch(console.error);