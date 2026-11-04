import React, { useState } from 'react';
import Dialog from './Dialog';
import './BudgetMovementDialog.scss';

export interface BudgetMovementValues {
  descripcion: string;
  monto: number;
  fecha: string; // YYYY-MM-DD
}

interface BudgetMovementDialogProps {
  title: string;
  submitLabel: string;
  initial: { descripcion?: string; monto?: number; fecha: string };
  // Para un ingreso suelto se pide la descripción; al confirmar una partida, no
  askDescription?: boolean;
  hint?: string;
  onSubmit: (values: BudgetMovementValues) => Promise<void>;
  onClose: () => void;
}

// Confirma el pago de una factura, el cobro de un ingreso previsto o apunta un ingreso suelto
const BudgetMovementDialog: React.FC<BudgetMovementDialogProps> = ({
  title, submitLabel, initial, askDescription = false, hint, onSubmit, onClose
}) => {
  const [descripcion, setDescripcion] = useState(initial.descripcion ?? '');
  const [monto, setMonto] = useState(initial.monto !== undefined ? String(initial.monto) : '');
  const [fecha, setFecha] = useState(initial.fecha);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(monto.replace(',', '.'));
    if (!(amount > 0)) {
      setError('El importe debe ser mayor que 0.');
      return;
    }
    if (askDescription && !descripcion.trim()) {
      setError('Escribe una descripción.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ descripcion: descripcion.trim(), monto: Math.round(amount * 100) / 100, fecha });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
      setBusy(false);
    }
  };

  return (
    <Dialog
      title={title}
      onClose={onClose}
      onSubmit={submit}
      busy={busy}
      footer={
        <>
          <button type="button" className="budget-movement__button budget-movement__button--secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button type="submit" className="budget-movement__button budget-movement__button--primary" disabled={busy}>
            {busy ? 'Guardando…' : submitLabel}
          </button>
        </>
      }
    >
      <div className="budget-movement">
        {hint && <p className="budget-movement__hint">{hint}</p>}
        {error && <p className="budget-movement__error" role="alert">{error}</p>}

        {askDescription && (
          <label className="budget-movement__field">
            <span className="budget-movement__label">Descripción</span>
            <input
              className="budget-movement__input"
              type="text"
              value={descripcion}
              onChange={e => setDescripcion(e.target.value)}
              placeholder="Ej.: paga extra, Bizum…"
              autoFocus
            />
          </label>
        )}

        <label className="budget-movement__field">
          <span className="budget-movement__label">Importe</span>
          <span className="budget-movement__amount">
            <input
              className="budget-movement__input budget-movement__input--amount"
              type="text"
              inputMode="decimal"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              autoFocus={!askDescription}
            />
            <span className="budget-movement__currency" aria-hidden="true">€</span>
          </span>
        </label>

        <label className="budget-movement__field">
          <span className="budget-movement__label">Fecha</span>
          <input
            className="budget-movement__input"
            type="date"
            value={fecha}
            onChange={e => setFecha(e.target.value)}
            required
          />
        </label>
      </div>
    </Dialog>
  );
};

export default BudgetMovementDialog;
