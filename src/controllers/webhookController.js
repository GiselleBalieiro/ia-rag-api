import { pool } from '../config/db.js';
import axios from 'axios';
import { perguntarIA } from './ia.js';
import { fetchContextoViaPHP } from './function.js';

export async function verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        try {
            const [rows] = await pool.query(
                'SELECT id FROM meta WHERE verify_token = ? LIMIT 1',
                [token]
            );

            if (rows.length > 0) {
                console.log('[Webhook] Webhook verificado com sucesso!');
                res.status(200).send(challenge);
            } else {
                console.log('[Webhook] Token de verificação inválido:', token);
                res.sendStatus(403);
            }
        } catch (error) {
            console.error('[Webhook] Erro ao verificar token:', error);
            res.sendStatus(500);
        }
    } else {
        res.sendStatus(400);
    }
}

export async function handleWebhook(req, res) {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
        res.sendStatus(200);

        try {
            if (
                body.entry &&
                body.entry[0].changes &&
                body.entry[0].changes[0] &&
                body.entry[0].changes[0].value.messages &&
                body.entry[0].changes[0].value.messages[0]
            ) {
                const value = body.entry[0].changes[0].value;
                const phone_number_id = value.metadata.phone_number_id;
                const message = value.messages[0];
                const from = message.from;
                const textBody = message.text ? message.text.body : null;

                const [metaRows] = await pool.query(
                    'SELECT agent_id, access_token FROM meta WHERE phone_number_id = ? LIMIT 1',
                    [phone_number_id]
                );

                if (metaRows.length === 0) {
                    console.warn(`[Webhook] Agente não encontrado para phone_number_id: ${phone_number_id}`);
                    return;
                }

                const { agent_id, access_token } = metaRows[0];

                if (message.type !== 'text') {
                    console.log(`[Webhook] Mensagem do tipo ${message.type} ignorada.`);
                    return;
                }

                console.log(`[Webhook] Agente ${agent_id} recebeu mensagem de ${from}: ${textBody}`);

                try {
                    const historico = [];

                    const contexto = await fetchContextoViaPHP(agent_id);
                    const respostaIA = await perguntarIA(textBody, contexto, historico);

                    await axios.post(
                        `https://graph.facebook.com/v22.0/${phone_number_id}/messages`,
                        {
                            messaging_product: 'whatsapp',
                            to: from,
                            text: { body: respostaIA },
                        },
                        {
                            headers: {
                                'Authorization': `Bearer ${access_token}`,
                                'Content-Type': 'application/json',
                            },
                        }
                    );

                    console.log(`[Webhook] Resposta enviada para ${from}: ${respostaIA}`);

                } catch (err) {
                    console.error('[Webhook] Erro ao processar IA ou enviar resposta:', err.message || err);
                }

            }
        } catch (error) {
            console.error('[Webhook] Erro ao processar notificação:', error);
        }
    } else {
        res.sendStatus(404);
    }
}
