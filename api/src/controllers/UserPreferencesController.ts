import { Request, Response } from 'express';
import mongoose from 'mongoose';
import UserPreferences from '../models/UserPreferences';


export const getPreferences = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
    }
    try {
        const preferences = await UserPreferences.findOne({ userId: req.user._id });
        if (!preferences) {
            return res.status(404).json({ message: 'No preferences found.' });
        }
        res.json(preferences);
    } catch (error) {
        console.error('Error getting user preferences:', error);
        res.status(500).json({ message: 'Server error', error: error instanceof Error ? error.message : error });
    }
};

export const savePreferences = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
    }
    try {
        const { filters, quickExpense } = req.body;
        if (!filters && !quickExpense) {
            return res.status(400).json({ message: 'No filters or quickExpense provided' });
        }

        const updateData: any = {};
        if (filters) updateData.filters = filters;
        if (quickExpense) updateData.quickExpense = quickExpense;

        const preferences = await UserPreferences.findOneAndUpdate(
            { userId: req.user._id },
            { $set: updateData },
            { new: true, upsert: true, runValidators: true }
        );

        res.json(preferences);
    } catch (error) {
        console.error('Error saving user preferences:', error);
        res.status(500).json({ message: 'Server error', error: error instanceof Error ? error.message : error });
    }
};

export const saveGroupOrder = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
    }
    const { groupOrder } = req.body;
    if (!Array.isArray(groupOrder) || !groupOrder.every(id => typeof id === 'string' && mongoose.isValidObjectId(id))) {
        return res.status(400).json({ message: 'groupOrder debe ser una lista de ids de grupo' });
    }
    try {
        const preferences = await UserPreferences.findOneAndUpdate(
            { userId: req.user._id },
            { $set: { groupOrder: [...new Set(groupOrder)] } },
            { new: true, upsert: true }
        );
        res.json({ groupOrder: preferences.groupOrder });
    } catch (error) {
        console.error('Error saving group order:', error);
        res.status(500).json({ message: 'Server error', error: error instanceof Error ? error.message : error });
    }
};
