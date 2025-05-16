// app/_layout.tsx
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider
} from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  adaptNavigationTheme,
  Appbar,
  Button, Dialog,
  MD3DarkTheme,
  MD3LightTheme,
  Menu,
  Provider as PaperProvider,
  Portal,
  Snackbar,
  Text
} from 'react-native-paper';
import { MQTTProvider, useMQTT } from '../contexts/MQTTContext';
import {
  addLocalNotificationResponseListener,
  scheduleLocal2FANotification
} from '../services/NotificationService';


function AppBarMenuContent() {
  const [appBarMenuVisible, setAppBarMenuVisible] = React.useState<boolean>(false);
  const { isConnected, connectMQTT, disconnectMQTT, initiateDeleteIButtonMode, deleteIButtonState } = useMQTT();
  const router = useRouter();

  const openMenu = () => setAppBarMenuVisible(true);
  const closeMenu = () => setAppBarMenuVisible(false);

  const handleToggleMQTT = () => {
    if (isConnected) {
      disconnectMQTT();
    } else {
      connectMQTT();
    }
    closeMenu();
  };

  const handleDeleteIButtonPress = async () => {
    closeMenu();
    await initiateDeleteIButtonMode();
    router.push('/deleteIButtonProcess');
  };

  return (
    <Menu
      visible={appBarMenuVisible}
      onDismiss={closeMenu}
      anchor={<Appbar.Action icon="dots-vertical" onPress={openMenu} />}
    >
      <Menu.Item
        onPress={handleDeleteIButtonPress}
        title="Borrar iButton"
        disabled={!isConnected}
      />
      <Menu.Item onPress={handleToggleMQTT} title={isConnected ? "Desconectar MQTT" : "Conectar MQTT"} />
    </Menu>
  );
}

// Componente interno para manejar lógica que necesita el contexto MQTT
function AppLogicSetup() {
  const { respondTo2FA, lastMessage, showAppDialog, hideAppDialog } = useMQTT();

  // Listener para cuando se TOCA una notificación local de 2FA
  useEffect(() => {
    const handleNotificationTap = async (data: /*LocalNotificationData*/ any) => {
      console.log("AppLogicSetup: Local 2FA Notification tapped. Data:", data);
      // Ahora que el usuario tocó la notificación, mostramos el DIÁLOGO de Paper
      // para que elija Permitir/Denegar.
      if (data.ibuttonId && data.associatedId !== undefined) {
        showAppDialog(
          "Confirmar Entrada 2FA",
          <Text variant="bodyMedium">{`¿Permitir entrada para iButton asociado: ${data.associatedId}?`}</Text>,
          [
            { label: "Denegar", onPress: () => respondTo2FA(data.ibuttonId, data.associatedId, false), mode: 'outlined' },
            { label: "Permitir", onPress: () => respondTo2FA(data.ibuttonId, data.associatedId, true), mode: 'contained' },
          ],
          false // No dismissable
        );
      }
    };

    // Ya no necesitamos el token de push para este flujo
    // registerForPushNotificationsAsync().then(token => {
    //   if (token) console.log("AppLogicSetup: Push token obtained:", token);
    // });

    const notificationSubscription = addLocalNotificationResponseListener(handleNotificationTap);

    return () => {
      if (notificationSubscription) notificationSubscription.remove();
    };
  }, [respondTo2FA, showAppDialog]); // respondTo2FA y showAppDialog son estables por useCallback

  // Reaccionar a mensajes MQTT para *disparar* la notificación local
  useEffect(() => {
    if (lastMessage && lastMessage.topic.endsWith('auth/2fa_request') && lastMessage.parsedPayload) {
      const { ibutton_id, associated_id, device_id } = lastMessage.parsedPayload;
      if (ibutton_id && associated_id !== undefined) {
        console.log("AppLogicSetup: Detected 2FA request from MQTT. Scheduling local notification.");
        scheduleLocal2FANotification(ibutton_id, associated_id); // Disparar notificación local
        // Ya NO mostramos Alert.alert() aquí directamente.
      }
    }
  }, [lastMessage]); // Solo depende de lastMessage

  return null;
}

function GlobalAppDialog() {
  const { dialogState, hideAppDialog } = useMQTT();

  if (!dialogState.visible) {
    return null;
  }

  return (
    <Portal>
      <Dialog visible={dialogState.visible} onDismiss={dialogState.dismissable ? hideAppDialog : undefined} dismissable={dialogState.dismissable}>
        <Dialog.Title>{dialogState.title}</Dialog.Title>
        <Dialog.Content>
          {typeof dialogState.content === 'string' ? (
            <Text variant="bodyMedium">{dialogState.content}</Text>
          ) : (
            dialogState.content
          )}
        </Dialog.Content>
        {dialogState.actions && dialogState.actions.length > 0 && (
          <Dialog.Actions>
            {dialogState.actions.map((action, index) => (
              <Button
                key={index}
                onPress={action.onPress}
                mode={action.mode || 'text'}
                style={{ paddingHorizontal: 8 }}
              >
                {action.label}
              </Button>
            ))}
          </Dialog.Actions>
        )}
      </Dialog>
    </Portal>
  );
}

function GlobalAppSnackbar() {
  const { snackbarState, hideAppSnackbar } = useMQTT();

  return (
    <Snackbar
      visible={snackbarState.visible}
      onDismiss={hideAppSnackbar}
      action={snackbarState.action}
      duration={snackbarState.duration || Snackbar.DURATION_MEDIUM}
      style={{ marginBottom: 50 }}
    >
      {snackbarState.message}
    </Snackbar>
  );
}


export default function RootLayout() {

  let colorScheme = Appearance.getColorScheme();

  const { LightTheme, DarkTheme } = adaptNavigationTheme({
    reactNavigationLight: NavigationDefaultTheme,
    reactNavigationDark: NavigationDarkTheme,
    materialLight: MD3LightTheme,
    materialDark: MD3DarkTheme,
  });

  const CombinedDarkTheme = {
    ...MD3DarkTheme,
    ...DarkTheme,
    colors: {
      ...MD3DarkTheme.colors,
      ...DarkTheme.colors,
    },
    fonts: {
      ...MD3DarkTheme.fonts,
      ...NavigationDarkTheme.fonts,
    },
  };

  const CombinedLightTheme = {
    ...MD3LightTheme,
    ...LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      ...LightTheme.colors,
    },
    fonts: {
      ...MD3LightTheme.fonts,
      ...NavigationDefaultTheme.fonts,
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={colorScheme === 'dark' ? CombinedDarkTheme : CombinedLightTheme}>
        <ThemeProvider
          value={CombinedDarkTheme}
        >
          <MQTTProvider>
            <AppLogicSetup />
            <Stack
              screenOptions={{
                header: (props) => (
                  <Appbar.Header>
                    {props.navigation.canGoBack() ? <Appbar.BackAction onPress={() => props.navigation.goBack()} /> : null}
                    <Appbar.Content title={props.options.title || "Smart Parking"} />
                    {!props.navigation.canGoBack() ? <AppBarMenuContent /> : null}
                  </Appbar.Header>
                ),
              }}
            >
              <Stack.Screen name="index" options={{ title: 'Smart Parking' }} />
              <Stack.Screen name="pairing" options={{ title: 'Emparejar iButton' }} />
              <Stack.Screen name="deleteIButtonProcess" options={{ title: 'Borrar iButton' }} />
            </Stack>
            <GlobalAppDialog />
            <GlobalAppSnackbar />
          </MQTTProvider>
        </ThemeProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}

function initiateDeleteIButtonMode() {
  throw new Error('Function not implemented.');
}
