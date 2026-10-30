import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { IUser } from '../types/user';
import MemberToggleGroup from './MemberToggleGroup';
import { PencilIcon, PlusIcon, TrashIcon } from './icons';
import './GroupNotes.scss';

// Define the Note interface for the frontend
interface INote {
  _id: string;
  grupo_id: string;
  titulo?: string;
  contenido: string;
  lectores: IUser[]; // Populated user objects
  editores: IUser[]; // Populated user objects
  creado_por: IUser; // Populated user object
  fecha_creacion: string;
  fecha_actualizacion: string;
}

interface GroupNotesProps {
  groupId: string;
  members: IUser[]; // Group members passed from GroupDetailPage
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

const GroupNotes: React.FC<GroupNotesProps> = ({ groupId, members }) => {
  const { token, user } = useAuth();
  const [notes, setNotes] = useState<INote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null); // For editing
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteContent, setNoteContent] = useState<string>('');
  const [selectedReaders, setSelectedReaders] = useState<string[]>([]);
  const [selectedEditors, setSelectedEditors] = useState<string[]>([]);
  const [noteCreatorId, setNoteCreatorId] = useState<string | undefined>(undefined);

  // Quien crea la nota siempre puede verla y editarla: no se ofrece como opción
  const memberOptions = members
    .filter(m => m._id !== noteCreatorId)
    .map(m => ({ value: m._id, label: m.nombre }));

  // "Ana, Luis y tú": los demás primero y el usuario al final, en la forma que pida la frase
  const joinNames = (list: IUser[], me: string) => {
    const names = list.filter(u => u._id !== user?._id).map(u => u.nombre);
    if (list.some(u => u._id === user?._id)) names.push(me);
    return names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names.join('');
  };

  const fetchNotes = useCallback(async () => {
    if (!token || !groupId) return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/groups/${groupId}/notes`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(data.data);
      } else {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al cargar las notas');
      }
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Error de red al cargar las notas');
      console.error('Error fetching notes:', err);
    } finally {
      setLoading(false);
    }
  }, [groupId, token]);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  const handleAddNoteClick = () => {
    setIsAddingNote(true);
    setCurrentNoteId(null);
    setNoteCreatorId(user?._id);
    setNoteTitle('');
    setNoteContent('');
    setSelectedReaders([]);
    setSelectedEditors([]);
    setError(null);
  };

  const handleEditNoteClick = (note: INote) => {
    setIsAddingNote(true);
    setCurrentNoteId(note._id);
    setNoteCreatorId(note.creado_por._id);
    setError(null);
    setNoteTitle(note.titulo || '');
    setNoteContent(note.contenido);
    setSelectedReaders(note.lectores.map(r => r._id));
    setSelectedEditors(note.editores.map(e => e._id));
  };

  const handleCancelEdit = () => {
    setIsAddingNote(false);
    setCurrentNoteId(null);
    setNoteTitle('');
    setNoteContent('');
    setSelectedReaders([]);
    setSelectedEditors([]);
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !groupId || !noteContent.trim()) return;

    setSaving(true);
    setError(null);

    const payload = {
      titulo: noteTitle,
      contenido: noteContent,
      lectores: selectedReaders,
      editores: selectedEditors,
      grupo_id: groupId,
    };

    try {
      const url = currentNoteId
        ? `${apiHost}${apiBaseUrl}/notes/${currentNoteId}`
        : `${apiHost}${apiBaseUrl}/groups/${groupId}/notes`;
      const method = currentNoteId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        handleCancelEdit();
        fetchNotes();
      } else {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al guardar la nota');
      }
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Error de red al guardar la nota');
      console.error('Error saving note:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!token || !globalThis.confirm('¿Estás seguro de que quieres eliminar esta nota?')) return;

    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/notes/${noteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (res.ok) {
        fetchNotes();
      } else {
        const errData = await res.json();
        throw new Error(errData.message || 'Error al eliminar la nota');
      }
    } catch (err) {
      setError((err instanceof Error && err.message) || 'Error de red al eliminar la nota');
      console.error('Error deleting note:', err);
    } finally {
      setSaving(false);
    }
  };

  // El backend guarda a quien crea la nota como lector cuando no se elige a nadie
  const accessSummary = (note: INote) => {
    const others = (list: IUser[]) => list.filter(u => u._id !== note.creado_por._id);
    const readers = others([...note.lectores, ...note.editores.filter(e => !note.lectores.some(r => r._id === e._id))]);
    const editors = others(note.editores);
    if (readers.length === 0) {
      return note.creado_por._id === user?._id ? 'Privada: solo la ves tú' : `Privada: solo la ve ${note.creado_por.nombre}`;
    }
    const sharedWith = joinNames(readers, 'contigo');
    const parts = [sharedWith === 'contigo' ? 'Compartida contigo' : `Compartida con ${sharedWith}`];
    if (editors.length > 0) {
      const verb = editors.length > 1 ? 'pueden editarla' : editors[0]._id === user?._id ? 'puedes editarla' : 'puede editarla';
      parts.push(`${verb} ${joinNames(editors, 'tú')}`);
    }
    return parts.join(' · ');
  };

  return (
    <div className="group-notes">
      <div className="group-notes__header">
        <h2 className="group-notes__heading">Notas</h2>
        {!isAddingNote && (
          <button
            type="button"
            className="group-notes__icon-button"
            onClick={handleAddNoteClick}
            aria-label="Nueva nota"
            title="Nueva nota"
          >
            <PlusIcon />
          </button>
        )}
      </div>

      {error && <p className="group-notes__error" role="alert">{error}</p>}

      {isAddingNote && (
        <form onSubmit={handleSaveNote} className="group-notes__card group-notes__form">
          <h3 className="group-notes__title">{currentNoteId ? 'Editar nota' : 'Nueva nota'}</h3>
          <input
            className="group-notes__input"
            type="text"
            placeholder="Título (opcional)"
            aria-label="Título"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
          />
          <textarea
            className="group-notes__input group-notes__input--textarea"
            placeholder="Escribe la nota…"
            aria-label="Contenido"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            required
            rows={6}
          ></textarea>

          {memberOptions.length > 0 && (
            <>
              <div className="group-notes__field">
                <span className="group-notes__label" id="group-notes-readers">Quién puede verla</span>
                <MemberToggleGroup
                  options={memberOptions}
                  selected={selectedReaders}
                  onChange={setSelectedReaders}
                  labelledBy="group-notes-readers"
                  disabled={saving}
                />
              </div>
              <div className="group-notes__field">
                <span className="group-notes__label" id="group-notes-editors">Quién puede editarla</span>
                <MemberToggleGroup
                  options={memberOptions}
                  selected={selectedEditors}
                  onChange={setSelectedEditors}
                  labelledBy="group-notes-editors"
                  disabled={saving}
                />
              </div>
              <p className="group-notes__hint">Si no marcas a nadie, solo {noteCreatorId === user?._id ? 'tú' : 'quien la creó'}.</p>
            </>
          )}

          <div className="group-notes__actions">
            <button type="button" className="group-notes__button group-notes__button--secondary" onClick={handleCancelEdit} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="group-notes__button group-notes__button--primary" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="group-notes__status">Cargando notas...</p>
      ) : notes.length === 0 ? (
        !isAddingNote && (
          <div className="group-notes__card group-notes__empty">
            <p className="group-notes__status">Aún no hay notas en este grupo.</p>
            <button type="button" className="group-notes__button group-notes__button--primary" onClick={handleAddNoteClick}>
              Escribir la primera
            </button>
          </div>
        )
      ) : (
        <ul className="group-notes__list">
          {notes.map(note => {
            const canEditOrDelete = note.creado_por._id === user?._id || note.editores.some(editor => editor._id === user?._id);
            const title = note.titulo || 'Sin título';
            return (
              <li key={note._id} className="group-notes__card group-notes__note">
                <div className="group-notes__note-header">
                  <h3 className={`group-notes__title ${note.titulo ? '' : 'group-notes__title--untitled'}`}>{title}</h3>
                  {canEditOrDelete && (
                    <div className="group-notes__note-actions">
                      <button
                        type="button"
                        className="group-notes__action"
                        onClick={() => handleEditNoteClick(note)}
                        aria-label={`Editar ${title}`}
                        title="Editar"
                        disabled={saving}
                      >
                        <PencilIcon />
                      </button>
                      <button
                        type="button"
                        className="group-notes__action group-notes__action--delete"
                        onClick={() => handleDeleteNote(note._id)}
                        aria-label={`Borrar ${title}`}
                        title="Borrar"
                        disabled={saving}
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
                <p className="group-notes__content">{note.contenido}</p>
                <div className="group-notes__meta">
                  <span>{note.creado_por._id === user?._id ? 'Tuya' : note.creado_por.nombre} · {formatDate(note.fecha_actualizacion)}</span>
                  <span>{accessSummary(note)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default GroupNotes;
