import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

const client = new Client({
    authStrategy: new LocalAuth()
});
let isReady = false;

client.on('qr', (qr) => {
    if (!isReady) {
        qrcode.generate(qr, { small: true });
    }
});

client.on('ready', () => {
    if (!isReady) {
        console.log('Client is ready!');
        isReady = true;
    }
});

client.on('disconnected', (reason) => {
    console.log('Client was disconnected:', reason);
    isReady = false;
});

client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILURE:', msg);
    isReady = false;
});

// Só responde se a mensagem não foi enviada pelo próprio bot
client.on('message_create', msg => {
    if (msg.body === '!ping' && isReady && !msg.fromMe) {
        msg.reply('pong');
    }
});

client.initialize();