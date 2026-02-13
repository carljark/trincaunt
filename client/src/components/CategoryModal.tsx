import React from 'react';

interface CategoryModalProps {
  allCategories: string[];
  selectedCategories: string[];
  onChange: (selected: string[]) => void;
  onClose: () => void;
}

const CategoryModal: React.FC<CategoryModalProps> = ({ allCategories, selectedCategories, onChange, onClose }) => {
  const handleSelectAll = () => {
    onChange(allCategories);
  };

  const handleDeselectAll = () => {
    onChange([]);
  };

  const handleCategoryChange = (category: string) => {
    const newSelection = selectedCategories.includes(category)
      ? selectedCategories.filter(c => c !== category)
      : [...selectedCategories, category];
    onChange(newSelection);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <h3>Seleccionar Categorías</h3>
        <div className="modal-actions">
          <button onClick={handleSelectAll}>Todas</button>
          <button onClick={handleDeselectAll}>Ninguna</button>
        </div>
        <div className="category-list">
          {allCategories.map(category => (
            <label key={category} className="category-item">
              {category}
              <input
                type="checkbox"
                checked={selectedCategories.includes(category)}
                onChange={() => handleCategoryChange(category)}
              />
            </label>
          ))}
        </div>
        <button onClick={onClose}>Cerrar</button>
      </div>
    </div>
  );
};

export default CategoryModal;
