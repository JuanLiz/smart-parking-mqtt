// app/pairing.tsx
import { useMQTT } from '@/contexts/MQTTContext';
import { useLocalSearchParams, useRouter } from 'expo-router'; // Para obtener parámetros y navegar
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';

interface ParsedPairingMessage {
    pairing_session_id: string;
    ibutton_id?: string;
    associated_id?: number | string;
    reason?: string;
}

export default function PairingScreen() {
    const theme = useTheme();
    const router = useRouter();
    // Obtener parámetros de la ruta con useLocalSearchParams

    const params = useLocalSearchParams<{ sessionId?: string }>();
    const currentScreenSessionId = params.sessionId;

    const { pairingInfo, publishMQTT } = useMQTT(); // Obtener del contexto

    const [status, setStatus] = useState<string>(currentScreenSessionId ? 'Iniciando emparejamiento...' : 'ID de sesión no encontrado.');
    const [isLoading, setIsLoading] = useState<boolean>(!!currentScreenSessionId);
    const [pairingComplete, setPairingComplete] = useState<boolean>(false);

    const currentMessageHandlerRef = useRef<((topic: string, message: string) => void) | null>(null);

    useEffect(() => {
        if (!currentScreenSessionId) {
            setStatus('Error: No se proporcionó ID de sesión para el emparejamiento.');
            setIsLoading(false);
            setPairingComplete(true); // Para mostrar el botón de volver
            return;
        }

        console.log("PairingScreen: useEffect for pairingInfo. Current session:", currentScreenSessionId, "Context pairingInfo:", pairingInfo);

    if (pairingInfo && pairingInfo.sessionId === currentScreenSessionId) {
      setStatus(pairingInfo.message || 'Actualizando estado de emparejamiento...');
      if (pairingInfo.status === 'ready') {
        setIsLoading(true); setPairingComplete(false);
      } else if (pairingInfo.status === 'success' || pairingInfo.status === 'failure') {
        setIsLoading(false); setPairingComplete(true);
      } else if (pairingInfo.status === 'initiating') {
        setIsLoading(true); setPairingComplete(false);
      }
    } else if (!pairingInfo || pairingInfo.sessionId !== currentScreenSessionId) {
        // Si no hay info de pairing para ESTA sesión aún en el contexto,
        // o si el pairingInfo del contexto es para una sesión diferente.
        // Esto puede pasar si se navega aquí antes de que el ESP32 envíe "ready".
        // El initiatePairing en HomeScreen ya setea un estado "initiating".
        if (status.startsWith('Iniciando emparejamiento...')) { // Mantener si es el estado inicial
            // El estado de "initiating" se pone en el contexto por initiatePairing()
            // y si coincide el sessionId, este useEffect lo tomará.
        }
    }
  }, [pairingInfo, currentScreenSessionId, status]); // Añadir status como dependencia si lo modificas dentro

  // useEffect para el timeout de la UI si el ESP32 no responde "ready"
  useEffect(() => {
    if (!currentScreenSessionId || pairingInfo?.sessionId === currentScreenSessionId && (pairingInfo.status === 'ready' || pairingInfo.status === 'success' || pairingInfo.status === 'failure')) {
        // Si ya tenemos un estado definitivo del ESP32 para esta sesión, o no hay sesión, no necesitamos el timer.
        return;
    }
    const timer = setTimeout(() => {
        if (
            isLoading &&
            !pairingComplete &&
            (
                !pairingInfo ||
                pairingInfo.sessionId !== currentScreenSessionId ||
                (typeof pairingInfo.status === 'undefined' && pairingInfo.status === 'initiating')
            )
        ) {
            setStatus('Esperando respuesta del parking para emparejar...');
        }
    }, 5000); // Esperar 5s para el mensaje "ready_for_ibutton" del ESP32
    return () => clearTimeout(timer);
  }, [isLoading, pairingComplete, pairingInfo, currentScreenSessionId]);


  const handleCancelPairing = (): void => {
    if (currentScreenSessionId) {
        publishMQTT('cmd/cancel_pairing', { pairing_session_id: currentScreenSessionId });
    }
    router.back();
  };

    // if (!sess) { // Manejo temprano si no hay sessionId
    //     return (
    //         <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
    //             <Text style={styles.statusText}>Error: ID de sesión de emparejamiento no disponible.</Text>
    //             <Button mode="outlined" onPress={() => router.back()} style={styles.button}>
    //                 Volver
    //             </Button>
    //         </View>
    //     );
    // }

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Text style={styles.statusText}>{status}</Text>
            {isLoading &&
                <ActivityIndicator animating={true} size="large"
                    style={styles.loader} color={theme.colors.primary} />
            }
            {!isLoading && pairingComplete && (
                <Button
                    mode="outlined"
                    onPress={() => router.back()}
                    style={styles.button}
                >
                    Finalizar
                </Button>
            )}
            {!pairingComplete && (
                <Button mode="contained"
                    onPress={handleCancelPairing}
                    style={styles.button}
                    buttonColor={theme.colors.error}
                    textColor={theme.colors.onError}
                >
                    Cancelar emparejamiento
                </Button>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
    },
    statusText: {
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 20,
    },
    loader: {
        marginBottom: 20,
    },
    button: {
        marginTop: 20,
        width: '80%',
    }
});