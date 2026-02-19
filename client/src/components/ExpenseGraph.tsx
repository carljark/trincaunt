import React, { useState, useEffect, useCallback } from 'react';
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
}

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const ExpenseGraph: React.FC<ExpenseGraphProps> = ({ groupId, token }) => {
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [datePreset, setDatePreset] = useState<string | null>(null);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [chartData, setChartData] = useState<ChartDataItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const weekdaysMap = [
    { name: 'Dom', value: 0 },
    { name: 'Lun', value: 1 },
    { name: 'Mar', value: 2 },
    { name: 'Mié', value: 3 },
    { name: 'Jue', value: 4 },
    { name: 'Vie', value: 5 },
    { name: 'Sáb', value: 6 },
  ];

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
  }, [groupId, token, startDate, endDate, selectedWeekdays]);

  useEffect(() => {
    fetchChartData();
  }, [fetchChartData]);

  const handleWeekdayChange = (value: number, isChecked: boolean) => {
    setSelectedWeekdays(prev =>
      isChecked ? [...prev, value] : prev.filter(day => day !== value)
    );
  };

  const data = {
    labels: chartData.map(item => item.date),
    datasets: [
      {
        label: 'Gasto Total (€)',
        data: chartData.map(item => item.totalAmount),
        fill: false,
        backgroundColor: 'rgb(75, 192, 192)',
        borderColor: 'rgba(75, 192, 192, 0.2)',
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Gastos del Grupo por Día',
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
