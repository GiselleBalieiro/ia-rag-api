import Baileys from '@whiskeysockets/baileys';
const { proto, initAuthCreds, BufferJSON } = Baileys;

export const useMongoDBAuthState = async (collection, sessionId) => {
    const readData = async (id) => {
        try {
            const data = await collection.findOne({ _id: id });
            return data ? JSON.parse(JSON.stringify(data), BufferJSON.reviver) : null;
        } catch (error) {
            console.error('Falha ao ler dados da sessão:', error);
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
            console.error('Falha ao escrever dados da sessão:', error);
        }
    };

    const removeData = async (id) => {
        try {
            await collection.deleteOne({ _id: id });
        } catch (error) {
            console.error('Falha ao remover dados da sessão:', error);
        }
    };

    const creds = (await readData(sessionId)) || initAuthCreds();

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
        saveCreds: () => {
            return writeData(sessionId, creds);
        },
        clearCreds: () => {
            return removeData(sessionId);
        }
    };
};