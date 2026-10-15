// Avisos e confirmações iguais no Android, iOS e Web.
import { Alert, Platform } from 'react-native';

/** Aviso simples com OK. */
export function notify(message: string) {
  if (Platform.OS === 'web') window.alert(message);
  else Alert.alert('Soundhora', message);
}

/**
 * Pergunta antes de algo que não se desfaz. `ok` é o rótulo da ação ("Apagar"), não "OK".
 * Resolve true só se a pessoa confirmou.
 */
export function confirmAction(message: string, ok: string, cancel: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert('Soundhora', message, [
      { text: cancel, style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) }),
  );
}
