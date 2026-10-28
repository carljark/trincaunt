import React, { useEffect, useState } from 'react';
import './InstallPrompt.scss';

// Evento de Chromium (Android) que permite lanzar el diálogo de instalación cuando queramos
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'trincaunt:install-prompt-dismissed';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

// iPadOS se presenta como Mac; se distingue por la pantalla táctil
const isIOS = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

const wasDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

const InstallPrompt: React.FC = () => {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIOSHint, setShowIOSHint] = useState(false);
  const [hidden, setHidden] = useState(() => isStandalone() || wasDismissed());

  useEffect(() => {
    if (hidden) return;

    if (isIOS()) {
      setShowIOSHint(true);
      return;
    }

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const handleInstalled = () => setHidden(true);

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [hidden]);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      // Sin almacenamiento (modo privado): se oculta solo en esta sesión
    }
    setHidden(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    setInstallEvent(null);
    if (outcome === 'accepted') setHidden(true);
  };

  if (hidden || (!installEvent && !showIOSHint)) return null;

  return (
    <div className="install-prompt" role="dialog" aria-label="Instalar Trincaunt">
      <img className="install-prompt__icon" src="/icons/pwa-192x192.png" alt="" />
      <div className="install-prompt__text">
        <strong className="install-prompt__title">Instala Trincaunt</strong>
        {showIOSHint ? (
          <span className="install-prompt__hint">
            Pulsa{' '}
            <svg className="install-prompt__share" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3v12M8 7l4-4 4 4M6 11v9h12v-9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>{' '}
            Compartir y luego «Añadir a pantalla de inicio».
          </span>
        ) : (
          <span className="install-prompt__hint">Ábrela como una app, a pantalla completa.</span>
        )}
      </div>
      {installEvent && (
        <button type="button" className="install-prompt__button" onClick={install}>
          Instalar
        </button>
      )}
      <button type="button" className="install-prompt__close" onClick={dismiss} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
};

export default InstallPrompt;
