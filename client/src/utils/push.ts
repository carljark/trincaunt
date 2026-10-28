const apiHost = import.meta.env.VITE_API_HOST || '';
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export type PushSupport = 'supported' | 'needs-install' | 'unsupported';

const isIOS = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// En iOS solo hay push si la app está instalada en la pantalla de inicio
export const getPushSupport = (): PushSupport => {
  const hasApis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (hasApis) return 'supported';
  if (isIOS() && !isStandalone()) return 'needs-install';
  return 'unsupported';
};

// La clave VAPID llega en base64url y pushManager.subscribe la quiere en bytes
const urlBase64ToUint8Array = (base64: string) => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

export const getCurrentSubscription = async (): Promise<PushSubscription | null> => {
  if (getPushSupport() !== 'supported') return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
};

// Debe llamarse desde un gesto del usuario (iOS no deja pedir permiso de otro modo)
export const subscribeToPush = async (token: string): Promise<void> => {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Has bloqueado las notificaciones. Actívalas en los ajustes del navegador.');
  }

  const keyRes = await fetch(`${apiHost}${apiBaseUrl}/push/public-key`);
  if (!keyRes.ok) throw new Error('El servidor no tiene las notificaciones configuradas.');
  const { data } = await keyRes.json();

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey)
  });

  const res = await fetch(`${apiHost}${apiBaseUrl}/push/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(subscription.toJSON())
  });
  if (!res.ok) {
    await subscription.unsubscribe();
    throw new Error('No se pudo guardar la suscripción.');
  }
};

// Da de baja este dispositivo; nunca lanza (se usa también al cerrar sesión)
export const unsubscribeFromPush = async (token: string | null): Promise<void> => {
  try {
    const subscription = await getCurrentSubscription();
    if (!subscription) return;
    if (token) {
      await fetch(`${apiHost}${apiBaseUrl}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ endpoint: subscription.endpoint })
      }).catch(() => undefined);
    }
    await subscription.unsubscribe();
  } catch (error) {
    console.error('Error dando de baja las notificaciones push:', error);
  }
};
