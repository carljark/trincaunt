import { arrayMove } from '@dnd-kit/sortable';

/** Devuelve la lista con `activeId` movido a la posición de `overId`, o null si no cambia nada. */
export const reorderById = <T extends { _id: string }>(items: T[], activeId: string, overId: string | null): T[] | null => {
  if (!overId || activeId === overId) return null;
  const from = items.findIndex(item => item._id === activeId);
  const to = items.findIndex(item => item._id === overId);
  if (from === -1 || to === -1) return null;
  return arrayMove(items, from, to);
};
