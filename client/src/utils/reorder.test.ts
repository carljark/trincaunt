import { describe, it, expect } from 'vitest';
import { reorderById } from './reorder';

const items = ['a', 'b', 'c'].map(_id => ({ _id }));
const ids = (list: { _id: string }[] | null) => list?.map(i => i._id);

describe('reorderById', () => {
  it('moves an item down and up', () => {
    expect(ids(reorderById(items, 'a', 'c'))).toEqual(['b', 'c', 'a']);
    expect(ids(reorderById(items, 'c', 'a'))).toEqual(['c', 'a', 'b']);
  });

  it('returns null when nothing changes', () => {
    expect(reorderById(items, 'a', 'a')).toBeNull();
    expect(reorderById(items, 'a', null)).toBeNull();
    expect(reorderById(items, 'x', 'a')).toBeNull();
  });
});
