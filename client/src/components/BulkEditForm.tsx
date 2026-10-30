import React, { useState, useEffect } from 'react';
import { IUser } from '../types/user';
import { IGroup } from '../types/group';
import MemberToggleGroup from './MemberToggleGroup';
import './BulkEditForm.scss';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

export interface IBulkUpdateData {
  categoria?: string[];
  pagado_por?: string[];
  fecha?: string;
  participantes?: string[];
  asume_gasto?: boolean | null;
  localization?: string;
  grupo_id?: string;
}

interface BulkEditFormProps {
  members: IUser[];
  // Gastos que se ven con los filtros actuales: son los que se editarán
  expenseCount: number;
  onBulkUpdate: (updateData: IBulkUpdateData) => void;
  token: string;
  groupId: string;
}

const BulkEditForm: React.FC<BulkEditFormProps> = ({ members, expenseCount, onBulkUpdate, token, groupId }) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [paidByIds, setPaidByIds] = useState<string[]>([]);
  const [expenseDate, setExpenseDate] = useState<string>('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [assumeExpense, setAssumeExpense] = useState<boolean | null>(null);
  const [localization, setLocalization] = useState<string>('');
  const [groups, setGroups] = useState<IGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  
  const [categoryInput, setCategoryInput] = useState('');
  const [suggestedCategories, setSuggestedCategories] = useState<{ category: string, count: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            const validCategories = data.data.filter((item: { category: string, count: number }) => item && typeof item.category === 'string');
            setSuggestedCategories(validCategories);
          }
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    
    const fetchGroups = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/groups`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // Filter out the current group from the list
          setGroups(data.data.filter((g: IGroup) => g._id !== groupId));
        }
      } catch (err) {
        console.error('Error fetching groups:', err);
      }
    };

    fetchCategories();
    fetchGroups();
  }, [token, groupId]);
  
  const handleCategoryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && categoryInput.trim() !== '') {
      e.preventDefault();
      addCategory(categoryInput.trim());
    }
  };

  const addCategory = (categoryToAdd: string) => {
    if (!categories.includes(categoryToAdd)) {
      setCategories([...categories, categoryToAdd]);
    }
    setCategoryInput('');
  };

  const removeCategory = (categoryToRemove: string) => {
    setCategories(categories.filter(cat => cat !== categoryToRemove));
  };

  const handleUpdate = () => {
    const updateData: IBulkUpdateData = {};
    if (categories.length > 0) updateData.categoria = categories;
    if (paidByIds.length > 0) updateData.pagado_por = paidByIds;
    if (expenseDate) updateData.fecha = expenseDate;
    if (participants.length > 0) updateData.participantes = participants;
    if (assumeExpense !== null) updateData.asume_gasto = assumeExpense;
    if (localization) updateData.localization = localization;
    if (selectedGroup) updateData.grupo_id = selectedGroup;

    onBulkUpdate(updateData);
  };

  const memberOptions = members.map(m => ({ value: m._id, label: m.nombre }));

  const changeCount = [
    categories.length > 0, !!selectedGroup, paidByIds.length > 0, !!expenseDate,
    !!localization, participants.length > 0, assumeExpense !== null
  ].filter(Boolean).length;

  return (
    <section className="bulk-edit">
      <div className="bulk-edit__card">
        <div className="bulk-edit__intro">
          <h3 className="bulk-edit__title">Editar {expenseCount} {expenseCount === 1 ? 'gasto' : 'gastos'} a la vez</h3>
          <p className="bulk-edit__hint">
            Se editan los gastos que dejan los filtros de arriba. Solo cambia lo que rellenes; lo vacío se queda como está.
          </p>
        </div>

        <div
          className="bulk-edit__field"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setShowSuggestions(false);
            }
          }}
        >
          <label className="bulk-edit__label" htmlFor="bulk-edit-category">Categorías</label>
          <div className="bulk-edit__combo">
            <input
              className="bulk-edit__input"
              type="text"
              id="bulk-edit-category"
              placeholder="Escribe o elige y pulsa Intro"
              value={categoryInput}
              onChange={e => setCategoryInput(e.target.value)}
              onKeyDown={handleCategoryKeyDown}
              onFocus={() => setShowSuggestions(true)}
              autoComplete="off"
            />
            {showSuggestions && (
              <ul className="bulk-edit__suggestions">
                {categoryInput.trim() !== '' && !categories.includes(categoryInput.trim()) && (
                  <li
                    className="bulk-edit__suggestion bulk-edit__suggestion--add"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addCategory(categoryInput.trim());
                    }}
                  >
                    + Añadir «{categoryInput.trim()}»
                  </li>
                )}
                {suggestedCategories
                  .filter(c => !categories.includes(c.category))
                  .filter(c => c.category.toLowerCase().includes(categoryInput.toLowerCase()))
                  .map(c => (
                    <li
                      key={c.category}
                      className="bulk-edit__suggestion"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addCategory(c.category);
                      }}
                    >
                      {c.category}
                    </li>
                  ))}
              </ul>
            )}
          </div>
          {categories.length > 0 && (
            <div className="bulk-edit__chips">
              {categories.map(cat => (
                <span key={cat} className="bulk-edit__chip">
                  {cat}
                  <button type="button" className="bulk-edit__chip-remove" onClick={() => removeCategory(cat)} aria-label={`Quitar ${cat}`}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bulk-edit__row">
          <label className="bulk-edit__field">
            <span className="bulk-edit__label">Fecha</span>
            <input className="bulk-edit__input" type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
          </label>
          <label className="bulk-edit__field">
            <span className="bulk-edit__label">Lugar</span>
            <input className="bulk-edit__input" type="text" value={localization} onChange={e => setLocalization(e.target.value)} placeholder="No cambiar" />
          </label>
        </div>

        <div className="bulk-edit__field">
          <span className="bulk-edit__label" id="bulk-edit-payers">Pagado por</span>
          <MemberToggleGroup options={memberOptions} selected={paidByIds} onChange={setPaidByIds} labelledBy="bulk-edit-payers" />
        </div>

        <div className="bulk-edit__field">
          <span className="bulk-edit__label" id="bulk-edit-participants">Participantes</span>
          <MemberToggleGroup options={memberOptions} selected={participants} onChange={setParticipants} labelledBy="bulk-edit-participants" showBulkActions />
        </div>

        <div className="bulk-edit__row">
          <label className="bulk-edit__field">
            <span className="bulk-edit__label">¿El pagador invita?</span>
            <select
              className="bulk-edit__select"
              value={assumeExpense === null ? '' : String(assumeExpense)}
              onChange={e => setAssumeExpense(e.target.value === '' ? null : e.target.value === 'true')}
            >
              <option value="">No cambiar</option>
              <option value="true">Sí</option>
              <option value="false">No</option>
            </select>
          </label>
          <label className="bulk-edit__field">
            <span className="bulk-edit__label">Mover al grupo</span>
            <select className="bulk-edit__select" value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}>
              <option value="">No cambiar</option>
              {groups.map(g => (
                <option key={g._id} value={g._id}>{g.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          className="bulk-edit__submit"
          onClick={handleUpdate}
          disabled={changeCount === 0 || expenseCount === 0}
        >
          {changeCount === 0
            ? 'Rellena lo que quieras cambiar'
            : `Aplicar a ${expenseCount} ${expenseCount === 1 ? 'gasto' : 'gastos'}`}
        </button>
      </div>
    </section>
  );
};

export default BulkEditForm;
