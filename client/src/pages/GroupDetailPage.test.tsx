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

const mockGroupResponse = {
  data: {
    _id: 'test-group-id',
    nombre: 'Test Group',
    miembros: [
      { _id: 'user-1', nombre: 'User 1' },
      { _id: 'user-2', nombre: 'User 2' },
    ],
  },
};

const mockExpensesResponse = { data: [] };
const mockBalanceResponse = { data: { balances: [] } };
const mockSettlementResponse = { data: { transactions: [] } };
const mockDebtTransactionsResponse = { data: [] };

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
    const mockUser = { _id: 'test-user-id', nombre: 'Test User' };
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

    expect(capturedPaidByInitial).toBe('test-user-id');
  });

  it('should pass empty string as paidByInitial when user is undefined', async () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      token: 'test-token',
      user: undefined,
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
    const mockUserWithoutId = { nombre: 'Test User' }; // user exists but _id is undefined
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      token: 'test-token',
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
