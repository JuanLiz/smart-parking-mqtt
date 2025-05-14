// contexts/MQTTContext.tsx
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { authenticateWithBiometrics } from '../services/BiometricAuth';
import {
    addMessageListener,
    connectMQTT as connectServiceMQTT,
    disconnectMQTT as disconnectServiceMQTT,
    isMQTTClientConnected as isServiceMQTTClientConnected,
    publishMQTT as publishServiceMQTT,
    removeMessageListener
} from '../services/MQTTService';

const ESP32_TARGET_DEVICE_ID = 'ESP32_Parking_01'; // Mover a config si es necesario

const MQTT_PROVIDER_LISTENER_ID = "MQTTProviderGlobalListener"; 

// Tipos para los mensajes y el estado
export interface MQTTMessage {
    topic: string;
    payload: string; // JSON string
    parsedPayload?: any; // Opcional, si parseas aquí
    timestamp: Date;
}

interface MQTTContextState {
    isConnected: boolean;
    lastMessage: MQTTMessage | null; // Podrías tener un array de mensajes si necesitas historial
    parkingStatus: { online: boolean; occupancy: number; totalSpaces: number };
    pairingInfo: { sessionId?: string; status?: 'ready' | 'success' | 'failure'; message?: string; data?: any };
    connectMQTT: () => void;
    disconnectMQTT: () => void;
    publishMQTT: (subTopic: string, message: object | string, options?: object) => void; // Ajusta el tipo de 'message'
    // Funciones específicas de la app que interactúan con MQTT
    initiatePairing: (sessionId: string) => Promise<void>;
    respondTo2FA: (ibuttonId: string, associatedId: number | string, allow: boolean) => Promise<void>;
}

const defaultParkingStatus = { online: false, occupancy: 0, totalSpaces: 0 };
const defaultPairingInfo = {};

const MQTTContext = createContext<MQTTContextState | undefined>(undefined);

interface MQTTProviderProps {
    children: ReactNode;
}

export const MQTTProvider: React.FC<MQTTProviderProps> = ({ children }) => {
    const [isConnected, setIsConnected] = useState<boolean>(false);
    const [lastMessage, setLastMessage] = useState<MQTTMessage | null>(null);
    const [parkingStatus, setParkingStatus] = useState(defaultParkingStatus);
    const [pairingInfo, setPairingInfo] = useState<any>(defaultPairingInfo); // 'any' por ahora, definir tipo más específico

    const handleMQTTConnect = useCallback(() => {
        console.log("MQTTContext: Connected!");
        setIsConnected(true);
    }, []);

    const handleMQTTDisconnect = useCallback(() => {
        console.log("MQTTContext: Disconnected.");
        setIsConnected(false);
        setParkingStatus(prev => ({ ...prev, online: false })); // Marcar parking offline
    }, []);

    // Función para manejar la respuesta de 2FA (ahora parte del contexto)
    const respondTo2FA = useCallback(async (ibuttonId: string, associatedId: number | string, allow: boolean): Promise<void> => {
        const authSuccess: boolean = await authenticateWithBiometrics(`Confirmar ${allow ? 'entrada' : 'denegación'} para iButton ${associatedId}`);
        if (authSuccess) {
            publishServiceMQTT(`cmd/auth/2fa_response`, {
                ibutton_id: ibuttonId,
                allow_entry: allow,
                device_id: ESP32_TARGET_DEVICE_ID,
            });
            Alert.alert("2FA Respuesta Enviada", `Respuesta de ${allow ? 'permiso' : 'denegación'} enviada para iButton ${associatedId}.`);
        } else {
            Alert.alert("Autenticación Fallida", "No se pudo enviar la respuesta 2FA.");
        }
    }, []);

    useEffect(() => {
        console.log("MQTTProvider: useEffect RUNNING. Setting up MQTT connection and message handler...");

        const providerMessageHandler = (topic: string, messageString: string) => {
            console.log(`MQTTProvider: Listener (${MQTT_PROVIDER_LISTENER_ID}) received: [${topic}]: ${messageString}`);
            const newMessage: MQTTMessage = {
                topic,
                payload: messageString,
                timestamp: new Date(),
            };
            try { newMessage.parsedPayload = JSON.parse(messageString); }
            catch (e) {
                console.warn("MQTTProvider: Could not parse message payload as JSON", messageString);
                newMessage.parsedPayload = messageString; // Guardar como string si no es JSON
            }

            setLastMessage(newMessage);

            if (topic.endsWith('/status') && newMessage.parsedPayload?.online !== undefined) {
                setParkingStatus({
                    online: newMessage.parsedPayload.online || false,
                    occupancy: newMessage.parsedPayload.occupancy || 0,
                    totalSpaces: newMessage.parsedPayload.total_spaces || 0,
                });
            } else if (topic.includes('/pairing/')) {
                if (newMessage.parsedPayload?.pairing_session_id) {
                    if (topic.endsWith('/pairing/ready_for_ibutton')) {
                        setPairingInfo({ sessionId: newMessage.parsedPayload.pairing_session_id, status: 'ready', message: 'Acerque el iButton...' });
                    } else if (topic.endsWith('/pairing/success')) {
                        setPairingInfo({ sessionId: newMessage.parsedPayload.pairing_session_id, status: 'success', message: '¡Emparejamiento exitoso!', data: newMessage.parsedPayload });
                    } else if (topic.endsWith('/pairing/failure')) {
                        setPairingInfo({ sessionId: newMessage.parsedPayload.pairing_session_id, status: 'failure', message: `Fallo: ${newMessage.parsedPayload.reason}`, data: newMessage.parsedPayload });
                    }
                }
            }
            // NO manejamos auth/2fa_request aquí para la alerta, AppLogicSetup lo hará
        };

        console.log("MQTTProvider: Adding its message listener to MQTTService.");
        addMessageListener(MQTT_PROVIDER_LISTENER_ID, providerMessageHandler); // <--- AÑADIR LISTENER

        console.log("MQTTProvider: Calling connectServiceMQTT.");
        connectServiceMQTT(handleMQTTConnect, handleMQTTDisconnect);

        return () => {
            console.log("MQTTProvider: Cleaning up. Removing its message listener and disconnecting MQTT.");
            removeMessageListener(MQTT_PROVIDER_LISTENER_ID);
            disconnectServiceMQTT();
        };
    }, [handleMQTTConnect, handleMQTTDisconnect]);


    const connectMQTT = useCallback(() => {
        if (!isServiceMQTTClientConnected()) {
            connectServiceMQTT(handleMQTTConnect, handleMQTTDisconnect);
        }
    }, [handleMQTTConnect, handleMQTTDisconnect]);

    const disconnectMQTT = useCallback(() => {
        disconnectServiceMQTT();
    }, []);

    const publishMQTT = useCallback((subTopic: string, message: object | string, options?: object) => {
        publishServiceMQTT(subTopic, message, options as any); // 'as any' para simplificar tipo de options
    }, []);

    const initiatePairing = useCallback(async (sessionId: string): Promise<void> => {
        const authSuccess: boolean = await authenticateWithBiometrics('Autenticar para iniciar emparejamiento');
        if (authSuccess) {
            setPairingInfo({ sessionId, status: 'initiating', message: 'Enviando solicitud de emparejamiento...' });
            publishServiceMQTT('cmd/initiate_pairing', { pairing_session_id: sessionId });
            // El estado de pairingInfo se actualizará cuando llegue la respuesta del ESP32
        } else {
            Alert.alert("Autenticación Fallida", "No se pudo iniciar el emparejamiento.");
        }
    }, []);


    const contextValue: MQTTContextState = {
        isConnected,
        lastMessage,
        parkingStatus,
        pairingInfo,
        connectMQTT,
        disconnectMQTT,
        publishMQTT,
        initiatePairing,
        respondTo2FA,
    };

    return (
        <MQTTContext.Provider value={contextValue}>
            {children}
        </MQTTContext.Provider>
    );
};

// Hook personalizado para usar el contexto fácilmente
export const useMQTT = (): MQTTContextState => {
    const context = useContext(MQTTContext);
    if (context === undefined) {
        throw new Error('useMQTT must be used within a MQTTProvider');
    }
    return context;
};