import mqtt, { IClientOptions } from 'async-mqtt';
import { sessionHandler, Session } from './sessions';
import * as dotenv from 'dotenv';

dotenv.config();

const mqttOptions: IClientOptions = {
    port: 8883,
    host: process.env.MQTT_HOST,
    protocol: "mqtts", // mqtts uses TLS
    username: process.env.MQTT_USERNAME, // mqtt client username
    password: process.env.MQTT_PASSWORD, // mqtt client password
    connectTimeout: 10 * 1000,
};

export const mqttClient = mqtt.connect(mqttOptions.host, mqttOptions);

mqttClient.subscribe('chat/+/+');

mqttClient.on('message', (topic, message) => {
    let [service, room, session_key] = topic.split('/');
    if (service !== "chat") return;

    if (sessionHandler.getSession(session_key)) {
        let msg = JSON.parse(message.toString());
        sessionHandler.getSessions().forEach((session: Session) => {
            if (room === "global" || session.battle_id === room)
                session.pushData(msg);
        })
    };

})



export const mqttPublish = (topic: string, payload: any) => {
    mqttClient.publish(topic, JSON.stringify(payload));
}