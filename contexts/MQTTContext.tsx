// contexts/MQTTContext.tsx
import React, { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { authenticateWithBiometrics } from '../services/BiometricAuth';
import {
    addMessageListener,
    connectMQTT as connectServiceMQTT,
    disconnectMQTT as disconnectServiceMQTT,
    isMQTTClientConnected as isServiceMQTTClientConnected,
    publishMQTT as publishServiceMQTT,
    removeMessageListener
} from '../services/MQTTService';

const ESP32_TARGET_DEVICE_ID = 'ESP32_Parking_01';

const MQTT_PROVIDER_LISTENER_ID = "MQTTProviderGlobalListener";

// Tipos para los mensajes y el estado
export interface MQTTMessage {
    topic: string;
    payload: string;
    parsedPayload?: any;
    timestamp: Date;
}

interface DialogAction {
    label: string;
    onPress: () => void;
    mode?: 'text' | 'outlined' | 'contained'; // Opcional para estilo del botón
}

// Para el dialog emergente de la app
interface AppDialogState {
    visible: boolean;
    title: string;
    content: string | React.ReactNode;
    actions?: DialogAction[];
    dismissable?: boolean;
}

// Tipos para el estado del Snackbar
interface AppSnackbarState {
    visible: boolean;
    message: string;
    action?: {
        label: string;
        onPress: () => void;
    };
    duration?: number;
}

interface MQTTContextState {
    // Estado de conexión y mensajes
    isConnected: boolean;
    lastMessage: MQTTMessage | null;
    parkingStatus: { online: boolean; occupancy: number; totalSpaces: number };
    pairingInfo: {
        sessionId?: string;
        status?: 'ready' | 'success' | 'failure';
        message?: string;
        data?: any
    };

    // Para el estado del diálogo
    dialogState: AppDialogState;
    showAppDialog: (title: string, content: string | React.ReactNode, actions?: DialogAction[], dismissable?: boolean) => void;
    hideAppDialog: () => void;

    // Para el snackbar
    snackbarState: AppSnackbarState;
    showAppSnackbar: (message: string, action?: AppSnackbarState['action'], duration?: number) => void;
    hideAppSnackbar: () => void;

    // Para borrar iButtons
    deleteIButtonState: AppDeleteIButtonState;
    initiateDeleteIButtonMode: () => Promise<boolean>;
    cancelDeleteIButtonMode: () => void;

    // Funciones de conexión y publicación
    connectMQTT: () => void;
    disconnectMQTT: () => void;
    publishMQTT: (subTopic: string, message: object | string, options?: object) => void;
    // Funciones específicas de la app que interactúan con MQTT
    initiatePairing: (sessionId: string) => Promise<boolean>;
    respondTo2FA: (ibuttonId: string, associatedId: number | string, allow: boolean) => Promise<void>;
}

interface AppDeleteIButtonState {
    isActive: boolean; // Si el modo de borrado MQTT está activo en el ESP32
    statusMessage?: string; // Ej. "Acerque iButton a borrar", "Borrado exitoso", "Fallo"
    isLoading?: boolean; // Para mostrar un spinner mientras se espera el iButton
    error?: string;
    successData?: any; // Datos del iButton borrado
}

const initialDeleteIButtonState: AppDeleteIButtonState = {
    isActive: false,
};

const initialDialogState: AppDialogState = {
    visible: false,
    title: '',
    content: '',
    actions: [],
    dismissable: true,
};

const initialSnackbarState: AppSnackbarState = {
    visible: false,
    message: '',
};

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
    const [pairingInfo, setPairingInfo] = useState<any>(defaultPairingInfo);

    // Para los dialogos y snackbars
    const [dialogState, setDialogState] = useState<AppDialogState>(initialDialogState);
    const [snackbarState, setSnackbarState] = useState<AppSnackbarState>(initialSnackbarState);

    // Estado para el modo de borrado de iButtons
    const [deleteIButtonState, setDeleteIButtonState] = useState<AppDeleteIButtonState>(initialDeleteIButtonState);

    const handleMQTTConnect = useCallback(() => {
        console.log("MQTTContext: Connected!");
        setIsConnected(true);
    }, []);

    const handleMQTTDisconnect = useCallback(() => {
        console.log("MQTTContext: Disconnected.");
        setIsConnected(false);
        setParkingStatus(prev => ({ ...prev, online: false })); // Marcar parking offline
    }, []);

    // Gestionar diálogo de la app
    const showAppDialog = useCallback((
        title: string,
        content: string | React.ReactNode,
        actions?: DialogAction[],
        dismissable: boolean = true
    ) => {
        setDialogState({ visible: true, title, content, actions: actions || [], dismissable });
    }, []);

    const hideAppDialog = useCallback(() => {
        setDialogState(prev => ({ ...prev, visible: false }));
        // Opcional: resetear completamente el estado del diálogo al ocultarlo
        // setTimeout(() => setDialogState(initialDialogState), 300); // Delay para animación
    }, []);

    // Gestionar snackbar
    const showAppSnackbar = useCallback((
        message: string,
        action?: AppSnackbarState['action'],
        duration?: number
    ) => {
        setSnackbarState({ visible: true, message, action, duration });
    }, []);

    const hideAppSnackbar = useCallback(() => {
        setSnackbarState(prev => ({ ...prev, visible: false }));
    }, []);


    // Función para manejar la respuesta de 2FA
    const respondTo2FA = useCallback(async (
        ibuttonId: string,
        associatedId: number | string,
        allow: boolean
    ): Promise<void> => {
        hideAppDialog(); // Ocultar el diálogo 2FA antes de la biometría
        const authSuccess: boolean = await authenticateWithBiometrics(
            `Confirmar ${allow ? 'entrada' : 'denegación'} para iButton ${associatedId}`
        );
        if (authSuccess) {
            publishServiceMQTT(`cmd/auth/2fa_response`, {
                ibutton_id: ibuttonId,
                allow_entry: allow,
                device_id: ESP32_TARGET_DEVICE_ID,
            });
            // Mostrar confirmación con snackbar
            showAppSnackbar(`Respuesta de ${allow ? 'permiso' : 'denegación'} enviada para iButton ${associatedId}.`);
        } else {
            showAppSnackbar("Autenticación biométrica fallida. No se envió respuesta 2FA.");
        }
    }, [hideAppDialog, showAppSnackbar]);

    useEffect(() => {
        const providerMessageHandler = (topic: string, messageString: string) => {
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
                        setPairingInfo({
                            sessionId: newMessage.parsedPayload.pairing_session_id,
                            status: 'ready',
                            message: 'Acerque el iButton...'
                        });
                    } else if (topic.endsWith('/pairing/success')) {
                        setPairingInfo({
                            sessionId: newMessage.parsedPayload.pairing_session_id,
                            status: 'success',
                            message: '¡Emparejamiento exitoso!',
                            data: newMessage.parsedPayload
                        });
                    } else if (topic.endsWith('/pairing/failure')) {
                        setPairingInfo({
                            sessionId: newMessage.parsedPayload.pairing_session_id,
                            status: 'failure',
                            message: `Fallo: ${newMessage.parsedPayload.reason}`,
                            data: newMessage.parsedPayload
                        });
                    }
                }
            }

            // Manejar el estado de borrado de iButtons
            if (topic.endsWith('/ibutton/delete_ready') && newMessage.parsedPayload) {
                setDeleteIButtonState({ isActive: true, isLoading: true, statusMessage: "Listo. Acerque el iButton a borrar..." });
            } else if (topic.endsWith('/ibutton/delete_success') && newMessage.parsedPayload) {
                setDeleteIButtonState({ isActive: false, isLoading: false, statusMessage: `iButton ${newMessage.parsedPayload.ibutton_id} borrado exitosamente.`, successData: newMessage.parsedPayload });
                showAppSnackbar(`iButton ${newMessage.parsedPayload.ibutton_id} borrado.`);
            } else if (topic.endsWith('/ibutton/delete_failure') && newMessage.parsedPayload) {
                setDeleteIButtonState({ isActive: false, isLoading: false, statusMessage: `Fallo al borrar: ${newMessage.parsedPayload.reason}`, error: newMessage.parsedPayload.reason });
                showAppSnackbar(`Error al borrar iButton: ${newMessage.parsedPayload.reason}`, undefined, 5000);
            }
        };

        console.log("MQTTProvider: Adding its message listener to MQTTService.");
        addMessageListener(MQTT_PROVIDER_LISTENER_ID, providerMessageHandler);

        console.log("MQTTProvider: Calling connectServiceMQTT.");
        connectServiceMQTT(handleMQTTConnect, handleMQTTDisconnect);

        return () => {
            console.log("MQTTProvider: Cleaning up. Removing its message listener and disconnecting MQTT.");
            removeMessageListener(MQTT_PROVIDER_LISTENER_ID);
            disconnectServiceMQTT();
        };
    }, [handleMQTTConnect, handleMQTTDisconnect, showAppSnackbar]);


    const connectMQTT = useCallback(() => {
        if (!isServiceMQTTClientConnected()) {
            connectServiceMQTT(handleMQTTConnect, handleMQTTDisconnect);
        }
    }, [handleMQTTConnect, handleMQTTDisconnect]);

    const disconnectMQTT = useCallback(() => {
        disconnectServiceMQTT();
    }, []);

    const publishMQTT = useCallback((subTopic: string, message: object | string, options?: object) => {
        publishServiceMQTT(subTopic, message, options as any);
    }, []);

    const initiatePairing = useCallback(async (sessionId: string): Promise<boolean> => {
        const authSuccess: boolean = await authenticateWithBiometrics('Autenticar para iniciar emparejamiento');
        if (authSuccess) {
            setPairingInfo({
                sessionId,
                status: 'initiating',
                message: 'Enviando solicitud de emparejamiento...'
            });
            publishServiceMQTT(
                'cmd/initiate_pairing',
                { pairing_session_id: sessionId }
            );
            return true;
        } else {
            showAppSnackbar("Autenticación fallida. Emparejamiento no iniciado.");
            return false;
        }
    }, [showAppSnackbar]);

    const initiateDeleteIButtonMode = useCallback(async (): Promise<boolean> => {
        const authSuccess: boolean = await authenticateWithBiometrics('Autenticar para activar modo borrado');
        if (authSuccess) {
            setDeleteIButtonState({ isActive: true, isLoading: true, statusMessage: "Activando modo borrado en el parking..." });
            publishServiceMQTT('cmd/ibutton/initiate_delete_mode', {}); // Payload vacío es suficiente
            return true;
        } else {
            showAppSnackbar("Autenticación fallida. Modo borrado no activado.");
            setDeleteIButtonState({ isActive: false, isLoading: false, statusMessage: "Modo borrado cancelado por autenticación fallida." });
            return false;
        }
    }, [showAppSnackbar]);

    const cancelDeleteIButtonMode = useCallback((): void => { // Opcional
        // Si el ESP32 tuviera un comando para cancelar el modo de borrado
        // publishServiceMQTT('cmd/ibutton/cancel_delete_mode', {});
        // Por ahora, la app simplemente resetea su estado local. El ESP32 tendrá timeout.
        setDeleteIButtonState(initialDeleteIButtonState);
        showAppSnackbar("Modo borrado cancelado en la app.");
    }, [showAppSnackbar]);



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
        dialogState,
        // Dialogo de la app
        showAppDialog,
        hideAppDialog,
        // Snackbar de la app
        snackbarState,
        showAppSnackbar,
        hideAppSnackbar,
        // Borrado
        deleteIButtonState,
        initiateDeleteIButtonMode,
        cancelDeleteIButtonMode,
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