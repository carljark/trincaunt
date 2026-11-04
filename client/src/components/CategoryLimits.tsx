import React, { useEffect, useId, useState } from 'react';
import { ILimiteCategoria } from '../types/budget';
import { PlusIcon, TrashIcon } from './icons';
import './CategoryLimits.scss';

interface CategoryLimitsProps {
  limites: ILimiteCategoria[];
  // Categorías existentes del grupo, como sugerencias
  categories: string[];
  isOwner: boolean;
  onSave: (limites: ILimiteCategoria[]) => Promise<boolean>;
}

interface Row {
  categoria: string;
  limite: string; // tal y como se escribe (admite coma decimal)
}

const toRows = (limites: ILimiteCategoria[]): Row[] => limites.map(l => ({ categoria: l.categoria, limite: String(l.limite) }));
const parseAmount = (value: string) => Number(value.trim().replace(',', '.'));
const round2 = (n: number) => Math.round(n * 100) / 100;
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('es') === b.trim().toLocaleLowerCase('es');

// Tarjeta de Ajustes: un tope de gasto por ciclo para las categorías que se quieran vigilar
const CategoryLimits: React.FC<CategoryLimitsProps> = ({ limites, categories, isOwner, onSave }) => {
  const listId = useId();
  const [rows, setRows] = useState<Row[]>(() => toRows(limites));
  const [newCategory, setNewCategory] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Si llegan límites nuevos (al guardar, otro dispositivo), se reflejan. Depende del
  // contenido, no de la referencia: el padre crea un array nuevo en cada render.
  const limitesKey = JSON.stringify(limites);
  useEffect(() => {
    setRows(toRows(JSON.parse(limitesKey)));
  }, [limitesKey]);

  const parsed = rows.map(r => ({ categoria: r.categoria, limite: round2(parseAmount(r.limite)) }));
  const dirty = JSON.stringify(parsed) !== limitesKey;
  const suggestions = categories.filter(c => !rows.some(r => sameName(r.categoria, c)));

  const touch = () => {
    setSaved(false);
    setError(null);
  };

  const addRow = () => {
    const categoria = newCategory.trim();
    const amount = parseAmount(newAmount);
    if (!categoria) return setError('Escribe o elige una categoría.');
    if (rows.some(r => sameName(r.categoria, categoria))) return setError(`${categoria} ya tiene un límite.`);
    if (!(amount > 0)) return setError('El límite tiene que ser mayor que 0.');
    // Si existe con otras mayúsculas, se usa el nombre tal como está en los gastos
    const existing = categories.find(c => sameName(c, categoria));
    setRows(current => [...current, { categoria: existing ?? categoria, limite: newAmount.trim() }]);
    setNewCategory('');
    setNewAmount('');
    touch();
  };

  const onAddKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addRow();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = parsed.find(l => !(l.limite > 0));
    if (invalid) return setError(`El límite de ${invalid.categoria} tiene que ser mayor que 0.`);
    setBusy(true);
    touch();
    const ok = await onSave(parsed);
    setBusy(false);
    if (ok) setSaved(true);
  };

  if (!isOwner && limites.length === 0) return null;

  return (
    <section className="category-limits">
      <h3 className="category-limits__title">Límites por categoría</h3>
      <p className="category-limits__hint">
        Un tope de gasto por ciclo para lo que quieras vigilar (ocio, restaurantes…). Cuentan también sus alias; las
        facturas fijas no.
      </p>
      {error && <p className="category-limits__error" role="alert">{error}</p>}

      <form className="category-limits__form" onSubmit={submit}>
        {rows.length > 0 ? (
          <ul className="category-limits__list">
            {rows.map((row, index) => (
              <li key={row.categoria} className="category-limits__row">
                <span className="category-limits__name">{row.categoria}</span>
                <span className="category-limits__amount">
                  <input
                    className="category-limits__input"
                    type="text"
                    inputMode="decimal"
                    aria-label={`Límite de ${row.categoria}`}
                    value={row.limite}
                    disabled={!isOwner}
                    onChange={e => {
                      const limite = e.target.value;
                      setRows(current => current.map((r, i) => (i === index ? { ...r, limite } : r)));
                      touch();
                    }}
                  />
                  <span className="category-limits__currency" aria-hidden="true">€</span>
                </span>
                {isOwner && (
                  <button
                    type="button"
                    className="category-limits__icon-button"
                    aria-label={`Quitar el límite de ${row.categoria}`}
                    onClick={() => {
                      setRows(current => current.filter((_, i) => i !== index));
                      touch();
                    }}
                  >
                    <TrashIcon />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="category-limits__empty">Aún no has puesto ningún límite.</p>
        )}

        {isOwner && (
          <>
            <div className="category-limits__add">
              <input
                className="category-limits__input category-limits__input--category"
                type="text"
                list={listId}
                placeholder="Categoría"
                aria-label="Categoría del nuevo límite"
                value={newCategory}
                onChange={e => { setNewCategory(e.target.value); setError(null); }}
                onKeyDown={onAddKeyDown}
              />
              <datalist id={listId}>
                {suggestions.map(c => <option key={c} value={c} />)}
              </datalist>
              <span className="category-limits__amount">
                <input
                  className="category-limits__input"
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="Importe del nuevo límite"
                  value={newAmount}
                  onChange={e => { setNewAmount(e.target.value); setError(null); }}
                  onKeyDown={onAddKeyDown}
                />
                <span className="category-limits__currency" aria-hidden="true">€</span>
              </span>
              <button type="button" className="category-limits__icon-button category-limits__icon-button--add" aria-label="Añadir límite" onClick={addRow}>
                <PlusIcon />
              </button>
            </div>

            <div className="category-limits__actions">
              {saved && !dirty && <span className="category-limits__saved" role="status">Guardado</span>}
              <button type="submit" className="category-limits__button" disabled={busy || !dirty}>
                Guardar límites
              </button>
            </div>
          </>
        )}
      </form>
    </section>
  );
};

export default CategoryLimits;
