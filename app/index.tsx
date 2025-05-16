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


export default function HomeScreen() {
    const theme = useTheme();
    const router = useRouter();
    const {
        isConnected: mqttConnected,
        parkingStatus,
        pairingInfo,
        initiatePairing,
        lastMessage // Para el log de debug
    } = useMQTT();

    const [lastMessagesLog, setLastMessagesLog] = useState<string[]>([]);

    // Actualizar log de mensajes
    useEffect(() => {
        if (lastMessage) {
            setLastMessagesLog(prev => [`[${lastMessage.timestamp.toLocaleTimeString()}] ${lastMessage.topic.split('/').pop()}: ${String(lastMessage.payload).substring(0, 70)}...`, ...prev.slice(0, 4)]);
        }
    }, [lastMessage]);


    const handleInitiatePairingPress = async (): Promise<void> => {
        const sessionId: string = `rn_pair_${Date.now()}`;
        const canProceed = await initiatePairing(sessionId);
        if (canProceed) {
            router.push({ pathname: '/pairing', params: { sessionId } });
        }
    };

    return (
        <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
            <Card style={styles.card}>
                <Card.Title title="Estado del Parking" subtitle="Información en tiempo real" />
                <Card.Content>
                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Conexión MQTT:</Text>
                        <Text
                            style={[
                                styles.statusValue,
                                { color: mqttConnected ? theme.colors.primary : theme.colors.error }
                            ]}
                        >
                            {mqttConnected ? "Conectado" : "Desconectado"}
                        </Text>
                    </View>
                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Estado Parking:</Text>
                        <Text style={styles.statusValue}>
                            {parkingStatus.online ? 'Online' : 'Offline'}
                        </Text>
                    </View>
                    <View style={styles.statusRow}>
                        <Text style={styles.statusLabel}>Ocupación:</Text>
                        <Text style={styles.statusValue}>
                            {parkingStatus.occupancy} / {parkingStatus.totalSpaces}
                        </Text>
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

            <Card style={styles.card}>
                <Card.Title title="Log MQTT (Global)" />
                <Card.Content>
                    {lastMessagesLog.length === 0 && (
                        <Text style={styles.logMessage}>
                            Esperando mensajes...
                        </Text>
                    )}
                    {lastMessagesLog.map((msg, index) => (
                        <Text
                            key={index}
                            style={styles.logMessage}
                            numberOfLines={1}
                        >
                            {msg}
                        </Text>
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