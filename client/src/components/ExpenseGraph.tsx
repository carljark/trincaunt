import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface ExpenseGraphProps {
  groupId: string;
  token: string;
}

interface ChartDataItem {
  date: string;
  totalAmount: number;
  category?: string;
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const ExpenseGraph: React.FC<ExpenseGraphProps> = ({ groupId, token }) => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string | null>(null);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState('');
  const [suggestedCategories, setSuggestedCategories] = useState<{ category: string, count: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const categoryInputRef = useRef<HTMLInputElement>(null);

  const weekdaysMap = [
    { name: 'Dom', value: 0 },
    { name: 'Lun', value: 1 },
    { name: 'Mar', value: 2 },
    { name: 'Mié', value: 3 },
    { name: 'Jue', value: 4 },
    { name: 'Vie', value: 5 },
    { name: 'Sáb', value: 6 },
  ];

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            const validCategories = data.data.filter((item: any) => item && typeof item.category === 'string');
            setSuggestedCategories(validCategories);
          }
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, [token]);

  const handleDatePreset = (preset: string) => {
    if (datePreset === preset) {
      setDatePreset(null);
      setStartDate('');
      setEndDate('');
      return;
    }

    const today = new Date();
    let fromDate: Date;
    const toDate: Date = new Date();

    switch (preset) {
      case 'D': // Today
        fromDate = new Date(today);
        break;
      case 'S': // This week
        {
          const firstDayOfWeek = new Date(today);
          const day = today.getDay();
          const diff = today.getDate() - day + (day === 0 ? -6 : 1);
          firstDayOfWeek.setDate(diff);
          fromDate = firstDayOfWeek;
        }
        break;
      case 'M': // This month
        fromDate = new Date(today.getFullYear(), today.getMonth(), 1);
        break;
      case 'A': // This year
        fromDate = new Date(today.getFullYear(), 0, 1);
        break;
      default:
        return;
    }

    setDatePreset(preset);
    setStartDate(fromDate.toISOString().split('T')[0]);
    setEndDate(toDate.toISOString().split('T')[0]);
  };

  const fetchChartData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let url = `${apiHost}${apiBaseUrl}/groups/${groupId}/expenses/chart?`;
      if (startDate) url += `startDate=${startDate}&`;
      if (endDate) url += `endDate=${endDate}&`;
      if (selectedWeekdays.length > 0) url += `weekdays=${selectedWeekdays.join(',')}&`;
      if (selectedCategories.length > 0) url += `categories=${selectedCategories.join(',')}&`;

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || 'Failed to fetch chart data');
      }

      const data = await res.json();
      setChartData(data.data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred while fetching chart data.');
      }
    } finally {
      setLoading(false);
    }
  }, [groupId, token, startDate, endDate, selectedWeekdays, selectedCategories]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  const handleWeekdayChange = (value: number, isChecked: boolean) => {
    setSelectedWeekdays(prev =>
      isChecked ? [...prev, value] : prev.filter(day => day !== value)
    );
  };

  const handleCategoryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && categoryInput.trim() !== '') {
      e.preventDefault();
      addCategory(categoryInput.trim());
    }
  };

  const addCategory = (categoryToAdd: string) => {
    if (!selectedCategories.includes(categoryToAdd)) {
      setSelectedCategories([...selectedCategories, categoryToAdd]);
    }
    setCategoryInput('');
    setShowSuggestions(false);
  };

  const removeCategory = (categoryToRemove: string) => {
    setSelectedCategories(selectedCategories.filter(cat => cat !== categoryToRemove));
  };

  // Prepare chart data
  const prepareChartData = () => {
    const dates = [...new Set(chartData.map(item => item.date))].sort();
    
    if (selectedCategories.length === 0) {
      return {
        labels: dates,
        datasets: [
          {
            label: 'Gasto Total (€)',
            data: dates.map(date => {
              const item = chartData.find(d => d.date === date);
              return item ? item.totalAmount : 0;
            }),
            fill: false,
            backgroundColor: 'rgb(75, 192, 192)',
            borderColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1,
          },
        ],
      };
    }

    // Colors for different categories
    const colors = [
      'rgb(75, 192, 192)',
      'rgb(255, 99, 132)',
      'rgb(54, 162, 235)',
      'rgb(255, 205, 86)',
      'rgb(153, 102, 255)',
      'rgb(255, 159, 64)',
      'rgb(201, 203, 207)'
    ];

    return {
      labels: dates,
      datasets: selectedCategories.map((cat, index) => {
        const color = colors[index % colors.length];
        return {
          label: cat,
          data: dates.map(date => {
            const item = chartData.find(d => d.date === date && d.category === cat);
            return item ? item.totalAmount : 0;
          }),
          fill: false,
          backgroundColor: color,
          borderColor: color,
          tension: 0.1,
        };
      }),
    };
  };

  const data = prepareChartData();

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Gastos del Grupo',
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: 'Fecha',
        },
      },
      y: {
        title: {
          display: true,
          text: 'Monto (€)',
        },
        beginAtZero: true,
      },
    },
  };

  return (
    <div className="expense-graph-container">
      <div className="filters">
        <div className="filter-group">
          <div className="date-presets-container">
            <span className="filter-label">Período:</span>
            <div className="date-presets">
              <button 
                className={`preset-btn ${datePreset === 'D' ? 'active' : ''}`}
                onClick={() => handleDatePreset('D')}
              >D</button>
              <button 
                className={`preset-btn ${datePreset === 'S' ? 'active' : ''}`}
                onClick={() => handleDatePreset('S')}
              >S</button>
              <button 
                className={`preset-btn ${datePreset === 'M' ? 'active' : ''}`}
                onClick={() => handleDatePreset('M')}
              >M</button>
              <button 
                className={`preset-btn ${datePreset === 'A' ? 'active' : ''}`}
                onClick={() => handleDatePreset('A')}
              >A</button>
            </div>
          </div>

          <div className="custom-dates">
            <label>
              Desde:
              <input 
                type="date" 
                value={startDate} 
                disabled={!!datePreset}
                onChange={e => setStartDate(e.target.value)} 
              />
            </label>
            <label>
              Hasta:
              <input 
                type="date" 
                value={endDate} 
                disabled={!!datePreset}
                onChange={e => setEndDate(e.target.value)} 
              />
            </label>
            {datePreset && (
              <button className="clear-preset" onClick={() => handleDatePreset(datePreset)}>
                Limpiar filtro
              </button>
            )}
          </div>
        </div>

        <div className="filter-group">
          <div
            className="category-container"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setShowSuggestions(false);
              }
            }}
          >
            <span className="filter-label">Categorías:</span>
            <input
              type="text"
              placeholder="Añadir categoría..."
              value={categoryInput}
              ref={categoryInputRef}
              onChange={e => setCategoryInput(e.target.value)}
              onKeyDown={handleCategoryKeyDown}
              onFocus={() => setShowSuggestions(true)}
              autoComplete="off"
            />
            {showSuggestions && (
              <ul className="suggestions-list">
                {categoryInput.trim() !== '' && !selectedCategories.includes(categoryInput.trim()) && (
                  <li onMouseDown={(e) => {
                      e.preventDefault();
                      addCategory(categoryInput.trim());
                  }}>
                    Añadir "{categoryInput.trim()}"
                  </li>
                )}
                {suggestedCategories
                  .filter(c => c.category.toLowerCase().includes(categoryInput.toLowerCase()))
                  .map(c => (
                    <li
                      key={c.category}
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
            <div className="selected-categories">
              {selectedCategories.map(cat => (
                <div key={cat} className="selected-category">
                  {cat}
                  <button type="button" onClick={() => removeCategory(cat)}>x</button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="weekday-filters">
          <span className="filter-label">Días de la semana:</span>
          <div className="weekdays-list">
            {weekdaysMap.map(day => (
              <label key={day.value} className={`weekday-checkbox ${selectedWeekdays.includes(day.value) ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  value={day.value}
                  checked={selectedWeekdays.includes(day.value)}
                  onChange={e => handleWeekdayChange(day.value, e.target.checked)}
                />
                {day.name}
              </label>
            ))}
          </div>
        </div>
      </div>
      {loading && <div className="loading-state">Cargando datos del gráfico...</div>}
      {error && <p className="error-message">Error: {error}</p>}
      {!loading && !error && chartData.length === 0 && (
        <div className="no-data">No hay datos disponibles para el rango de fechas y filtros seleccionados.</div>
      )}
      {!loading && !error && chartData.length > 0 && (
        <div className="chart-wrapper">
          <Line data={data} options={options} />
        </div>
      )}
    </div>
  );
};

export default ExpenseGraph;

