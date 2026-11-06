// Sustituto en los tests de 'virtual:pwa-register/react', que solo existe con vite-plugin-pwa
// (vite.config.ts). Los tests que lo necesitan lo mockean con vi.mock.
export const useRegisterSW = () => ({
  needRefresh: [false, () => {}],
  offlineReady: [false, () => {}],
  updateServiceWorker: async () => {}
});
