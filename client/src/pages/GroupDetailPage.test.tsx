import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GroupDetailPage from './GroupDetailPage';
import * as AuthContext from '../contexts/AuthContext';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useParams: () => ({ groupId: 'test-group-id' }),
  useNavigate: () => vi.fn(),
}));

// Mock AddExpenseModal to capture props
let capturedPaidByInitial: string | undefined;
vi.mock('../components/AddExpenseModal', () => ({
  default: ({ paidByInitial }: { paidByInitial: string }) => {
    capturedPaidByInitial = paidByInitial;
    return <div data-testid="add-expense-modal">AddExpenseModal</div>;
  },
}));

// Mock other modals
vi.mock('../components/RecordPaymentModal', () => ({
  default: () => <div>RecordPaymentModal</div>,
}));

vi.mock('../components/PaymentHistoryModal', () => ({
  default: () => <div>PaymentHistoryModal</div>,
}));

vi.mock('../components/CategoryModal', () => ({
  default: () => <div>CategoryModal</div>,
}));

vi.mock('../components/BulkEditForm', () => ({
  default: () => <div>BulkEditForm</div>,
}));

vi.mock('../components/ConfirmationModal', () => ({
  default: () => <div>ConfirmationModal</div>,
}));

vi.mock('../components/ExpenseGraph', () => ({
  default: () => <div>ExpenseGraph</div>,
}));

vi.mock('../components/GroupNotes', () => ({
  default: () => <div>GroupNotes</div>,
}));

const mockGroupResponse = {
  data: {
    _id: 'test-group-id',
    nombre: 'Test Group',
    miembros: [
      { _id: 'user-1', nombre: 'User 1' },
      { _id: 'user-2', nombre: 'User 2' },
    ],
    creado_por: 'user-1'
  },
};

const mockExpensesResponse = {
  data: [
    { _id: '1', descripcion: 'Expense 1', monto: 10, categoria: ['Food'], fecha: '2024-01-01', pagado_por: [{ _id: 'user-1', nombre: 'User 1' }], participantes: [] },
    { _id: '2', descripcion: 'Expense 2', monto: 20, categoria: ['Leisure'], fecha: '2024-01-02', pagado_por: [{ _id: 'user-1', nombre: 'User 1' }], participantes: [] },
    { _id: '3', descripcion: 'Expense 3', monto: 30, categoria: ['Cinema'], fecha: '2024-01-03', pagado_por: [{ _id: 'user-1', nombre: 'User 1' }], participantes: [] },
  ]
};
const mockBalanceResponse = { data: { balances: [] } };
const mockSettlementResponse = { data: { transactions: [] } };
const mockDebtTransactionsResponse = { data: [] };
const mockUserPreferencesResponse = {
  filters: {
    category: ['Leisure'],
    description: '',
    dateFrom: '',
    dateTo: '',
    payer: 'all'
  }
};
const mockCategoryAliasesResponse = {
  data: [
    { alias: 'Cinema', mainCategories: ['Leisure'] }
  ]
};

const setupFetchMock = () => {
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/groups/') && url.includes('/expenses')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockExpensesResponse) });
    }
    if (url.includes('/groups/') && url.includes('/balance')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockBalanceResponse) });
    }
    if (url.includes('/groups/') && url.includes('/settle')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSettlementResponse) });
    }
    if (url.includes('/groups/') && url.includes('/debt-transactions')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockDebtTransactionsResponse) });
    }
    if (url.includes('/category-aliases')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCategoryAliasesResponse) });
    }
    if (url.includes('/user-preferences')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockUserPreferencesResponse) });
    }
    if (url.includes('/expenses/categories')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    }
    if (url.includes('/groups/')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockGroupResponse) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
};

describe('GroupDetailPage - AddExpenseModal paidByInitial prop', () => {
  beforeEach(() => {
    capturedPaidByInitial = undefined;
    setupFetchMock();
  });

  it('should pass user._id as paidByInitial when user and user._id are defined', async () => {
    const mockUser = { _id: 'user-1', nombre: 'User 1', email: 'test@test.com', fecha_registro: '2022-01-01T00:00:00.000Z' };
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      token: 'test-token',
      user: mockUser,
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    render(<GroupDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    // Open the AddExpenseModal
    const addExpenseButton = screen.getByText('Añadir gasto');
    fireEvent.click(addExpenseButton);

    await waitFor(() => {
      expect(screen.getByTestId('add-expense-modal')).toBeInTheDocument();
    });

    expect(capturedPaidByInitial).toBe('user-1');
  });

  it('should filter expenses based on category preferences including aliases', async () => {
    const mockUser = { _id: 'user-1', nombre: 'User 1', email: 'test@test.com', fecha_registro: '2022-01-01T00:00:00.000Z' };
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      token: 'test-token',
      user: mockUser,
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    render(<GroupDetailPage />);

    await waitFor(() => {
      expect(screen.getByText(/Expense 2/)).toBeInTheDocument(); // Leisure
    });

    expect(screen.getByText(/Expense 3/)).toBeInTheDocument(); // Cinema (alias of Leisure)
    expect(screen.queryByText(/Expense 1/)).not.toBeInTheDocument(); // Food
  });

  it('should pass empty string as paidByInitial when user is null', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      token: 'test-token',
      user: null,
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    render(<GroupDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    // Open the AddExpenseModal
    const addExpenseButton = screen.getByText('Añadir gasto');
    fireEvent.click(addExpenseButton);

    await waitFor(() => {
      expect(screen.getByTestId('add-expense-modal')).toBeInTheDocument();
    });

    expect(capturedPaidByInitial).toBe('');
  });

  it('should pass empty string as paidByInitial when user is defined but user._id is undefined', async () => {
    const mockUserWithoutId = { nombre: 'Test User', email: 'test@test.com', fecha_registro: '2022-01-01T00:00:00.000Z' };
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      token: 'test-token',
      // @ts-expect-error
      user: mockUserWithoutId,
      login: vi.fn(),
      logout: vi.fn(),
      isAuthenticated: true,
    });

    render(<GroupDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Test Group')).toBeInTheDocument();
    });

    // Open the AddExpenseModal
    const addExpenseButton = screen.getByText('Añadir gasto');
    fireEvent.click(addExpenseButton);

    await waitFor(() => {
      expect(screen.getByTestId('add-expense-modal')).toBeInTheDocument();
    });

    expect(capturedPaidByInitial).toBe('');
  });
});
