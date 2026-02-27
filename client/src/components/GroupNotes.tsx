import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { IUser } from '../types/user';
import MultiSelect from './MultiSelect'; // Assuming this MultiSelect is updated to handle {value, label}
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

interface Option {
  value: string;
  label: string;
}

interface GroupNotesProps {
  groupId: string;
  members: IUser[]; // Group members passed from GroupDetailPage
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const GroupNotes: React.FC<GroupNotesProps> = ({ groupId, members }) => {
  const { token, user } = useAuth();
  const [notes, setNotes] = useState<INote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [isAddingNote, setIsAddingNote] = useState<boolean>(false);
  const [currentNoteId, setCurrentNoteId] = useState<string | null>(null); // For editing
  const [noteTitle, setNoteTitle] = useState<string>('');
  const [noteContent, setNoteContent] = useState<string>('');
  const [selectedReaders, setSelectedReaders] = useState<string[]>([]);
  const [selectedEditors, setSelectedEditors] = useState<string[]>([]);

  const memberOptions: Option[] = members.map(m => ({ value: m._id, label: m.nombre }));

  const fetchNotes = useCallback(async () => {
    if (!token || !groupId) return;
    setLoading(true);
    setError(null);
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
    } catch (err: any) {
      setError(err.message || 'Error de red al cargar las notas');
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
    setNoteTitle('');
    setNoteContent('');
    setSelectedReaders([]);
    setSelectedEditors([]);
  };

  const handleEditNoteClick = (note: INote) => {
    setIsAddingNote(true);
    setCurrentNoteId(note._id);
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
    if (!token || !groupId || !noteContent) return;

    setLoading(true);
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
    } catch (err: any) {
      setError(err.message || 'Error de red al guardar la nota');
      console.error('Error saving note:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!token || !globalThis.confirm('¿Estás seguro de que quieres eliminar esta nota?')) return;

    setLoading(true);
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
    } catch (err: any) {
      setError(err.message || 'Error de red al eliminar la nota');
      console.error('Error deleting note:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p>Cargando notas...</p>;
  if (error) return <p className="error-message">Error: {error}</p>;

  return (
    <div className="group-notes-container">
      <h3>Notas del Grupo</h3>

      {isAddingNote ? (
        <form onSubmit={handleSaveNote} className="note-form">
          <input
            type="text"
            placeholder="Título (opcional)"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
          />
          <textarea
            placeholder="Contenido de la nota"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            required
            rows={6}
          ></textarea>
          <div className="form-group">
            <label>Ver (vacío = solo tú):</label>
            <MultiSelect
              options={memberOptions}
              selected={selectedReaders}
              onChange={setSelectedReaders}
              placeholder="Selecciona quién puede ver..."
            />
          </div>
          <div className="form-group">
            <label>Editar (vacío = solo tú):</label>
            <MultiSelect
              options={memberOptions}
              selected={selectedEditors}
              onChange={setSelectedEditors}
              placeholder="Selecciona quién puede editar..."
            />
          </div>
          <div className="note-form-actions">
            <button type="submit" disabled={loading}>Guardar Nota</button>
            <button type="button" onClick={handleCancelEdit} disabled={loading}>Cancelar</button>
          </div>
        </form>
      ) : (
        <button onClick={handleAddNoteClick} className="add-note-button">Añadir Nueva Nota</button>
      )}

      {notes.length === 0 && !isAddingNote && <p>No hay notas en este grupo. ¡Sé el primero en añadir una!</p>}

      <ul className="notes-list">
        {notes.map(note => {
          const canEditOrDelete = note.creado_por._id === user?._id || note.editores.some(editor => editor._id === user?._id);
          return (
            <li key={note._id} className="note-item">
              <div className="note-header">
                <h4>{note.titulo || 'Sin título'}</h4>
                <div className="note-actions">
                  {canEditOrDelete && (
                    <>
                      <button onClick={() => handleEditNoteClick(note)} className="edit-btn" title="Editar">&#9998;</button>
                      <button onClick={() => handleDeleteNote(note._id)} className="delete-btn" title="Borrar">&#10006;</button>
                    </>
                  )}
                </div>
              </div>
              <p className="note-content">{note.contenido}</p>
              <div className="note-footer">
                <span className="note-meta">Creado por: {note.creado_por.nombre}</span>
                <span className="note-meta">Ver: {note.lectores.map(r => r.nombre).join(', ') || 'Solo creador'}</span>
                <span className="note-meta">Editar: {note.editores.map(e => e.nombre).join(', ') || 'Solo creador'}</span>
                <span className="note-meta">Última actualización: {new Date(note.fecha_actualizacion).toLocaleDateString()}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default GroupNotes;
