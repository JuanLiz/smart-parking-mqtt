// app/index.tsx
import { useMQTT } from '@/contexts/MQTTContext';
import { useRouter } from 'expo-router'; // Para navegación
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Text, useTheme } from 'react-native-paper';

interface OccupancyState {
    current: number;
    total: number;
}

interface ParsedMQTTMessageHomeScreen {
    online?: boolean;
    occupancy?: number;
    total_spaces?: number;
    ibutton_id?: string;
    associated_id?: number | string;
    pairing_session_id?: string;
    reason?: string;
}


export default function HomeScreen() {
    const theme = useTheme();
    const router = useRouter();
    const {
        isConnected: mqttConnected, // Obtener del contexto
        parkingStatus,
        pairingInfo,
        initiatePairing, // Usar la función del contexto
        lastMessage // Para el log de debug
    } = useMQTT();

    const [pairingStatusMessage, setPairingStatusMessage] = useState<string>('');
    const [lastMessagesLog, setLastMessagesLog] = useState<string[]>([]);


    // Reaccionar a cambios en pairingInfo del contexto
    useEffect(() => {
        if (pairingInfo?.status === 'success' && pairingInfo.data) {
            setPairingStatusMessage(`iButton ${pairingInfo.data.ibutton_id} emparejado con ID ${pairingInfo.data.associated_id}!`);
            setTimeout(() => setPairingStatusMessage(''), 7000);
        } else if (pairingInfo?.status === 'failure') {
            setPairingStatusMessage(`Fallo en emparejamiento: ${pairingInfo.message}`);
            setTimeout(() => setPairingStatusMessage(''), 7000);
        }
    }, [pairingInfo]);

    // Actualizar log de mensajes
    useEffect(() => {
        if (lastMessage) {
            setLastMessagesLog(prev => [`[${lastMessage.timestamp.toLocaleTimeString()}] ${lastMessage.topic.split('/').pop()}: ${String(lastMessage.payload).substring(0, 70)}...`, ...prev.slice(0, 4)]);
        }
    }, [lastMessage]);


    const handleInitiatePairingPress = async (): Promise<void> => {
        const sessionId: string = `rn_pair_${Date.now()}`;
        await initiatePairing(sessionId); // Llama a la función del contexto
        // initiatePairing ya maneja la biometría y la publicación MQTT.
        // El cambio de estado en pairingInfo (del contexto) debería ser detectado por PairingScreen.
        router.push({ pathname: '/pairing', params: { sessionId } });
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Card style={styles.card}>
                <Card.Title title="Estado del Parking" subtitle="Información en tiempo real" />
                <Card.Content>
                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Conexión MQTT:</Text>
                        <Text style={[styles.statusValue, { color: mqttConnected ? theme.colors.primary : theme.colors.error }]}>
                            {mqttConnected ? "Conectado" : "Desconectado"}
                        </Text>
                    </View>
                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Estado Parking:</Text>
                        <Text style={styles.statusValue}>{parkingStatus.online ? 'Online' : 'Offline'}</Text>
                    </View>
                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Ocupación:</Text>
                        <Text style={styles.statusValue}>{parkingStatus.occupancy} / {parkingStatus.totalSpaces}</Text>
                    </View>
                </Card.Content>
            </Card>

            <Button
                mode="contained"
                onPress={handleInitiatePairingPress}
                style={styles.button}
                disabled={!mqttConnected}
                icon="key-plus"
            >
                Emparejar Nuevo iButton
            </Button>
            {pairingStatusMessage ? <Text style={styles.pairingStatusText}>{pairingStatusMessage}</Text> : null}

            <Card style={styles.card}>
                <Card.Title title="Log MQTT (Global)" />
                <Card.Content>
                    {lastMessagesLog.length === 0 && <Text style={styles.logMessage}>Esperando mensajes...</Text>}
                    {lastMessagesLog.map((msg, index) => (
                        <Text key={index} style={styles.logMessage} numberOfLines={1}>{msg}</Text>
                    ))}
                </Card.Content>
            </Card>
        </ScrollView>
    );
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
    },
    card: {
        marginBottom: 20,
        elevation: 2,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    statusLabel: {
        fontSize: 16,
        // fontWeight: 'bold',
    },
    statusValue: {
        fontSize: 16,
    },
    button: {
        marginTop: 10,
        marginBottom: 20,
        paddingVertical: 8,
    },
    pairingStatusText: {
        textAlign: 'center',
        marginBottom: 20,
        fontSize: 16,
    },
    logMessage: {
        fontSize: 11,
        fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
        marginTop: 2,
    }
});