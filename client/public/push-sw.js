// Manejo de notificaciones push. El service worker que genera vite-plugin-pwa lo carga con
// importScripts (workbox.importScripts en vite.config.ts).

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Trincaunt', {
      body: data.body || '',
      icon: '/icons/pwa-192x192.png',
      badge: '/icons/pwa-192x192.png',
      tag: data.tag,
      data: { url: data.url || '/' }
    })
  );
});

// Al tocar la notificación: reutiliza una ventana abierta de la app o abre una nueva
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const client = windows.find((w) => w.url.startsWith(self.location.origin));
      if (client) {
        // navigate() falla si esa ventana no la controla este service worker
        return client.focus()
          .then((focused) => focused.navigate(url))
          .catch(() => self.clients.openWindow(url));
      }
      return self.clients.openWindow(url);
    })
  );
});
