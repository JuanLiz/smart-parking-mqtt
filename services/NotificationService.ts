// services/NotificationService.ts
import {
    addNotificationResponseReceivedListener,
    EventSubscription,
    NotificationContentInput,
    NotificationResponse,
    scheduleNotificationAsync,
    setNotificationHandler
} from 'expo-notifications';
import { Alert } from 'react-native';

setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

interface LocalNotificationData {
    type: '2fa_request_local'; // Tipo específico
    ibuttonId: string;
    associatedId: number | string;
    [key: string]: any;
}


export async function scheduleLocal2FANotification(ibuttonId: string, associatedId: number | string): Promise<void> {
    const content: NotificationContentInput = {
        title: "¿Aprobar entrada en parqueadero?",
        body: `Confirma la entrada para el ID asociado: ${associatedId}`,
        data: { type: '2fa_request_local', ibuttonId, associatedId } as LocalNotificationData,
        // sound: 'default', // Opcional
        // categoryIdentifier: '2fa_actions_local', // Si quieres acciones
    };
    const identifier: string = await scheduleNotificationAsync({
        content,
        trigger: null, // Mostrar inmediatamente
    });
    console.log('Local 2FA Notification scheduled with identifier:', identifier);
}

// Listener para cuando el usuario interactúa con una notificación
export const addLocalNotificationResponseListener = (
    handleResponseFunction: (data: LocalNotificationData) => Promise<void>
): EventSubscription => {
    const subscription = addNotificationResponseReceivedListener(response => {
        console.log('Local Notification response received:', response);
        const notificationData = response.notification.request.content.data as LocalNotificationData | undefined;

        if (notificationData && notificationData.type === '2fa_request_local') {
            // No hay "acciones" predefinidas como "permitir/denegar" directamente en la data
            // La interacción por defecto es que el usuario TOCA la notificación.
            // En ese momento, la app se abre (o pasa a primer plano) y deberías
            // mostrar un DIÁLOGO con los botones "Permitir" / "Denegar".
            handleResponseFunction(notificationData);
        }
    });
    return subscription;
};


// Esta función de manejo es un ejemplo, ajústala según sea necesario.
// `navigation` sería del tipo adecuado si lo pasas desde `App.tsx`
export const addNotificationResponseListener = (navigation?: any): EventSubscription => {
    const subscription: EventSubscription = addNotificationResponseReceivedListener((response: NotificationResponse) => {
        console.log('Notification response received:', response);
        // Asegurarse de que 'data' es del tipo esperado
        const notificationData = response.notification.request.content.data as LocalNotificationData | undefined;

        if (notificationData && notificationData.type === '2fa_request_local') {
            // Aquí es donde llamas a tu función handle2FAResponse
            // handle2FAResponse(notificationData.ibuttonId, notificationData.associatedId, true); // true = permitir
            // Debes definir cómo obtienes `handle2FAResponse` aquí, o pasarla como argumento.
            Alert.alert("Notification Tapped", `iButton: ${notificationData.ibuttonId}, Action needed.`);
        }
    });
    return subscription;
};


export const addConfiguredNotificationResponseListener = (
    handleResponseFunction: (ibuttonId: string, associatedId: number | string, isAllowed: boolean) => Promise<void>
): EventSubscription => {
    const subscription = addNotificationResponseReceivedListener(response => {
        console.log('Notification response received:', response);
        const notificationData = response.notification.request.content.data as LocalNotificationData | undefined;

        if (notificationData && notificationData.type === '2fa_request_local') {
            // Ejemplo: si se toca la notificación, se asume "permitir"
            // En un caso real, podrías tener acciones en la notificación
            handleResponseFunction(notificationData.ibuttonId, notificationData.associatedId, true);
        }
    });
    return subscription;
};