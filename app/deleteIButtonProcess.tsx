// app/deleteIButtonProcess.tsx
import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text, useTheme } from 'react-native-paper';
import { useMQTT } from '../contexts/MQTTContext';

export default function DeleteIButtonProcessScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { deleteIButtonState, cancelDeleteIButtonMode, initiateDeleteIButtonMode } = useMQTT();

  // Si el modo de borrado no está activo al entrar (ej. por navegación directa o error previo),
  // intentar activarlo o mostrar un error.
  useEffect(() => {
    if (!deleteIButtonState.isActive && !deleteIButtonState.statusMessage) { // Solo si no hay un mensaje de estado previo
      console.log("DeleteScreen: delete mode not active on mount, attempting to initiate.");
      // No llamar a initiateDeleteIButtonMode() automáticamente aquí sin interacción del usuario,
      // ya que implica biometría. El usuario ya lo hizo desde el menú.
      // Si se llega aquí y no está activo, es un estado anómalo o el usuario navegó hacia atrás y adelante.
      // Por ahora, si no está activo, mostrar un mensaje y permitir reintentar o volver.
      if (!deleteIButtonState.isLoading && !deleteIButtonState.statusMessage) { // Evitar bucle si ya se está cargando
        // router.replace('/'); // O volver a la pantalla anterior
        // O mostrar un botón para reintentar la activación
      }
    }
  }, [deleteIButtonState.isActive, deleteIButtonState.isLoading, deleteIButtonState.statusMessage, initiateDeleteIButtonMode]);


  const handleGoBack = () => {
    console.log("DeleteScreen: Canceling delete mode and going back.");
    cancelDeleteIButtonMode();
    router.back();
  };

  useEffect(() => {
    return () => {
      cancelDeleteIButtonMode();
    }
  }, [cancelDeleteIButtonMode]);


  let content;
  if (deleteIButtonState.isLoading) {
    content = <ActivityIndicator animating={true} size="large" color={theme.colors.primary} style={styles.loader} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={styles.titleText}>Modo Borrar iButton</Text>
      <Text style={styles.statusText}>{deleteIButtonState.statusMessage || "Activando modo..."}</Text>
      {content}
      {(!deleteIButtonState.isLoading || deleteIButtonState.error || deleteIButtonState.successData) && (
        <Button mode="outlined" onPress={handleGoBack} style={styles.button}>
          {deleteIButtonState.error || deleteIButtonState.successData ? "Finalizar" : "Cancelar y Volver"}
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
  titleText: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  statusText: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    minHeight: 40, // Para evitar saltos en la UI
  },
  loader: {
    marginBottom: 20,
  },
  button: {
    marginTop: 20,
    width: '80%',
  }
});