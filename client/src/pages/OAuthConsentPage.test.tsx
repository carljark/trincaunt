import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import OAuthConsentPage from './OAuthConsentPage';

vi.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'jwt', user: { nombre: 'jarklos' } }) }));

const query = '?response_type=code&client_id=c1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&code_challenge=abc&code_challenge_method=S256&state=s';

describe('OAuthConsentPage', () => {
  const fetchMock = vi.fn();
  const assign = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    assign.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, assign } });
  });

  const renderPage = () => render(<MemoryRouter initialEntries={[`/oauth/consent${query}`]}><OAuthConsentPage /></MemoryRouter>);

  it('says who asks for access and goes back with the answer', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { cliente: 'Claude', error: null } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { redirect: 'https://claude.ai/cb?code=xyz&state=s' } }) });
    renderPage();

    expect(await screen.findByText('Claude')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toContain(`/oauth/authorize${query}`);
    fireEvent.click(screen.getByRole('button', { name: 'Permitir' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?code=xyz&state=s'));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toMatchObject({ permitir: true, params: { client_id: 'c1', state: 's', code_challenge: 'abc' } });
  });

  it('can be cancelled', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { cliente: 'Claude', error: null } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { redirect: 'https://claude.ai/cb?error=access_denied' } }) });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied'));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).permitir).toBe(false);
  });

  it('shows why a request is not valid', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ message: 'Aplicación desconocida: vuelve a añadir el conector' }) });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Aplicación desconocida');
    expect(screen.queryByRole('button', { name: 'Permitir' })).not.toBeInTheDocument();
  });
});
