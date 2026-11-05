import { IBudgetConfig, IBudgetHistory, IBudgetSummary, IIncome, IRecurringItem } from '../types/budget';

const apiHost = import.meta.env.VITE_API_HOST;
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1';

const request = async <T>(token: string, path: string, init: RequestInit = {}): Promise<T> => {
  const res = await fetch(`${apiHost}${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || 'Algo ha fallado. Inténtalo de nuevo.');
  return body.data as T;
};

const json = (method: string, data: unknown): RequestInit => ({ method, body: JSON.stringify(data) });

export type RecurringItemInput = Omit<IRecurringItem, '_id' | 'grupo_id' | 'fechaFin'> & { fechaFin?: string | null };

export const budgetApi = {
  getSummary: (token: string, groupId: string, offset = 0) =>
    request<IBudgetSummary>(token, `/groups/${groupId}/budget?offset=${offset}`),
  getHistory: (token: string, groupId: string, ciclos = 6) =>
    request<IBudgetHistory>(token, `/groups/${groupId}/budget/history?ciclos=${ciclos}`),

  listRecurringItems: (token: string, groupId: string) =>
    request<IRecurringItem[]>(token, `/groups/${groupId}/recurring-items`),
  createRecurringItem: (token: string, groupId: string, data: RecurringItemInput) =>
    request<IRecurringItem>(token, `/groups/${groupId}/recurring-items`, json('POST', data)),
  updateRecurringItem: (token: string, itemId: string, data: Partial<RecurringItemInput>) =>
    request<IRecurringItem>(token, `/recurring-items/${itemId}`, json('PUT', data)),
  deleteRecurringItem: (token: string, itemId: string) =>
    request<void>(token, `/recurring-items/${itemId}`, { method: 'DELETE' }),
  confirmRecurringItem: (token: string, itemId: string, data: { monto: number; fecha: string }) =>
    request<unknown>(token, `/recurring-items/${itemId}/confirm`, json('POST', data)),

  createIncome: (token: string, groupId: string, data: { descripcion: string; monto: number; fecha: string }) =>
    request<IIncome>(token, `/groups/${groupId}/incomes`, json('POST', data)),
  deleteIncome: (token: string, incomeId: string) =>
    request<void>(token, `/incomes/${incomeId}`, { method: 'DELETE' }),

  deleteExpense: (token: string, expenseId: string) =>
    request<void>(token, `/expenses/${expenseId}`, { method: 'DELETE' }),

  updateGroup: (token: string, groupId: string, data: { tipo?: 'compartido' | 'personal'; presupuesto?: Partial<IBudgetConfig> }) =>
    request<unknown>(token, `/groups/${groupId}`, json('PUT', data))
};
