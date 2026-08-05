import { Request, Response } from 'express';
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
