import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock HTMLCanvasElement.prototype.getContext to prevent JSDOM errors with Chart.js
// This needs to be done before Chart.js attempts to access it.
if (typeof window !== 'undefined') {
  window.HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    // Mock a minimal context object Chart.js expects
    canvas: {
      width: 0,
      height: 0,
      style: {},
    },
    scale: vi.fn(),
    clearRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    // Add other methods Chart.js might call if needed
  })) as any;
}

