import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExpenseGraph from './ExpenseGraph'; // Component to test
import { Line } from 'react-chartjs-2'; // Import the mocked Line component

// We will mock the entire 'react-chartjs-2' module and export a spy for Line
vi.mock('react-chartjs-2', () => ({
  Line: vi.fn(() => null),
}));

describe('ExpenseGraph', () => {
  const mockGroupId = 'test-group-id';
  const mockToken = 'test-token';
  const apiHost = import.meta.env.VITE_API_HOST || '';
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

  beforeEach(() => {
    vi.clearAllMocks();
    (Line as Mock).mockClear(); // Clear calls on our mocked Line component
    // Mock global.fetch for API calls
    global.fetch = vi.fn((url: RequestInfo | URL) => {      if (url.toString().includes(`${apiBaseUrl}/groups/${mockGroupId}/expenses/chart`)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            status: 'success',
            data: [
              { date: '2023-01-01', totalAmount: 100 },
              { date: '2023-01-02', totalAmount: 150 },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not Found' }),
      });
    }) as Mock;
  });

  it('should render loading state initially', () => {
    render(<ExpenseGraph groupId={mockGroupId} token={mockToken} />);
    expect(screen.getByText('Cargando datos del gráfico...')).toBeInTheDocument();
  });

  it('should fetch chart data on initial render', async () => {
    render(<ExpenseGraph groupId={mockGroupId} token={mockToken} />);
    expect(screen.getByText('Cargando datos del gráfico...')).toBeInTheDocument();

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `${apiHost}${apiBaseUrl}/groups/${mockGroupId}/expenses/chart?`,
        { headers: { Authorization: `Bearer ${mockToken}` } }
      );
      expect(screen.queryByText('Cargando datos del gráfico...')).not.toBeInTheDocument();
    });

    expect((Line as Mock)).toHaveBeenCalledTimes(1);
    expect((Line as Mock)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          labels: ['2023-01-01', '2023-01-02'],
          datasets: [
            expect.objectContaining({
              label: 'Gasto Total (€)',
              data: [100, 150],
            }),
          ],
        }),
      }),
      {} // options are the second argument, typically an empty object or specific options
    );
  });

  it('should update chart data when start date is changed', async () => {
    render(<ExpenseGraph groupId={mockGroupId} token={mockToken} />);

    await waitFor(() => {
      expect(screen.queryByText('Cargando datos del gráfico...')).not.toBeInTheDocument();
    });
    
    const startDateInput = screen.getByLabelText(/Desde:/);
    fireEvent.change(startDateInput, { target: { value: '2023-01-01' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `${apiHost}${apiBaseUrl}/groups/${mockGroupId}/expenses/chart?startDate=2023-01-01&`,
        { headers: { Authorization: `Bearer ${mockToken}` } }
      );
    });

    expect((Line as Mock)).toHaveBeenCalled(); // Ensure Line was called with updated data
  });

  it('should update chart data when end date is changed', async () => {
    render(<ExpenseGraph groupId={mockGroupId} token={mockToken} />);

    await waitFor(() => {
      expect(screen.queryByText('Cargando datos del gráfico...')).not.toBeInTheDocument();
    });
    
    const endDateInput = screen.getByLabelText(/Hasta:/);
    fireEvent.change(endDateInput, { target: { value: '2023-01-31' } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `${apiHost}${apiBaseUrl}/groups/${mockGroupId}/expenses/chart?endDate=2023-01-31&`,
        { headers: { Authorization: `Bearer ${mockToken}` } }
      );
    });
    expect((Line as Mock)).toHaveBeenCalled();
  });

  it('should update chart data when a weekday is selected', async () => {
    render(<ExpenseGraph groupId={mockGroupId} token={mockToken} />);

    await waitFor(() => {
      expect(screen.queryByText('Cargando datos del gráfico...')).not.toBeInTheDocument();
    });

    const mondayCheckbox = screen.getByLabelText('Lun');
    fireEvent.click(mondayCheckbox); // Select Monday

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `${apiHost}${apiBaseUrl}/groups/${mockGroupId}/expenses/chart?weekdays=1&`,
        { headers: { Authorization: `Bearer ${mockToken}` } }
      );
    });
    expect((Line as Mock)).toHaveBeenCalled();
  });

  it('should update chart data when multiple weekdays are selected', async () => {
    render(<ExpenseGraph groupId={mockGroupId} token={mockToken} />);

    await waitFor(() => {
      expect(screen.queryByText('Cargando datos del gráfico...')).not.toBeInTheDocument();
    });

    const mondayCheckbox = screen.getByLabelText('Lun');
    const tuesdayCheckbox = screen.getByLabelText('Mar');
    fireEvent.click(mondayCheckbox);
    fireEvent.click(tuesdayCheckbox);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        `${apiHost}${apiBaseUrl}/groups/${mockGroupId}/expenses/chart?weekdays=1,2&`,
        { headers: { Authorization: `Bearer ${mockToken}` } }
      );
    });
    expect((Line as Mock)).toHaveBeenCalled();
  });

  it('should show an error message if fetch fails', async () => {
    // Mock fetch to return an error
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ message: 'Failed to load chart data' }),
      })
    ) as Mock;

    render(<ExpenseGraph groupId={mockGroupId} token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText('Error: Failed to load chart data')).toBeInTheDocument();
    });
    expect((Line as Mock)).not.toHaveBeenCalled(); // No chart should be rendered on error
  });

  it('should display "No hay datos disponibles" if chartData is empty', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: 'success', data: [] }),
      })
    ) as Mock;

    render(<ExpenseGraph groupId={mockGroupId} token={mockToken} />);

    await waitFor(() => {
      expect(screen.getByText('No hay datos disponibles para el rango de fechas y filtros seleccionados.')).toBeInTheDocument();
    });
    expect((Line as Mock)).not.toHaveBeenCalled(); // No chart should be rendered if no data
  });
});