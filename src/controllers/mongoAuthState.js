// src/utils/mongoAuthState.js
import Baileys from '@whiskeysockets/baileys';
import { MongoClient } from 'mongodb';
import fs from 'fs';

const { proto, initAuthCreds, BufferJSON } = Baileys;

// 🔹 Usa MONGO_URL do seu .env
const mongoUri = process.env.MONGO_URL;
const dbName = 'baileys'; // nome do banco (pode mudar se quiser)

let mongoClient;

async function connectMongo() {
    if (!mongoClient) {
        mongoClient = new MongoClient(mongoUri, { connectTimeoutMS: 20000 });
        await mongoClient.connect();
        console.log('✅ MongoDB conectado com sucesso!');
    }
    return mongoClient.db(dbName).collection('sessions');
}

export const useMongoDBAuthState = async (sessionId = 'default') => {
    const collection = await connectMongo();

    const readData = async (id) => {
        try {
            const data = await collection.findOne({ _id: id });
            return data ? JSON.parse(JSON.stringify(data), BufferJSON.reviver) : null;
        } catch (error) {
            console.error('❌ Falha ao ler dados da sessão:', error);
            return null;
        }
    };

    const writeData = async (id, data) => {
        try {
            const simplifiedData = JSON.parse(JSON.stringify(data, BufferJSON.replacer));
            await collection.replaceOne(
                { _id: id },
                { _id: id, ...simplifiedData },
                { upsert: true }
            );
        } catch (error) {
            console.error('❌ Falha ao escrever dados da sessão:', error);
        }
    };

    const removeData = async (id) => {
        try {
            await collection.deleteOne({ _id: id });
        } catch (error) {
            console.error('❌ Falha ao remover dados da sessão:', error);
        }
    };

    const creds = (await readData(sessionId)) || initAuthCreds();

    // 🔹 Mantém o backup local em caso de falha no Mongo
    const backupFile = `./session-backup-${sessionId}.json`;
    const saveBackup = (data) => fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: async () => {
            await writeData(sessionId, creds);
            saveBackup(creds);
        },
        clearCreds: () => removeData(sessionId),
    };
};
