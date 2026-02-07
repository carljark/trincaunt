
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';

import './PreferencesPage.scss'; // Import the SCSS file

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
  const [aliases, setAliases] = useState<ICategoryAlias[]>([]);
  const [groupedAliases, setGroupedAliases] = useState<IGroupedAliases>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [aliasInput, setAliasInput] = useState('');
  const [editingAlias, setEditingAlias] = useState<ICategoryAlias | null>(null);
  
  // Suggestions state
  const [showAliasSuggestions, setShowAliasSuggestions] = useState(false);
  const [showMainCatSuggestions, setShowMainCatSuggestions] = useState(false);
  const [availableAllCategories, setAvailableAllCategories] = useState<string[]>([]);
  
  // Input Refs
  const aliasInputRef = useRef<HTMLInputElement>(null);
  const mainCategoryInputRef = useRef<HTMLInputElement>(null);

  // State for Main Categories input
  const [mainCategorySearchInput, setMainCategorySearchInput] = useState('');
  const [selectedMainCategories, setSelectedMainCategories] = useState<string[]>([]);

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
      if (!token) return;
      try {
        const [expenseCatsRes, aliasRes] = await Promise.all([
          fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, { headers: { 'Authorization': `Bearer ${token}` } }),
          fetch(`${apiHost}${apiBaseUrl}/category-aliases`, { headers: { 'Authorization': `Bearer ${token}` } }),
        ]);

        let allUniqueCategories = new Set<string>();

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
  }, [token]);


  const fetchAliases = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const res = await fetch(`${apiHost}${apiBaseUrl}/category-aliases`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAliases(data.data);
      } else {
        throw new Error('Failed to fetch aliases');
      }
    } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('An unknown error occurred');
        }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAliases();
  }, [token]);

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
    if (!aliasInput || selectedMainCategories.length === 0) {
      setError('Alias and at least one main category are required.');
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
        body: JSON.stringify({ alias: aliasInput, mainCategories }),
      });

      if (res.ok || res.status === 201) {
        await fetchAliases();
        resetForm();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Failed to save alias');
      }
    } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('An unknown error occurred');
        }
    }
  };

  const handleEdit = (alias: ICategoryAlias) => {
    setEditingAlias(alias);
    setAliasInput(alias.alias);
    setSelectedMainCategories(alias.mainCategories);
  };

  const handleDelete = async (aliasId: string) => {
    if (!window.confirm('Are you sure you want to delete this alias?')) return;
    try {
      const res = await fetch(`${apiHost}${apiBaseUrl}/category-aliases/${aliasId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (res.ok || res.status === 204) {
        await fetchAliases();
      } else {
        const data = await res.json();
        throw new Error(data.message || 'Failed to delete alias');
      }
    } catch (err) {
        if (err instanceof Error) {
            setError(err.message);
        } else {
            setError('An unknown error occurred');
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

  if (loading) return <p>Loading preferences...</p>;

  return (
    <div className="preferences-page">
      <h2>Category Aliases</h2>
      <p>Map a specific category (alias) to one or more main categories.</p>

      {error && <p className="error-message">{error}</p>}

      <form onSubmit={handleFormSubmit} className="alias-form">
        <div className="alias-form-content">
          <div
              className="category-input-container"
              onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setShowAliasSuggestions(false);
                  }
              }}
          >
              <input
                  type="text"
                  placeholder="Specific Category (Alias)"
                  value={aliasInput}
                  onChange={(e) => setAliasInput(e.target.value)}
                  onFocus={() => setShowAliasSuggestions(true)}
                  ref={aliasInputRef}
                  required
              />
              {showAliasSuggestions && (
                  <div className="suggestions-list">
                      {availableAllCategories
                          .filter(cat => cat.toLowerCase().includes(aliasInput.toLowerCase()))
                          .map((cat) => (
                              <div key={cat} className="suggestion-item" onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleSelectAliasSuggestion(cat);
                              }}>
                                  {cat}
                              </div>
                          ))}
                  </div>
              )}
          </div>
          <div
              className="main-categories-input-group"
              onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setShowMainCatSuggestions(false);
                  }
              }}
          >
              <label htmlFor="main-categories-input">Main Categories:</label>
              <input
                  id="main-categories-input"
                  type="text"
                  placeholder="Type or select main categories"
                  value={mainCategorySearchInput}
                  onChange={(e) => setMainCategorySearchInput(e.target.value)}
                  onKeyDown={handleMainCategoryInputKeyDown}
                  onFocus={() => setShowMainCatSuggestions(true)}
                  ref={mainCategoryInputRef}
              />
              <div className="selected-main-categories">
                  {selectedMainCategories.map((cat) => (
                      <span key={cat} className="selected-tag">
                          {cat}
                          <button type="button" onClick={() => handleRemoveMainCategory(cat)}>x</button>
                      </span>
                  ))}
              </div>
              {showMainCatSuggestions && (
                  <div className="suggestions-list">
                      {!availableAllCategories.includes(mainCategorySearchInput.trim()) && mainCategorySearchInput.trim() !== '' && (
                          <div className="suggestion-item" onMouseDown={(e) => {
                              e.preventDefault();
                              handleAddMainCategory(mainCategorySearchInput.trim());
                          }}>
                              Add "{mainCategorySearchInput.trim()}"
                          </div>
                      )}
                      {availableAllCategories
                          .filter(cat => cat.toLowerCase().includes(mainCategorySearchInput.toLowerCase()) && !selectedMainCategories.includes(cat))
                          .map((cat) => (
                              <div key={cat} className="suggestion-item" onMouseDown={(e) => {
                                  e.preventDefault();
                                  handleAddMainCategory(cat);
                              }}>
                                  {cat}
                              </div>
                          ))}
                  </div>
              )}
          </div>
          <div className="form-actions">
            <button type="submit">{editingAlias ? 'Update Alias' : 'Create Alias'}</button>
            {editingAlias && <button type="button" onClick={resetForm}>Cancel Edit</button>}
          </div>
        </div>
      </form>

      <div className="aliases-list">
        <h3>Existing Aliases by Main Category</h3>
        {Object.keys(groupedAliases).length === 0 ? (
          <p>No aliases defined yet.</p>
        ) : (
          <div>
            {Object.entries(groupedAliases).map(([mainCategory, aliasesInGroup]) => (
              <div key={mainCategory} className="main-category-group">
                <h4>{mainCategory}</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Alias</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aliasesInGroup.map((alias) => (
                      <tr key={alias._id}>
                        <td>{alias.alias}</td>
                        <td className="alias-actions">
                          <button onClick={() => handleEdit(alias)}>Edit</button>
                          <button onClick={() => handleDelete(alias._id)}>Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default PreferencesPage;