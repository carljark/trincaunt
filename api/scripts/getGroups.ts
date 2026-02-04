
import mongoose from 'mongoose';
import Group from '../src/models/Group';

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/trincaunt';

const getGroups = async () => {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('MongoDB Connected...');

        const groups = await Group.find({});
        const groupNames = groups.map(group => group.nombre);

        console.log('Found groups:');
        console.log(groupNames.join(', '));

    } catch (err) {
        console.error((err as Error).message);
    } finally {
        mongoose.disconnect();
    }
};

getGroups();
