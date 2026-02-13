import React, { useState } from 'react';
import { IUser } from '../types/user';
import MultiSelect from './MultiSelect';
import './MultiSelect.scss';

interface BulkEditFormProps {
  members: IUser[];
  allCategories: string[];
  onBulkUpdate: (updateData: any) => void;
}

const BulkEditForm: React.FC<BulkEditFormProps> = ({ members, allCategories, onBulkUpdate }) => {
  const [categories, setCategories] = useState<string[]>([]);
  const [paidBy, setPaidBy] = useState<string>('');
  const [expenseDate, setExpenseDate] = useState<string>('');
  const [participants, setParticipants] = useState<string[]>([]);
  const [assumeExpense, setAssumeExpense] = useState<boolean | null>(null);

  const handleUpdate = () => {
    const updateData: any = {};
    if (categories.length > 0) updateData.categoria = categories;
    if (paidBy) updateData.pagado_por = paidBy;
    if (expenseDate) updateData.fecha = expenseDate;
    if (participants.length > 0) updateData.participantes = participants;
    if (assumeExpense !== null) updateData.asume_gasto = assumeExpense;

    onBulkUpdate(updateData);
  };

  const memberNames = members.map(m => m.nombre);
  const selectedParticipantNames = members.filter(m => participants.includes(m._id)).map(m => m.nombre);

  const handleParticipantChange = (selectedNames: string[]) => {
    const selectedIds = members.filter(m => selectedNames.includes(m.nombre)).map(m => m._id);
    setParticipants(selectedIds);
  };

  return (
    <div className="bulk-edit-form">
      <h4>Campos a Editar</h4>
      <div className="form-group">
        <label>Categoría</label>
        <MultiSelect
          options={allCategories}
          selected={categories}
          onChange={setCategories}
          placeholder="Añadir categorías..."
        />
      </div>
      <div className="form-group">
        <label>Pagado por</label>
        <select value={paidBy} onChange={e => setPaidBy(e.target.value)}>
          <option value="">No cambiar</option>
          {members.map(member => (
            <option key={member._id} value={member._id}>{member.nombre}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>Fecha del Gasto</label>
        <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} />
      </div>
      <div className="form-group">
        <label>Participantes</label>
        <MultiSelect
          options={memberNames}
          selected={selectedParticipantNames}
          onChange={handleParticipantChange}
          placeholder="Añadir participantes..."
        />
      </div>
      <div className="form-group">
        <label>¿El pagador invita?</label>
        <select onChange={e => setAssumeExpense(e.target.value === '' ? null : e.target.value === 'true')}>
            <option value="">No cambiar</option>
            <option value="true">Sí</option>
            <option value="false">No</option>
        </select>
      </div>
      <button onClick={handleUpdate}>Actualizar Gastos Filtrados</button>
    </div>
  );
};

export default BulkEditForm;
