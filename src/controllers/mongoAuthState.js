import Baileys from '@whiskeysockets/baileys';
import fs from 'fs';

const { proto, initAuthCreds, BufferJSON } = Baileys;

export const useMongoDBAuthState = async (collection, sessionId = 'default') => {

  const readData = async (id) => {
    try {
      const doc = await collection.findOne({ _id: id });

      if (!doc || !doc.data) {
        return null;
      }

      return JSON.parse(doc.data, BufferJSON.reviver);

    } catch (error) {
      console.error(`[${sessionId}] Falha ao LER dados da sessão (${id}):`, error);
      return null;
    }
  };

  const writeData = async (id, data) => {
    try {

      const dataString = JSON.stringify(data, BufferJSON.replacer);

      await collection.updateOne(
        { _id: id },
        { $set: { data: dataString } }, 
        { upsert: true }
      );
    } catch (error) {
      console.error(`[${sessionId}] Falha ao ESCREVER dados da sessão (${id}):`, error);
    }
  };

  const removeData = async (id) => {
    try {
      await collection.deleteOne({ _id: id });
    } catch (error) {
      console.error(`[${sessionId}] Falha ao REMOVER dados da sessão (${id}):`, error);
    }
  };

  const creds = (await readData(sessionId)) || initAuthCreds();

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