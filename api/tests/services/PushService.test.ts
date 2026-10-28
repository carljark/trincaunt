import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import webpush from 'web-push';
import PushSubscription from '../../src/models/PushSubscription';
import Group from '../../src/models/Group';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn()
  }
}));

vi.mock('../../src/models/PushSubscription', () => ({
  default: {
    find: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn()
  }
}));

vi.mock('../../src/models/Group', () => ({
  default: {
    findById: vi.fn()
  }
}));

const sub = (id: string, endpoint: string) => ({ _id: id, endpoint, keys: { p256dh: 'p', auth: 'a' } });

// El servicio es un singleton que recuerda si ya configuró VAPID: se reimporta en cada test
const loadService = async () => (await import('../../src/services/PushService')).default;

describe('PushService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = 'public-key';
    process.env.VAPID_PRIVATE_KEY = 'private-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('no envía nada si faltan las claves VAPID', async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    const PushService = await loadService();

    await PushService.notifyUsers(['u1'], { title: 't', body: 'b' });

    expect(PushSubscription.find).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  it('envía el payload a cada suscripción de los usuarios', async () => {
    vi.mocked(PushSubscription.find).mockResolvedValue([sub('s1', 'https://push/1'), sub('s2', 'https://push/2')] as any);
    vi.mocked(webpush.sendNotification).mockResolvedValue({} as any);
    const PushService = await loadService();

    await PushService.notifyUsers(['u1', 'u2'], { title: 'Hola', body: 'Mundo', url: '/group/g1' });

    expect(PushSubscription.find).toHaveBeenCalledWith({ user: { $in: ['u1', 'u2'] } });
    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(webpush.sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://push/1', keys: { p256dh: 'p', auth: 'a' } },
      JSON.stringify({ title: 'Hola', body: 'Mundo', url: '/group/g1' }),
      expect.any(Object)
    );
  });

  it('borra las suscripciones caducadas (410) y no lanza', async () => {
    vi.mocked(PushSubscription.find).mockResolvedValue([sub('s1', 'https://push/1')] as any);
    vi.mocked(webpush.sendNotification).mockRejectedValue(Object.assign(new Error('Gone'), { statusCode: 410 }));
    const PushService = await loadService();

    await expect(PushService.notifyUsers(['u1'], { title: 't', body: 'b' })).resolves.toBeUndefined();
    expect(PushSubscription.deleteOne).toHaveBeenCalledWith({ _id: 's1' });
  });

  it('avisa a los miembros del grupo salvo a quien hizo el cambio', async () => {
    vi.mocked(Group.findById).mockReturnValue({
      select: vi.fn().mockResolvedValue({ nombre: 'Viaje', miembros: ['u1', 'u2', 'u3'] })
    } as any);
    vi.mocked(PushSubscription.find).mockResolvedValue([] as any);
    const PushService = await loadService();

    await PushService.notifyGroupMembers('g1', 'u2', (name) => ({ title: `Nuevo gasto en ${name}`, body: 'b' }));

    expect(PushSubscription.find).toHaveBeenCalledWith({ user: { $in: ['u1', 'u3'] } });
  });

  it('rechaza suscripciones sin claves', async () => {
    const PushService = await loadService();
    await expect(PushService.subscribe('u1', { endpoint: 'https://push/1' })).rejects.toMatchObject({ statusCode: 400 });
    expect(PushSubscription.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('guarda o reasigna la suscripción por endpoint', async () => {
    const PushService = await loadService();
    await PushService.subscribe('u1', { endpoint: 'https://push/1', keys: { p256dh: 'p', auth: 'a' } });
    expect(PushSubscription.findOneAndUpdate).toHaveBeenCalledWith(
      { endpoint: 'https://push/1' },
      { user: 'u1', endpoint: 'https://push/1', keys: { p256dh: 'p', auth: 'a' } },
      expect.objectContaining({ upsert: true })
    );
  });
});
