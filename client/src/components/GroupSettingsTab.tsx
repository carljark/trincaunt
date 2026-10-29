import React, { useEffect, useState } from 'react';
import { IUser } from '../types/user';
import { PencilIcon, UserPlusIcon } from './icons';
import './GroupSettingsTab.scss';

interface GroupSettingsTabProps {
  groupName: string;
  members: IUser[];
  isOwner: boolean;
  // Nombre del creador, para explicar a los demás por qué no pueden renombrar
  creatorName?: string;
  onRename: (name: string) => Promise<boolean>;
  onAddMember: (email: string) => Promise<boolean>;
  onLeave: () => void;
}

const initialOf = (name: string) => name.trim().charAt(0).toUpperCase() || '?';

const GroupSettingsTab: React.FC<GroupSettingsTabProps> = ({ groupName, members, isOwner, creatorName, onRename, onAddMember, onLeave }) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(groupName);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!isEditingName) setNameInput(groupName);
  }, [groupName, isEditingName]);

  const submitName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await onRename(nameInput.trim())) setIsEditingName(false);
  };

  const submitMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await onAddMember(email.trim())) {
      setEmail('');
      setIsAddingMember(false);
    }
  };

  return (
    <div className="group-settings">
      <section className="group-settings__card">
        <div className="group-settings__header">
          <h3 className="group-settings__title">Nombre del grupo</h3>
          {isOwner && !isEditingName && (
            <button
              type="button"
              className="group-settings__icon-button"
              onClick={() => setIsEditingName(true)}
              aria-label="Editar nombre del grupo"
              title="Editar nombre"
            >
              <PencilIcon />
            </button>
          )}
        </div>
        {isEditingName ? (
          <form className="group-settings__form" onSubmit={submitName}>
            <input
              className="group-settings__input"
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              aria-label="Nombre del grupo"
              autoFocus
              required
            />
            <div className="group-settings__form-actions">
              <button type="button" className="group-settings__button group-settings__button--secondary" onClick={() => setIsEditingName(false)}>
                Cancelar
              </button>
              <button type="submit" className="group-settings__button group-settings__button--primary">Guardar</button>
            </div>
          </form>
        ) : (
          <>
            <p className="group-settings__name">{groupName}</p>
            {!isOwner && (
              <p className="group-settings__hint">
                Solo {creatorName || 'quien creó el grupo'} puede cambiar el nombre.
              </p>
            )}
          </>
        )}
      </section>

      <section className="group-settings__card">
        <div className="group-settings__header">
          <h3 className="group-settings__title">
            Miembros <span className="group-settings__count">{members.length}</span>
          </h3>
          <button
            type="button"
            className={`group-settings__icon-button ${isAddingMember ? 'group-settings__icon-button--active' : ''}`}
            onClick={() => setIsAddingMember(open => !open)}
            aria-label="Añadir miembro"
            aria-expanded={isAddingMember}
            title="Añadir miembro"
          >
            <UserPlusIcon />
          </button>
        </div>

        {isAddingMember && (
          <form className="group-settings__form" onSubmit={submitMember}>
            <input
              className="group-settings__input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="Email del usuario"
              value={email}
              onChange={e => setEmail(e.target.value)}
              aria-label="Email del nuevo miembro"
              autoFocus
              required
            />
            <div className="group-settings__form-actions">
              <button type="button" className="group-settings__button group-settings__button--secondary" onClick={() => setIsAddingMember(false)}>
                Cancelar
              </button>
              <button type="submit" className="group-settings__button group-settings__button--primary">Añadir</button>
            </div>
          </form>
        )}

        <ul className="group-settings__members">
          {members.map(m => (
            <li key={m._id} className="group-settings__member">
              <span className="group-settings__avatar" aria-hidden="true">{initialOf(m.nombre)}</span>
              <span className="group-settings__member-name">{m.nombre}</span>
            </li>
          ))}
        </ul>
      </section>

      <button type="button" className="group-settings__button group-settings__button--danger" onClick={onLeave}>
        Salir del grupo
      </button>
    </div>
  );
};

export default GroupSettingsTab;
