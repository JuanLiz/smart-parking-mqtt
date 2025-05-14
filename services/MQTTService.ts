// services/MQTTService.ts
import mqtt, { IClientOptions, IClientPublishOptions, IClientSubscribeOptions, MqttClient } from 'mqtt';
import { Alert } from 'react-native';

// --- Configuración ---
const MQTT_BROKER_HOST: string = 'ws://broker.emqx.io:8083/mqtt';
const MQTT_CLIENT_ID_PREFIX: string = 'juanliz_rn_app_';
const BASE_TOPIC_PREFIX: string = 'juanliz-sparking-esp32/';

let client: MqttClient | null = null;
// CAMBIO: Array de listeners
type MessageListenerCallback = (topic: string, message: string) => void;
interface MessageListener {
  id: string; // Un ID único para poder removerlo
  callback: MessageListenerCallback;
}
let messageListeners: MessageListener[] = [];
let onConnectCallback: (() => void) | null = null;
let onDisconnectCallback: (() => void) | null = null;

const generateClientId = (): string => {
  return MQTT_CLIENT_ID_PREFIX + Math.random().toString(16).substring(2, 10);
};

export const connectMQTT = (onConnect?: () => void, onDisconnect?: () => void): MqttClient | null => {
  if (client && client.connected) {
    console.log('MQTT: Already connected');
    if (onConnect) onConnect();
    return client;
  }

  const clientId: string = generateClientId();
  console.log(`MQTT: Attempting to connect to ${MQTT_BROKER_HOST} with client ID: ${clientId}`);

  const options: IClientOptions = {
    clientId,
    keepalive: 60,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
    clean: true,
  };

  client = mqtt.connect(MQTT_BROKER_HOST, options);
  onConnectCallback = onConnect || null;
  onDisconnectCallback = onDisconnect || null;

  client.on('connect', () => {
    console.log('MQTT: Connected to broker!');
    if (onConnectCallback) onConnectCallback();
    subscribeToTopics();
  });

  client.on('error', (error: Error) => {
    console.error('MQTT: Connection error:', error);
    Alert.alert("MQTT Error", `Connection error: ${error.message}`);
    if (onDisconnectCallback) onDisconnectCallback();
  });

  client.on('reconnect', () => {
    console.log('MQTT: Reconnecting...');
  });

  client.on('close', () => {
    console.log('MQTT: Connection closed.');
    if (onDisconnectCallback) onDisconnectCallback();
  });

  client.on('offline', () => {
    console.log('MQTT: Client offline.');
    if (onDisconnectCallback) onDisconnectCallback();
  });

  client.on('message', (topic: string, payload: Buffer) => {
    const message: string = payload.toString();
    console.log(`MQTTService: Broadcasting message to ${messageListeners.length} listeners.`);
    messageListeners.forEach(listener => {
      try {
        // console.log(`MQTTService: Invoking listener with ID: ${listener.id}`);
        listener.callback(topic, message);
      } catch (e) {
        console.error(`MQTTService: Error in listener ${listener.id}:`, e);
      }
    });
  });
  return client;
};

export const disconnectMQTT = (): void => {
  if (client) {
    console.log('MQTT: Disconnecting...');
    client.end(true, () => {
      console.log('MQTT: Disconnected.');
      client = null;
      if (onDisconnectCallback) onDisconnectCallback();
    });
  }
};

// Define un tipo para el payload de publicación si es siempre un objeto
interface PublishPayload {
  [key: string]: any;
}

export const publishMQTT = (subTopic: string, message: PublishPayload | string, options?: IClientPublishOptions): void => {

  if (!options) { // Asegurar que options no sea undefined
    options = { qos: 0, retain: false };
  }

  if (client && client.connected) {
    const fullTopic: string = `${BASE_TOPIC_PREFIX}${subTopic}`;
    const payloadString: string = typeof message === 'string' ? message : JSON.stringify(message);
    console.log(`MQTT: Publishing to [${fullTopic}]: ${payloadString}`);
    client.publish(fullTopic, payloadString, options, (error?: Error) => {
      if (error) {
        console.error(`MQTT: Publish error to ${fullTopic}:`, error);
        Alert.alert("Publish Error", `Failed to publish to ${fullTopic}`);
      }
    });
  } else {
    console.warn('MQTT: Client not connected. Cannot publish.');
    Alert.alert("Not Connected", "MQTT client is not connected. Cannot publish message.");
  }
};

const subscribeToTopics = (): void => {
  if (client && client.connected) {
    const topicsToSubscribe: string[] = [
      `${BASE_TOPIC_PREFIX}status`,
      `${BASE_TOPIC_PREFIX}pairing/#`,
      `${BASE_TOPIC_PREFIX}auth/2fa_request`,
    ];

    topicsToSubscribe.forEach(topic => {
      const subOptions: IClientSubscribeOptions = { qos: 0 };
      client!.subscribe(topic, subOptions, (error: Error | null, granted?) => {
        if (error) {
          console.error(`MQTT: Subscribe error to ${topic}:`, error);
        } else {
          console.log(`MQTT: Subscribed to ${topic}`);
        }
      });
    });
  }
};

export const addMessageListener = (id: string, callback: MessageListenerCallback): void => {
  // Remover si ya existe para evitar duplicados con el mismo ID
  removeMessageListener(id);
  console.log(`MQTTService: Adding message listener with ID: ${id}`);
  messageListeners.push({ id, callback });
};

export const removeMessageListener = (id: string): void => {
  console.log(`MQTTService: Removing message listener with ID: ${id}`);
  messageListeners = messageListeners.filter(listener => listener.id !== id);
};

export const isMQTTClientConnected = (): boolean => {
  return !!(client && client.connected);
}