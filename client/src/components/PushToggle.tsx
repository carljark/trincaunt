import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentSubscription, getPushSupport, subscribeToPush, unsubscribeFromPush } from '../utils/push';
import './PushToggle.scss';

const PushToggle: React.FC = () => {
  const { token } = useAuth();
  const [support] = useState(getPushSupport);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCurrentSubscription().then(sub => setEnabled(!!sub)).catch(() => setEnabled(false));
  }, []);

  const toggle = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      if (enabled) {
        await unsubscribeFromPush(token);
        setEnabled(false);
      } else {
        await subscribeToPush(token);
        setEnabled(true);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="push-toggle">
      <div className="push-toggle__row">
        <div className="push-toggle__text">
          <span className="push-toggle__title" id="push-toggle-title">Notificaciones en este dispositivo</span>
          <span className="push-toggle__description">Gastos nuevos y pagos en tus grupos, aunque la app esté cerrada.</span>
        </div>
        {support === 'supported' && (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-labelledby="push-toggle-title"
            className={`push-toggle__switch ${enabled ? 'push-toggle__switch--on' : ''}`}
            onClick={toggle}
            disabled={busy}
          >
            <span className="push-toggle__knob" />
          </button>
        )}
      </div>
      {support === 'needs-install' && (
        <p className="push-toggle__note">
          En iPhone, primero instala la app: Compartir → «Añadir a pantalla de inicio», y ábrela desde ahí.
        </p>
      )}
      {support === 'unsupported' && (
        <p className="push-toggle__note">Este navegador no admite notificaciones push.</p>
      )}
      {error && <p className="push-toggle__error">{error}</p>}
    </section>
  );
};

export default PushToggle;
