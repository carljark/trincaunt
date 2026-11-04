import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { saveGroupOrder } from '../../src/controllers/UserPreferencesController';
import UserPreferences from '../../src/models/UserPreferences';

vi.mock('../../src/models/UserPreferences');

const mockRequest = (body: any, user: any = { _id: 'user-123' }) => ({ body, user }) as unknown as Request;

const mockResponse = () => {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
};

describe('UserPreferencesController.saveGroupOrder', () => {
  const g1 = new mongoose.Types.ObjectId().toString();
  const g2 = new mongoose.Types.ObjectId().toString();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves the order (without duplicates) and returns it', async () => {
    (UserPreferences.findOneAndUpdate as vi.Mock).mockResolvedValue({ groupOrder: [g2, g1] });
    const res = mockResponse();

    await saveGroupOrder(mockRequest({ groupOrder: [g2, g1, g2] }), res);

    expect(UserPreferences.findOneAndUpdate).toHaveBeenCalledWith(
      { userId: 'user-123' },
      { $set: { groupOrder: [g2, g1] } },
      { new: true, upsert: true }
    );
    expect(res.json).toHaveBeenCalledWith({ groupOrder: [g2, g1] });
  });

  it.each([
    ['missing', {}],
    ['not an array', { groupOrder: g1 }],
    ['an invalid id', { groupOrder: [g1, 'nope'] }],
  ])('rejects a body with groupOrder %s', async (_label, body) => {
    const res = mockResponse();

    await saveGroupOrder(mockRequest(body), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(UserPreferences.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('requires an authenticated user', async () => {
    const res = mockResponse();

    await saveGroupOrder(mockRequest({ groupOrder: [g1] }, null), res);

    expect(res.status).toHaveBeenCalledWith(401);
  });
});
