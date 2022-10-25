import mqtt, { IClientOptions } from "async-mqtt";
import { chatMessageCallback } from "./chat";
import { queueUpdateCallback } from "./queue";
import { sessionHandler } from "./sessions";
import { GameModes } from "./const";
import * as dotenv from "dotenv";

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

mqttClient.subscribe("+/+/+");

mqttClient.on("message", (topic, message) => {
    let [service, action, session_key] = topic.split('/');

    let session = sessionHandler.getSession("session_key", session_key)
    if (!session) return;

    switch (service) {
        case "chat":
            chatMessageCallback(action, session, message.toString());
            break;
        case "vs":
            queueUpdateCallback(action, session, message.toString() as GameModes);
            break;
        case "battle":
            break;
    }

});