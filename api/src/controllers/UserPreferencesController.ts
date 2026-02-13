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
        res.status(500).json({ message: 'Server error', error });
    }
};

export const savePreferences = async (req: Request, res: Response) => {
    if (!req.user) {
        return res.status(401).json({ message: 'Not authorized' });
    }
    try {
        const { filters } = req.body;
        let preferences = await UserPreferences.findOne({ userId: req.user._id });

        if (preferences) {
            preferences.filters = filters;
            await preferences.save();
        } else {
            preferences = new UserPreferences({
                userId: req.user._id,
                filters,
            });
            await preferences.save();
        }
        res.json(preferences);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};
