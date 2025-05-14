// services/BiometricAuth.ts
import * as LocalAuthentication from 'expo-local-authentication';
import { Alert } from 'react-native';

export const checkBiometricSupport = async (): Promise<boolean> => {
  const compatible: boolean = await LocalAuthentication.hasHardwareAsync();
  if (!compatible) {
    Alert.alert('Biometric Support', 'This device does not support biometric authentication.');
    return false;
  }
  const enrolled: boolean = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    Alert.alert('Biometrics Not Setup', 'No biometrics are currently enrolled on this device.');
    return false;
  }
  return true;
};

export const authenticateWithBiometrics = async (promptMessage: string = 'Authenticate to proceed'): Promise<boolean> => {
  const hasSupport: boolean = await checkBiometricSupport();
  if (!hasSupport) return false;

  try {
    const result: LocalAuthentication.LocalAuthenticationResult = await LocalAuthentication.authenticateAsync({
      promptMessage,
      fallbackLabel: 'Enter Passcode',
    });

    if (result.success) {
      console.log('Biometric authentication successful');
      return true;
    } else {
      console.log('Biometric authentication failed or cancelled:', result.error);
      return false;
    }
  } catch (error) {
    console.error('Biometric authentication error:', error);
    Alert.alert('Authentication Error', 'An unexpected error occurred during biometric authentication.');
    return false;
  }
};