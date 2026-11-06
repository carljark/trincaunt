import React, { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.scss';

// Cada cuánto se pregunta al servidor si hay versión nueva con la app abierta
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

// Comprueba si hay una versión nueva al volver a la app: en iPhone la app instalada casi
// nunca se cierra del todo, solo se reanuda, y el navegador no vuelve a mirarlo solo.
export const watchForUpdates = (registration: ServiceWorkerRegistration) => {
  const check = () => {
    if (navigator.onLine === false) return;
    registration.update().catch(() => {
      // Sin red o servidor caído: se vuelve a intentar en la siguiente ocasión
    });
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
  };
  document.addEventListener('visibilitychange', onVisible);
  const timer = window.setInterval(check, CHECK_INTERVAL_MS);
  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    window.clearInterval(timer);
  };
};

// Aviso de que hay una versión nueva de la app: al aceptarlo se activa y se recarga
const UpdatePrompt: React.FC = () => {
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const {
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) watchForUpdates(registration);
    }
  });

  if (!needRefresh || dismissed) return null;

  const update = async () => {
    setUpdating(true);
    // Activa la versión nueva y recarga la página
    await updateServiceWorker(true);
  };

  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <span className="update-prompt__text">
        <strong className="update-prompt__title">Hay una versión nueva</strong>
        <span className="update-prompt__hint">Actualiza para tener los últimos cambios.</span>
      </span>
      <button type="button" className="update-prompt__button" onClick={() => void update()} disabled={updating}>
        {updating ? 'Actualizando…' : 'Actualizar'}
      </button>
      <button type="button" className="update-prompt__close" onClick={() => setDismissed(true)} aria-label="Más tarde">
        ×
      </button>
    </div>
  );
};

export default UpdatePrompt;
