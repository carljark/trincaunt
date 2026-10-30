
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import UserMenu from '../components/UserMenu';
import PushToggle from '../components/PushToggle';
import { ChevronLeftIcon, PencilIcon, TrashIcon } from '../components/icons';

import './PreferencesPage.scss';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

interface ICategoryAlias {
  _id: string;
  alias: string;
  mainCategories: string[];
}

interface IGroupedAliases {
  [mainCategory: string]: ICategoryAlias[];
}

const PreferencesPage: React.FC = () => {
  const { token } = useAuth();
  const [groups, setGroups] = useState<{ _id: string; nombre: string }[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [aliases, setAliases] = useState<ICategoryAlias[]>([]);
  const [groupedAliases, setGroupedAliases] = useState<IGroupedAliases>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [aliasInput, setAliasInput] = useState('');
  const [editingAlias, setEditingAlias] = useState<ICategoryAlias | null>(null);
  
  // Suggestions state
  const [showAliasSuggestions, setShowAliasSuggestions] = useState(false);
  const [showMainCatSuggestions, setShowMainCatSuggestions] = useState(false);
  const [availableAllCategories, setAvailableAllCategories] = useState<string[]>([]);

  // State for Main Categories input
  const [mainCategorySearchInput, setMainCategorySearchInput] = useState('');
  const [selectedMainCategories, setSelectedMainCategories] = useState<string[]>([]);

  // Effect to fetch groups
  useEffect(() => {
    const fetchGroups = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/groups`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setGroups(data.data);
        }
      } catch (err) {
        console.error('Error fetching groups:', err);
      }
    };
    fetchGroups();
  }, [token]);

  // Effect to group aliases whenever the 'aliases' state changes
  useEffect(() => {
    const newGroupedAliases: IGroupedAliases = {};
    aliases.forEach(alias => {
      alias.mainCategories.forEach(mainCat => {
        if (!newGroupedAliases[mainCat]) {
          newGroupedAliases[mainCat] = [];
        }
        newGroupedAliases[mainCat].push(alias);
      });
    });
    const sortedMainCategories = Object.keys(newGroupedAliases).sort();
    const sortedGroupedAliases: IGroupedAliases = {};
    sortedMainCategories.forEach(mainCat => {
      sortedGroupedAliases[mainCat] = newGroupedAliases[mainCat].sort((a, b) => a.alias.localeCompare(b.alias));
    });
    setGroupedAliases(sortedGroupedAliases);
  }, [aliases]);

  // Effect to fetch all possible categories for suggestions
  useEffect(() => {
    const fetchAllPossibleCategories = async () => {
      if (!token || !selectedGroupId) return;
      try {
        const [expenseCatsRes, aliasRes] = await Promise.all([
          fetch(`${apiHost}${apiBaseUrl}/expenses/categories?groupId=${selectedGroupId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${apiHost}${apiBaseUrl}/category-aliases?groupId=${selectedGroupId}`, { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);

        const allUniqueCategories = new Set<string>();

        if (expenseCatsRes.ok) {
          const expenseCategoriesData = await expenseCatsRes.json();
          if (Array.isArray(expenseCategoriesData.data)) {
            expenseCategoriesData.data.forEach((cat: { category: string }) => {
                if (cat && typeof cat.category === 'string') {
                    allUniqueCategories.add(cat.category);
                }
            });
          }
        }

        if (aliasRes.ok) {
          const aliasesData = await aliasRes.json();
          if (Array.isArray(aliasesData.data)) {
            aliasesData.data.forEach((alias: ICategoryAlias) => {
                if (alias && Array.isArray(alias.mainCategories)) {
                    alias.mainCategories.forEach(mainCat => {
                        if (typeof mainCat === 'string') {
                            allUniqueCategories.add(mainCat);
                        }
                    });
                }
                if (alias && typeof alias.alias === 'string') {
                    allUniqueCategories.add(alias.alias);
                }
            });
          }
        }
        setAvailableAllCategories(Array.from(allUniqueCategories).sort());
      } catch (err) {
        console.error('Error fetching all possible categories:', err);
      }
    };
    fetchAllPossibleCategories();
  }, [token, selectedGroupId]);


  const fetchAliases = async () => {
    if (!token || !selectedGroupId) {
      setAliases([]);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`${apiHost}${apiBaseUrl}/category-aliases?groupId=${selectedGroupId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAliases(data.data);
      } else {
        throw new Error('No se pudieron cargar los alias');
      }
    } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('Ha ocurrido un error inesperado');
        }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAliases();
    resetForm();
  }, [token, selectedGroupId]);

  // Handlers
  const handleSelectAliasSuggestion = (category: string) => {
    setAliasInput(category);
  };

  const handleAddMainCategory = (category: string) => {
    if (category && !selectedMainCategories.includes(category)) {
      setSelectedMainCategories([...selectedMainCategories, category]);
    }
    setMainCategorySearchInput('');
  };

  const handleRemoveMainCategory = (categoryToRemove: string) => {
    setSelectedMainCategories(selectedMainCategories.filter(cat => cat !== categoryToRemove));
  };

  const handleMainCategoryInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && mainCategorySearchInput.trim() !== '') {
      e.preventDefault();
      handleAddMainCategory(mainCategorySearchInput.trim());
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroupId) {
      setError('Elige primero un grupo.');
      return;
    }
    if (!aliasInput || selectedMainCategories.length === 0) {
      setError('Indica el alias y al menos una categoría principal.');
      return;
    }
    const mainCategories = selectedMainCategories;

    const url = editingAlias
      ? `${apiHost}${apiBaseUrl}/category-aliases/${editingAlias._id}`
      : `${apiHost}${apiBaseUrl}/category-aliases`;
    const method = editingAlias ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ alias: aliasInput, mainCategories, grupo_id: selectedGroupId }),
      });

      if (res.ok || res.status === 201) {
        await fetchAliases();
        resetForm();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'No se pudo guardar el alias');
      }
    } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('Ha ocurrido un error inesperado');
        }
    }
  };

  const handleEdit = (alias: ICategoryAlias) => {
    setEditingAlias(alias);
    setAliasInput(alias.alias);
    setSelectedMainCategories(alias.mainCategories);
    setError(null);
  };

  const handleDelete = async (aliasId: string) => {
    if (!window.confirm('¿Seguro que quieres borrar este alias?')) return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/category-aliases/${aliasId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok || res.status === 204) {
        await fetchAliases();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'No se pudo borrar el alias');
      }
    } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('Ha ocurrido un error inesperado');
        }
    }
  };

  const resetForm = () => {
    setEditingAlias(null);
    setAliasInput('');
    setSelectedMainCategories([]);
    setMainCategorySearchInput('');
    setError(null);
  };

  const selectedGroupName = groups.find(g => g._id === selectedGroupId)?.nombre;

  return (
    <div className="preferences">
      <UserMenu />
      <header className="preferences__header">
        <Link to="/" className="preferences__back" aria-label="Volver al inicio" title="Volver al inicio">
          <ChevronLeftIcon />
        </Link>
        <h1 className="preferences__heading">Preferencias</h1>
      </header>

      <section className="preferences__section">
        <h2 className="preferences__section-title">Notificaciones</h2>
        <PushToggle />
      </section>

      <section className="preferences__section">
        <h2 className="preferences__section-title">Alias de categorías</h2>
        <div className="preferences__card">
          <p className="preferences__hint">
            Al filtrar por una categoría principal, en la lista de gastos o en el gráfico, se incluyen también sus alias.
            Por ejemplo, «cervezas» y «vinos» como alias de «bebidas».
          </p>

          <label className="preferences__field">
            <span className="preferences__label">Grupo</span>
            <select
              className="preferences__input preferences__input--select"
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
            >
              <option value="">Elige un grupo</option>
              {groups.map(group => (
                <option key={group._id} value={group._id}>{group.nombre}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedGroupId && (
          <>
            <form onSubmit={handleFormSubmit} className="preferences__card">
              <h3 className="preferences__card-title">
                {editingAlias ? `Editar «${editingAlias.alias}»` : `Nuevo alias en ${selectedGroupName ?? 'el grupo'}`}
              </h3>

              {error && <p className="preferences__error" role="alert">{error}</p>}

              <div
                className="preferences__field preferences__field--suggest"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setShowAliasSuggestions(false);
                  }
                }}
              >
                <label htmlFor="preferences-alias" className="preferences__label">Alias (categoría concreta)</label>
                <input
                  id="preferences-alias"
                  className="preferences__input"
                  type="text"
                  placeholder="p. ej. cervezas"
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  onFocus={() => setShowAliasSuggestions(true)}
                  autoComplete="off"
                  required
                />
                {showAliasSuggestions && (
                  <ul className="preferences__suggestions">
                    {availableAllCategories
                      .filter(cat => cat.toLowerCase().includes(aliasInput.toLowerCase()) && cat !== aliasInput)
                      .map((cat) => (
                        <li
                          key={cat}
                          className="preferences__suggestion"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectAliasSuggestion(cat);
                          }}
                        >
                          {cat}
                        </li>
                      ))}
                  </ul>
                )}
              </div>

              <div
                className="preferences__field preferences__field--suggest"
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setShowMainCatSuggestions(false);
                  }
                }}
              >
                <label htmlFor="main-categories-input" className="preferences__label">Categorías principales</label>
                <input
                  id="main-categories-input"
                  className="preferences__input"
                  type="text"
                  placeholder="Escribe o elige y pulsa Intro"
                  value={mainCategorySearchInput}
                  onChange={(e) => setMainCategorySearchInput(e.target.value)}
                  onKeyDown={handleMainCategoryInputKeyDown}
                  onFocus={() => setShowMainCatSuggestions(true)}
                  autoComplete="off"
                />
                {showMainCatSuggestions && (
                  <ul className="preferences__suggestions">
                    {!availableAllCategories.includes(mainCategorySearchInput.trim()) && mainCategorySearchInput.trim() !== '' && (
                      <li
                        className="preferences__suggestion"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAddMainCategory(mainCategorySearchInput.trim());
                        }}
                      >
                        Añadir «{mainCategorySearchInput.trim()}»
                      </li>
                    )}
                    {availableAllCategories
                      .filter(cat => cat.toLowerCase().includes(mainCategorySearchInput.toLowerCase()) && !selectedMainCategories.includes(cat))
                      .map((cat) => (
                        <li
                          key={cat}
                          className="preferences__suggestion"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleAddMainCategory(cat);
                          }}
                        >
                          {cat}
                        </li>
                      ))}
                  </ul>
                )}
                {selectedMainCategories.length > 0 && (
                  <div className="preferences__chips">
                    {selectedMainCategories.map((cat) => (
                      <span key={cat} className="preferences__chip">
                        {cat}
                        <button
                          type="button"
                          className="preferences__chip-remove"
                          onClick={() => handleRemoveMainCategory(cat)}
                          aria-label={`Quitar ${cat}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="preferences__actions">
                {editingAlias && (
                  <button type="button" className="preferences__button preferences__button--secondary" onClick={resetForm}>
                    Cancelar
                  </button>
                )}
                <button type="submit" className="preferences__button preferences__button--primary">
                  {editingAlias ? 'Guardar cambios' : 'Crear alias'}
                </button>
              </div>
            </form>

            <div className="preferences__card">
              <h3 className="preferences__card-title">Alias del grupo</h3>
              {loading ? (
                <p className="preferences__hint">Cargando alias…</p>
              ) : Object.keys(groupedAliases).length === 0 ? (
                <p className="preferences__hint">Este grupo todavía no tiene alias.</p>
              ) : (
                Object.entries(groupedAliases).map(([mainCategory, aliasesInGroup]) => (
                  <div key={mainCategory} className="preferences__group">
                    <h4 className="preferences__group-title">{mainCategory}</h4>
                    <ul className="preferences__aliases">
                      {aliasesInGroup.map((alias) => (
                        <li key={alias._id} className="preferences__alias">
                          <span className="preferences__alias-name">{alias.alias}</span>
                          <button
                            type="button"
                            className="preferences__action"
                            onClick={() => handleEdit(alias)}
                            aria-label={`Editar ${alias.alias}`}
                            title="Editar"
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            className="preferences__action preferences__action--delete"
                            onClick={() => handleDelete(alias._id)}
                            aria-label={`Borrar ${alias.alias}`}
                            title="Borrar"
                          >
                            <TrashIcon />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default PreferencesPage;