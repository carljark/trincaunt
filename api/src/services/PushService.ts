import webpush from 'web-push';
import PushSubscription from '../models/PushSubscription';
import Group from '../models/Group';
import { AppError } from '../utils/AppError';

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

interface SubscriptionInput {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

class PushService {
  private configured = false;

  // Igual que AiService: se lee el entorno al usarse, no al importar (dotenv aún no ha cargado)
  private configure(): boolean {
    if (this.configured) return true;
    const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false;
    webpush.setVapidDetails(VAPID_SUBJECT || 'https://trincaunt.ddns.net', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    this.configured = true;
    return true;
  }

  public getPublicKey(): string {
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) {
      throw new AppError('Las notificaciones push no están configuradas en el servidor', 503);
    }
    return key;
  }

  public async subscribe(userId: string, subscription: SubscriptionInput): Promise<void> {
    const { endpoint, keys } = subscription || {};
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      throw new AppError('Suscripción push inválida', 400);
    }
    // Si el dispositivo ya estaba suscrito con otro usuario, pasa al usuario actual
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { user: userId, endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  public async unsubscribe(userId: string, endpoint: string): Promise<void> {
    if (!endpoint) {
      throw new AppError('Falta el endpoint de la suscripción', 400);
    }
    await PushSubscription.deleteOne({ endpoint, user: userId });
  }

  // Nunca lanza: un fallo de push no debe romper la operación que lo dispara
  public async notifyUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (userIds.length === 0 || !this.configure()) return;
    try {
      const subscriptions = await PushSubscription.find({ user: { $in: userIds } });
      const body = JSON.stringify(payload);
      await Promise.all(subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, { TTL: 60 * 60 * 24 });
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          // 404/410: el navegador ha revocado la suscripción
          if (statusCode === 404 || statusCode === 410) {
            await PushSubscription.deleteOne({ _id: sub._id });
          } else {
            console.error('Error enviando notificación push:', statusCode, (error as Error).message);
          }
        }
      }));
    } catch (error) {
      console.error('Error preparando notificaciones push:', error);
    }
  }

  // Avisa a todos los miembros del grupo salvo a quien hizo el cambio
  public async notifyGroupMembers(groupId: string, excludeUserId: string, buildPayload: (groupName: string) => PushPayload): Promise<void> {
    try {
      const group = await Group.findById(groupId).select('nombre miembros');
      if (!group) return;
      const recipients = group.miembros.map(id => id.toString()).filter(id => id !== excludeUserId.toString());
      await this.notifyUsers(recipients, buildPayload(group.nombre));
    } catch (error) {
      console.error('Error buscando miembros para push:', error);
    }
  }
}

export const formatAmount = (amount: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(amount);

export default new PushService();
