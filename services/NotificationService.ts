// services/NotificationService.ts
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Alert, Platform } from 'react-native';
import { authenticateWithBiometrics } from './BiometricAuth';
import { publishMQTT } from './MQTTService';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

interface NotificationData {
    type: string;
    ibuttonId: string;
    associatedId: number | string;
    [key: string]: any;
}

type CustomNotification = {
    request: {
        content: Notifications.NotificationContent & { data: NotificationData };
        identifier: string;
        trigger: Notifications.NotificationTriggerInput;
    };
};


export async function registerForPushNotificationsAsync(): Promise<string | undefined> {
    let token: string | undefined;
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus: Notifications.PermissionStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') {
        Alert.alert('Notifications Failed!', 'Failed to get push token for push notification. Please enable notifications in settings.');
        return;
    }

    try {
        // Asegúrate de que `Constants.expoConfig.extra.eas.projectId` existe y es un string.
        // Si usas una versión anterior de expo-constants, podría ser `Constants.manifest.extra.eas.projectId`
        // o `Constants.manifest2.extra.eas.projectId` para SDK 49+
        const projectId = Constants.expoConfig?.extra?.eas?.projectId
            || Constants.manifest2?.extra?.eas?.projectId;
        if (!projectId) {
            console.error("Expo Project ID not found in Constants. Cannot get push token.");
            Alert.alert('Push Token Error', 'Expo Project ID not found. Configure it in app.json/app.config.js under extra.eas.projectId');
            return;
        }
        token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log('Expo Push Token:', token);
    } catch (e) {
        console.error("Failed to get Expo push token", e);
        Alert.alert('Push Token Error', 'Could not get push token.');
    }

    return token;
}

export async function schedule2FAPushNotification(ibuttonId: string, associatedId: number | string): Promise<void> {
    const content: Notifications.NotificationContentInput = {
        title: "🚗 Smart Parking - 2FA Request!",
        body: `Permitir entrada para iButton con ID Asociado: ${associatedId}?`,
        data: { type: '2fa_request', ibuttonId, associatedId } as NotificationData,
    };
    const identifier: string = await Notifications.scheduleNotificationAsync({
        content,
        trigger: null,
    });
    console.log('2FA Notification scheduled with identifier:', identifier);
}


// Esta función de manejo es un ejemplo, ajústala según sea necesario.
// `navigation` sería del tipo adecuado si lo pasas desde `App.tsx`
export const addNotificationResponseListener = (navigation?: any): Notifications.Subscription => {
    const subscription: Notifications.Subscription = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
        console.log('Notification response received:', response);
        // Asegurarse de que 'data' es del tipo esperado
        const notificationData = response.notification.request.content.data as NotificationData | undefined;

        if (notificationData && notificationData.type === '2fa_request') {
            // Aquí es donde llamas a tu función handle2FAResponse
            // handle2FAResponse(notificationData.ibuttonId, notificationData.associatedId, true); // true = permitir
            // Debes definir cómo obtienes `handle2FAResponse` aquí, o pasarla como argumento.
            Alert.alert("Notification Tapped", `iButton: ${notificationData.ibuttonId}, Action needed.`);
        }
    });
    return subscription;
};

// Definición de handle2FAResponse (debe estar accesible o ser importada donde se usa)
// Esta es una función ejemplo, su ubicación real dependerá de tu estructura
async function _internalHandle2FAResponse(ibuttonId: string, associatedId: number | string, isAllowed: boolean): Promise<void> {
    // Asegúrate de que authenticateWithBiometrics y publishMQTT estén disponibles/importadas
    const authSuccess: boolean = await authenticateWithBiometrics(`Confirmar ${isAllowed ? 'entrada' : 'denegación'} para iButton ${associatedId}`);
    if (authSuccess) {
        const installationId: string | null = Constants.installationId || (Constants.deviceId as string | null); // installationId es preferido
        const appDeviceId = installationId || "unknown_app_device";

        publishMQTT(`cmd/auth/2fa_response`, {
            ibutton_id: ibuttonId,
            allow_entry: isAllowed,
            device_id: 'ESP32_Parking_01', // El ID del ESP32 al que va la respuesta
            // app_device_id: appDeviceId 
        });
        Alert.alert("2FA Respuesta Enviada", `Respuesta de ${isAllowed ? 'permiso' : 'denegación'} enviada para iButton ${associatedId}.`);
    } else {
        Alert.alert("Autenticación Fallida", "No se pudo enviar la respuesta 2FA.");
    }
};

// Si llamas a _internalHandle2FAResponse desde addNotificationResponseListener,
// asegúrate de que está en el mismo scope o es importada.
// Para simplificar, podrías redefinir addNotificationResponseListener para aceptar handle2FAResponse:

export const addConfiguredNotificationResponseListener = (
    handleResponseFunction: (ibuttonId: string, associatedId: number | string, isAllowed: boolean) => Promise<void>
): Notifications.Subscription => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
        console.log('Notification response received:', response);
        const notificationData = response.notification.request.content.data as NotificationData | undefined;

        if (notificationData && notificationData.type === '2fa_request') {
            // Ejemplo: si se toca la notificación, se asume "permitir"
            // En un caso real, podrías tener acciones en la notificación
            handleResponseFunction(notificationData.ibuttonId, notificationData.associatedId, true);
        }
    });
    return subscription;
};