import React, { useEffect, useState } from 'react';
import { IBudgetConfig } from '../types/budget';
import CategoryLimits from './CategoryLimits';
import './BudgetSettings.scss';

export interface BudgetSettingsChange {
  tipo?: 'compartido' | 'personal';
  presupuesto?: Partial<IBudgetConfig>;
}

interface BudgetSettingsProps {
  tipo: 'compartido' | 'personal';
  presupuesto?: IBudgetConfig;
  memberCount: number;
  isOwner: boolean;
  onSave: (change: BudgetSettingsChange) => Promise<boolean>;
  categories?: string[];
}

const DEFAULTS: IBudgetConfig = { diaInicioCiclo: 1, ahorroObjetivo: 0, incluirOtrosGrupos: false, avisos: true };
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

// Tarjeta de la pestaña Grupo: activar el modo presupuesto personal y configurarlo
const BudgetSettings: React.FC<BudgetSettingsProps> = ({ tipo, presupuesto, memberCount, isOwner, onSave, categories = [] }) => {
  const config = { ...DEFAULTS, ...presupuesto };
  const [dia, setDia] = useState(config.diaInicioCiclo);
  const [ahorro, setAhorro] = useState(String(config.ahorroObjetivo));
  const [incluir, setIncluir] = useState(config.incluirOtrosGrupos);
  const [avisos, setAvisos] = useState(config.avisos !== false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Si llega una configuración nueva (otro dispositivo, recarga), se refleja
  useEffect(() => {
    setDia(config.diaInicioCiclo);
    setAhorro(String(config.ahorroObjetivo));
    setIncluir(config.incluirOtrosGrupos);
    setAvisos(config.avisos !== false);
  }, [config.diaInicioCiclo, config.ahorroObjetivo, config.incluirOtrosGrupos, config.avisos]);

  const save = async (change: BudgetSettingsChange) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const ok = await onSave(change);
    setBusy(false);
    if (ok) setSaved(true);
    return ok;
  };

  if (tipo === 'compartido') {
    if (!isOwner) return null;
    return (
      <section className="budget-settings">
        <h3 className="budget-settings__title">Presupuesto personal</h3>
        <p className="budget-settings__text">
          Usa este grupo para tus gastos personales: apunta tu nómina y tus facturas fijas y te dirá cuánto puedes
          gastar cada semana y cada día hasta que vuelvas a cobrar.
        </p>
        {memberCount === 1 ? (
          <button
            type="button"
            className="budget-settings__button budget-settings__button--primary"
            onClick={() => save({ tipo: 'personal' })}
            disabled={busy}
          >
            Convertir en presupuesto personal
          </button>
        ) : (
          <p className="budget-settings__hint">Solo se puede con grupos de un único miembro.</p>
        )}
      </section>
    );
  }

  const ahorroNumber = Number(ahorro.replace(',', '.'));
  const dirty = dia !== config.diaInicioCiclo || ahorroNumber !== config.ahorroObjetivo || incluir !== config.incluirOtrosGrupos
    || avisos !== (config.avisos !== false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!(ahorroNumber >= 0)) {
      setError('El ahorro no puede ser negativo.');
      return;
    }
    void save({ presupuesto: { diaInicioCiclo: dia, ahorroObjetivo: Math.round(ahorroNumber * 100) / 100, incluirOtrosGrupos: incluir, avisos } });
  };

  return (
    <>
      <section className="budget-settings">
        <h3 className="budget-settings__title">Presupuesto personal</h3>
        {error && <p className="budget-settings__error" role="alert">{error}</p>}

        <form className="budget-settings__form" onSubmit={submit}>
          <div className="budget-settings__row">
            <label className="budget-settings__field">
              <span className="budget-settings__label">Día de cobro</span>
              <select
                className="budget-settings__select"
                value={dia}
                onChange={e => { setDia(Number(e.target.value)); setSaved(false); }}
                disabled={!isOwner}
              >
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="budget-settings__field">
              <span className="budget-settings__label">Ahorro por ciclo</span>
              <span className="budget-settings__amount">
                <input
                  className="budget-settings__input"
                  type="text"
                  inputMode="decimal"
                  value={ahorro}
                  onChange={e => { setAhorro(e.target.value); setSaved(false); }}
                  disabled={!isOwner}
                />
                <span className="budget-settings__currency" aria-hidden="true">€</span>
              </span>
            </label>
          </div>
          <p className="budget-settings__hint">
            El ciclo va del día de cobro al día anterior del mes siguiente. Si un mes es más corto, empieza su último día.
          </p>

          <label className="budget-settings__check">
            <input
              className="budget-settings__checkbox"
              type="checkbox"
              checked={incluir}
              onChange={e => { setIncluir(e.target.checked); setSaved(false); }}
              disabled={!isOwner}
            />
            <span className="budget-settings__check-text">
              Contar mi parte de los grupos compartidos
              <span className="budget-settings__hint">
                Resta del presupuesto lo que te toca de los gastos de tus otros grupos. No apuntes esos gastos también aquí
                o contarán dos veces.
              </span>
            </span>
          </label>

          <label className="budget-settings__check">
            <input
              className="budget-settings__checkbox"
              type="checkbox"
              checked={avisos}
              onChange={e => { setAvisos(e.target.checked); setSaved(false); }}
              disabled={!isOwner}
            />
            <span className="budget-settings__check-text">
              Avisarme al llegar al 80 % y al 100 %
              <span className="budget-settings__hint">
                Del presupuesto del ciclo y de cada límite por categoría, una vez por ciclo. Llegan a los dispositivos
                con las notificaciones activadas en Preferencias.
              </span>
            </span>
          </label>

          {isOwner && (
            <div className="budget-settings__actions">
              {saved && !dirty && <span className="budget-settings__saved" role="status">Guardado</span>}
              <button type="submit" className="budget-settings__button budget-settings__button--primary" disabled={busy || !dirty}>
                Guardar
              </button>
            </div>
          )}
        </form>

        {isOwner && (
          <button
            type="button"
            className="budget-settings__button budget-settings__button--secondary"
            onClick={() => save({ tipo: 'compartido' })}
            disabled={busy}
          >
            Volver a grupo compartido
          </button>
        )}
      </section>

      <CategoryLimits
        limites={presupuesto?.limitesCategoria ?? []}
        categories={categories}
        isOwner={isOwner}
        onSave={limitesCategoria => onSave({ presupuesto: { limitesCategoria } })}
      />
    </>
  );
};

export default BudgetSettings;
