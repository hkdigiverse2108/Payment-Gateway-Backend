import mongoose from 'mongoose';
import express from 'express'
import dns from 'dns';
dns.setServers(["1.1.1.1", "8.8.8.8"])
const dbUrl: any = process.env.DB_URL;
const mongooseConnection = express()
mongoose.set('strictQuery', false)
mongoose.connect(
    dbUrl
).then(() => console.log('Database successfully connected')).catch(err => console.log(err));

export { mongooseConnection }