import React, { useState, useEffect, useCallback } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
  type TooltipItem,
} from 'chart.js';
import { FilterIcon } from './icons';
import './ExpenseGraph.scss';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
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

const PRESETS = [
  { value: 'D', label: 'Hoy' },
  { value: 'S', label: 'Semana' },
  { value: 'M', label: 'Mes' },
  { value: 'A', label: 'Año' }
];

const WEEKDAYS = [
  { name: 'Lun', value: 1 },
  { name: 'Mar', value: 2 },
  { name: 'Mié', value: 3 },
  { name: 'Jue', value: 4 },
  { name: 'Vie', value: 5 },
  { name: 'Sáb', value: 6 },
  { name: 'Dom', value: 0 },
];

// Paleta categórica validada (daltonismo y contraste), en orden fijo; el primer color es el
// azul de la app. Cada categoría conserva su color mientras siga seleccionada, y no se
// generan colores nuevos: por eso se admiten como mucho tantas categorías como colores.
const SERIES_COLORS = ['#4361ee', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const TEXT_MUTED = '#6c757d';
const GRID_COLOR = '#e9ecef';

const formatEuros = (amount: number) =>
  amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

// YYYY-MM-DD en hora local (toISOString usa UTC y de madrugada daría el día anterior)
const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const parseDay = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const formatShortDay = (day: string) =>
  parseDay(day).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

const formatLongDay = (day: string) =>
  parseDay(day).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

const ExpenseGraph: React.FC<ExpenseGraphProps> = ({ groupId, token }) => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string | null>(null);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [categoryInput, setCategoryInput] = useState('');
  const [suggestedCategories, setSuggestedCategories] = useState<{ category: string, count: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [localizationFilter, setLocalizationFilter] = useState<string>('');

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await fetch(`${apiHost}${apiBaseUrl}/expenses/categories`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data)) {
            const validCategories = data.data.filter((item: { category?: unknown }) => item && typeof item.category === 'string');
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
    setStartDate(toDateInput(fromDate));
    setEndDate(toDateInput(toDate));
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
      if (localizationFilter) url += `localization=${localizationFilter}&`;

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
  }, [groupId, token, startDate, endDate, selectedWeekdays, selectedCategories, localizationFilter]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  const toggleWeekday = (value: number) => {
    setSelectedWeekdays(prev =>
      prev.includes(value) ? prev.filter(day => day !== value) : [...prev, value]
    );
  };

  const handleCategoryKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && categoryInput.trim() !== '') {
      e.preventDefault();
      addCategory(categoryInput.trim());
    }
  };

  const canAddCategory = selectedCategories.length < SERIES_COLORS.length;

  const addCategory = (categoryToAdd: string) => {
    if (!selectedCategories.includes(categoryToAdd) && canAddCategory) {
      const used = new Set(selectedCategories.map(cat => categoryColors[cat]));
      const color = SERIES_COLORS.find(c => !used.has(c)) ?? SERIES_COLORS[0];
      setCategoryColors(prev => ({ ...prev, [categoryToAdd]: color }));
      setSelectedCategories([...selectedCategories, categoryToAdd]);
    }
    setCategoryInput('');
    setShowSuggestions(false);
  };

  const removeCategory = (categoryToRemove: string) => {
    setSelectedCategories(selectedCategories.filter(cat => cat !== categoryToRemove));
  };

  const clearFilters = () => {
    setDatePreset(null);
    setStartDate('');
    setEndDate('');
    setSelectedWeekdays([]);
    setSelectedCategories([]);
    setLocalizationFilter('');
  };

  const advancedFilterCount =
    (!datePreset && (startDate || endDate) ? 1 : 0) +
    (selectedCategories.length > 0 ? 1 : 0) +
    (localizationFilter ? 1 : 0) +
    (selectedWeekdays.length > 0 ? 1 : 0);
  const hasFilters = advancedFilterCount > 0 || !!datePreset;

  const dates = [...new Set(chartData.map(item => item.date))].sort();

  // Sin categorías: una serie con el total diario. Con categorías: una serie por categoría.
  const data = selectedCategories.length === 0
    ? {
        labels: dates,
        datasets: [
          {
            label: 'Gasto Total (€)',
            data: dates.map(date => {
              const item = chartData.find(d => d.date === date);
              return item ? item.totalAmount : 0;
            }),
            fill: true,
            backgroundColor: 'rgba(67, 97, 238, 0.08)',
            borderColor: SERIES_COLORS[0],
            pointBackgroundColor: SERIES_COLORS[0],
          },
        ],
      }
    : {
        labels: dates,
        datasets: selectedCategories.map(cat => {
          const color = categoryColors[cat] ?? SERIES_COLORS[0];
          return {
            label: cat,
            data: dates.map(date => {
              const item = chartData.find(d => d.date === date && d.category === cat);
              return item ? item.totalAmount : 0;
            }),
            fill: false,
            backgroundColor: color,
            borderColor: color,
            pointBackgroundColor: color,
          };
        }),
      };

  const totalFilteredAmount = chartData.reduce((sum, item) => sum + item.totalAmount, 0);
  const averagePerDay = dates.length > 0 ? totalFilteredAmount / dates.length : 0;
  const showPoints = dates.length <= 31;

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    font: { family: "'Inter', system-ui, -apple-system, sans-serif" },
    elements: {
      // monotone: la curva no se sale por debajo de 0 entre días sin gasto
      line: { borderWidth: 2, cubicInterpolationMode: 'monotone' },
      point: {
        radius: showPoints ? 4 : 0,
        hoverRadius: 5,
        borderWidth: 2,
        borderColor: '#fff',
      },
    },
    plugins: {
      // Una sola serie no necesita leyenda: la tarjeta ya dice qué es
      legend: {
        display: data.datasets.length > 1,
        position: 'bottom',
        labels: { usePointStyle: true, boxWidth: 8, boxHeight: 8, color: '#495057', padding: 16 },
      },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'line'>[]) => (items[0] ? formatLongDay(String(items[0].label)) : ''),
          label: (item: TooltipItem<'line'>) =>
            data.datasets.length > 1
              ? `${item.dataset.label}: ${formatEuros(item.parsed.y ?? 0)}`
              : formatEuros(item.parsed.y ?? 0),
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { color: GRID_COLOR },
        ticks: {
          color: TEXT_MUTED,
          maxRotation: 0,
          autoSkip: true,
          maxTicksLimit: 5,
          callback: function (value) {
            return formatShortDay(String(this.getLabelForValue(Number(value))));
          },
        },
      },
      y: {
        beginAtZero: true,
        grid: { color: GRID_COLOR },
        border: { display: false },
        ticks: {
          color: TEXT_MUTED,
          maxTicksLimit: 5,
          callback: (value) => `${Number(value).toLocaleString('es-ES')} €`,
        },
      },
    },
  };

  const periodLabel = datePreset
    ? PRESETS.find(p => p.value === datePreset)?.label
    : startDate || endDate
      ? `${startDate ? formatShortDay(startDate) : '…'} – ${endDate ? formatShortDay(endDate) : 'hoy'}`
      : 'Todo el historial';

  return (
    <div className="expense-graph">
      <div className="expense-graph__toolbar">
        {/* Pulsar el periodo activo lo desactiva */}
        <div className="expense-graph__presets" role="group" aria-label="Periodo">
          {PRESETS.map(p => (
            <button
              key={p.value}
              type="button"
              className={`expense-graph__preset ${datePreset === p.value ? 'expense-graph__preset--active' : ''}`}
              aria-pressed={datePreset === p.value}
              onClick={() => handleDatePreset(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`expense-graph__filters-toggle ${advancedFilterCount > 0 ? 'expense-graph__filters-toggle--active' : ''} ${showFilters ? 'expense-graph__filters-toggle--open' : ''}`}
          onClick={() => setShowFilters(open => !open)}
          aria-expanded={showFilters}
          aria-controls="expense-graph-filters"
          aria-label={advancedFilterCount > 0 ? 'Más filtros (activos)' : 'Más filtros'}
          title="Más filtros"
        >
          <FilterIcon />
        </button>
      </div>

      {showFilters && (
        <section id="expense-graph-filters" className="expense-graph__card">
          <div className="expense-graph__card-header">
            <h3 className="expense-graph__title">Filtros</h3>
            {hasFilters && (
              <button type="button" className="expense-graph__clear" onClick={clearFilters}>
                Limpiar
              </button>
            )}
          </div>

          <div className="expense-graph__dates">
            <label className="expense-graph__field">
              <span className="expense-graph__label">Desde</span>
              <input
                className="expense-graph__input"
                type="date"
                value={startDate}
                disabled={!!datePreset}
                onChange={e => setStartDate(e.target.value)}
              />
            </label>
            <label className="expense-graph__field">
              <span className="expense-graph__label">Hasta</span>
              <input
                className="expense-graph__input"
                type="date"
                value={endDate}
                disabled={!!datePreset}
                onChange={e => setEndDate(e.target.value)}
              />
            </label>
          </div>
          {datePreset && (
            <p className="expense-graph__hint">Quita el periodo de arriba para elegir fechas.</p>
          )}

          <div
            className="expense-graph__field expense-graph__field--categories"
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setShowSuggestions(false);
              }
            }}
          >
            <label htmlFor="expense-graph-category" className="expense-graph__label">Categorías</label>
            <input
              id="expense-graph-category"
              className="expense-graph__input"
              type="text"
              placeholder={canAddCategory ? 'Añadir categoría…' : `Máximo ${SERIES_COLORS.length} categorías`}
              value={categoryInput}
              disabled={!canAddCategory}
              onChange={e => setCategoryInput(e.target.value)}
              onKeyDown={handleCategoryKeyDown}
              onFocus={() => setShowSuggestions(true)}
              autoComplete="off"
            />
            {showSuggestions && (
              <ul className="expense-graph__suggestions">
                {categoryInput.trim() !== '' && !selectedCategories.includes(categoryInput.trim()) && (
                  <li
                    className="expense-graph__suggestion"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addCategory(categoryInput.trim());
                    }}
                  >
                    Añadir &quot;{categoryInput.trim()}&quot;
                  </li>
                )}
                {suggestedCategories
                  .filter(c => !selectedCategories.includes(c.category))
                  .filter(c => c.category.toLowerCase().includes(categoryInput.toLowerCase()))
                  .map(c => (
                    <li
                      key={c.category}
                      className="expense-graph__suggestion"
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
            {selectedCategories.length > 0 && (
              <div className="expense-graph__chips">
                {selectedCategories.map(cat => (
                  <span key={cat} className="expense-graph__chip">
                    <span className="expense-graph__swatch" style={{ background: categoryColors[cat] }} aria-hidden="true" />
                    {cat}
                    <button
                      type="button"
                      className="expense-graph__chip-remove"
                      onClick={() => removeCategory(cat)}
                      aria-label={`Quitar ${cat}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <label className="expense-graph__field">
            <span className="expense-graph__label">Lugar</span>
            <input
              className="expense-graph__input"
              type="text"
              placeholder="Filtrar por lugar…"
              value={localizationFilter}
              onChange={e => setLocalizationFilter(e.target.value)}
            />
          </label>

          <div className="expense-graph__field">
            <span className="expense-graph__label" id="expense-graph-weekdays">Días de la semana</span>
            <div className="expense-graph__weekdays" role="group" aria-labelledby="expense-graph-weekdays">
              {WEEKDAYS.map(day => (
                <button
                  key={day.value}
                  type="button"
                  className={`expense-graph__weekday ${selectedWeekdays.includes(day.value) ? 'expense-graph__weekday--active' : ''}`}
                  aria-pressed={selectedWeekdays.includes(day.value)}
                  onClick={() => toggleWeekday(day.value)}
                >
                  {day.name}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="expense-graph__card">
        {loading && <div className="expense-graph__status">Cargando datos del gráfico...</div>}
        {error && <p className="expense-graph__status expense-graph__status--error">Error: {error}</p>}
        {!loading && !error && chartData.length === 0 && (
          <div className="expense-graph__status">No hay datos disponibles para el rango de fechas y filtros seleccionados.</div>
        )}
        {!loading && !error && chartData.length > 0 && (
          <>
            <div className="expense-graph__summary">
              <span className="expense-graph__summary-label">
                {selectedCategories.length > 0 ? 'Gasto en las categorías' : 'Gasto del grupo'} · {periodLabel}
              </span>
              <span className="expense-graph__total">{formatEuros(totalFilteredAmount)}</span>
              <span className="expense-graph__summary-meta">
                {dates.length} {dates.length === 1 ? 'día' : 'días'} con gastos · media {formatEuros(averagePerDay)}/día
              </span>
            </div>
            <div className="expense-graph__chart">
              <Line data={data} options={options} />
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default ExpenseGraph;

