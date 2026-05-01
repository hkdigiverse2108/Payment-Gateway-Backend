import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env') });

import mongoose from 'mongoose';
import dns from 'dns';
import { userModel } from './database/models';
import { generateHash } from './common';

const dbUrl = process.env.DB_URL || 'mongodb://localhost:27017/payment-gateway';

const seed = async () => {
    try {
        await mongoose.connect(dbUrl);
        console.log('Connected to MongoDB for seeding');

        // 1. Create Admin User
        const adminUsername = 'pramitmangukiya';
        const existingAdmin = await userModel.findOne({ userName: adminUsername });
        const password = await generateHash('Admin@123');
        if (!existingAdmin) {
            await userModel.create({
                userName: adminUsername,
                email: 'pramitmangukiya602@gmail.com',
                password: password, // Manually hashed
                role: 'admin',
                isActive: true
            });
            console.log('Admin user created: pramitmangukiya / Admin@123');
        } else {
            console.log('Admin user already exists');
        }

        // // 2. Create a Demo Client (User role)
        // const demoUsername = 'demo_client';
        // const existingUser = await userModel.findOne({ username: demoUsername });

        // if (!existingUser) {
        //     const demoPassword = await generateHash('demo_secret_456');
        //     await userModel.create({
        //         username: demoUsername,
        //         email: 'demo@partner.com',
        //         password: demoPassword, // Manually hashed
        //         role: 'user',
        //         apiKey: 'demo_api_key_123',
        //         secretKey: 'demo_secret_key_456',
        //         isActive: true
        //     });
        //     console.log('Demo client created:');
        //     console.log('Username: demo_client');
        //     console.log('API Key: demo_api_key_123');
        //     console.log('Secret Key: demo_secret_key_456');
        // } else {
        //     console.log('Demo client already exists');
        // }

        console.log('Seeding completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('Seeding failed:', error);
        process.exit(1);
    }
};

seed();
