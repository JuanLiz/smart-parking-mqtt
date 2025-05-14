// app/_layout.tsx
import {
  DarkTheme as NavigationDarkTheme,
  DefaultTheme as NavigationDefaultTheme,
  ThemeProvider
} from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Alert, Appearance } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { adaptNavigationTheme, Appbar, MD3DarkTheme, MD3LightTheme, Menu, Provider as PaperProvider } from 'react-native-paper';
import { MQTTProvider, useMQTT } from '../contexts/MQTTContext';
import { addConfiguredNotificationResponseListener, registerForPushNotificationsAsync } from '../services/NotificationService';

// El componente AppBarMenu ahora podría usar el contexto si necesita
// saber el estado de conexión MQTT para el título del botón.
function AppBarMenuContent() {
  const [appBarMenuVisible, setAppBarMenuVisible] = React.useState<boolean>(false);
  const { isConnected, connectMQTT, disconnectMQTT } = useMQTT(); // Usar el contexto
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

  return (
    <Menu
      visible={appBarMenuVisible}
      onDismiss={closeMenu}
      anchor={<Appbar.Action icon="dots-vertical" onPress={openMenu} />}
    >
      <Menu.Item onPress={() => { Alert.alert("Settings", "TODO: Settings Screen"); closeMenu(); }}
        title="Configuración" />
      <Menu.Item onPress={handleToggleMQTT} title={isConnected ? "Desconectar MQTT" : "Conectar MQTT"} />
    </Menu>
  );
}

// Componente interno para manejar lógica que necesita el contexto MQTT
function AppLogicSetup() {
  const { respondTo2FA, lastMessage } = useMQTT(); // Usamos respondTo2FA del contexto

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) console.log("AppLogicSetup: Push token obtained:", token);
    });

    const notificationSubscription = addConfiguredNotificationResponseListener(respondTo2FA);

    return () => {
      if (notificationSubscription) notificationSubscription.remove();
    };
  }, [respondTo2FA]);


  // Reaccionar a mensajes para alertas globales (como 2FA)
  useEffect(() => {
    if (lastMessage && lastMessage.topic.endsWith('auth/2fa_request') && lastMessage.parsedPayload) {
      const { ibutton_id, associated_id, device_id } = lastMessage.parsedPayload;
      if (ibutton_id && associated_id !== undefined) {
        Alert.alert(
          "Solicitud de Entrada 2FA",
          `Parking ${device_id || 'desconocido'} solicita confirmación para iButton ${associated_id}`,
          [
            { text: "Denegar", onPress: () => respondTo2FA(ibutton_id, associated_id, false), style: "cancel" },
            { text: "Permitir", onPress: () => respondTo2FA(ibutton_id, associated_id, true) }
          ],
          { cancelable: false }
        );
      }
    }
  }, [lastMessage, respondTo2FA]); // Depende de lastMessage y respondTo2FA

  return null; // Este componente no necesita renderizar nada
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
              <Stack.Screen name="index" options={{ title: 'Smart Parking Home' }} />
              <Stack.Screen name="pairing" options={{ title: 'Emparejar iButton' }} />
            </Stack>
          </MQTTProvider>
        </ThemeProvider>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}