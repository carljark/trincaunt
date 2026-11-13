import { Request, Response, NextFunction } from 'express';
import { getIO } from '../config/socket';
import { AssistantService } from '../services/AssistantService';
import PushService, { formatAmount } from '../services/PushService';
import BudgetAlertService from '../services/BudgetAlertService';
import { AppError } from '../utils/AppError';

const assistant = new AssistantService();
const MAX_TEXT_LENGTH = 2000;

const assistantUser = (req: Request) => {
  const user = (req as any).user;
  if (user.role !== 'admin' && !user.aiEnabled) {
    throw new AppError('Acceso denegado a las funciones de IA. Contacta con el administrador.', 403);
  }
  return { id: String(user.id), nombre: String(user.nombre ?? '') };
};

/**
 * Lee un mensaje, una foto, un PDF o un audio (con un mensaje y/o una nota de voz que lo acompañen, si hay) y devuelve la respuesta del asistente y las acciones
 * que propone, SIN aplicarlas: el usuario las confirma con POST .../assistant/apply.
 */
export const askAssistant = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = assistantUser(req);
    const texto = typeof req.body?.texto === 'string' ? req.body.texto.trim() : '';
    // `media`: foto, PDF o audio; `voz`: nota de voz que acompaña al archivo
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
    const media = files.media?.[0];
    const voz = files.voz?.[0];
    if (!media && !texto) throw new AppError('Escribe un mensaje o adjunta una foto, un PDF o un audio', 400);
    if (texto.length > MAX_TEXT_LENGTH) throw new AppError(`El mensaje no puede pasar de ${MAX_TEXT_LENGTH} caracteres`, 400);

    const input = media
      ? {
        kind: 'media' as const, buffer: media.buffer, mimeType: media.mimetype,
        ...(texto && { text: texto }),
        ...(voz && { voice: { buffer: voz.buffer, mimeType: voz.mimetype } })
      }
      : { kind: 'text' as const, text: texto };
    const reply = await assistant.draft(req.params.groupId, user, input, req.body?.historial);

    // Lugar por defecto de los gastos nuevos: el que manda la app (ubicación del móvil)
    const lugar = typeof req.body?.localization === 'string' ? req.body.localization : '';
    if (lugar) {
      for (const action of reply.acciones) {
        if (action.tipo === 'crear_gasto' && action.datos && !action.datos.localization) action.datos.localization = lugar;
      }
    }
    res.status(200).json({ status: 'success', data: reply });
  } catch (error) {
    next(error);
  }
};

/** Aplica las acciones confirmadas; cada una devuelve si ha ido bien o su error. */
export const applyAssistantActions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = assistantUser(req);
    const { groupId } = req.params;
    const { resultados, gastosCreados } = await assistant.apply(groupId, user, req.body?.acciones);

    if (resultados.some(r => r.ok)) {
      getIO().to(`group_${groupId}`).emit('expenses_updated', { message: 'Cambios del asistente' });
      void BudgetAlertService.checkAfterExpenseChange([groupId]);
    }
    if (gastosCreados.length) {
      const total = gastosCreados.reduce((sum, e) => sum + Number(e.monto), 0);
      void PushService.notifyGroupMembers(groupId, user.id, groupName => ({
        title: `Nuevos gastos en ${groupName}`,
        body: gastosCreados.length === 1
          ? `${user.nombre} añadió «${gastosCreados[0].descripcion}»: ${formatAmount(total)}`
          : `${user.nombre} añadió ${gastosCreados.length} gastos (${formatAmount(total)})`,
        url: `/group/${groupId}`
      }));
    }
    res.status(200).json({ status: 'success', data: { resultados } });
  } catch (error) {
    next(error);
  }
};
