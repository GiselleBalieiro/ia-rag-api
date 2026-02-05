import { pool } from '../config/db.js';
import crypto from 'crypto';

export async function createMetaConfig(req, res) {
    const { agent_id, phone_number_id, waba_id, access_token } = req.body;
    const user_id = req.user_id;

    if (!agent_id || !phone_number_id || !access_token) {
        return res.status(400).json({
            success: false,
            message: 'Campos obrigatórios: agent_id, phone_number_id, access_token',
        });
    }

    try {
        const [existing] = await pool.query(
            'SELECT id FROM meta WHERE agent_id = ?',
            [agent_id]
        );

        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Já existe uma configuração Meta para este agente. Use a rota de atualização.',
            });
        }

        const verify_token = crypto.randomBytes(16).toString('hex');

        const [result] = await pool.query(
            `INSERT INTO meta (agent_id, user_id, phone_number_id, waba_id, access_token, verify_token)
       VALUES (?, ?, ?, ?, ?, ?)`,
            [agent_id, user_id, phone_number_id, waba_id || null, access_token, verify_token]
        );

        if (result.affectedRows === 0) {
            throw new Error('Falha ao inserir configuração Meta.');
        }


        let baseUrl = process.env.BASE_URL;

        if (!baseUrl) {
            const host = req.get('host');
            const protocol = host.includes('localhost') ? 'http' : 'https';
            baseUrl = `${protocol}://${host}`;
        }

        const webhook_url = `${baseUrl}/webhook`;

        res.json({
            success: true,
            message: 'Configuração Meta criada com sucesso.',
            data: {
                id: result.insertId,
                agent_id,
                verify_token,
                webhook_url,
            },
        });

    } catch (error) {
        console.error('Erro ao criar configuração Meta:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno ao salvar configuração Meta.',
        });
    }
}

export async function updateMetaConfig(req, res) {
    const { id } = req.params;
    const { phone_number_id, waba_id, access_token } = req.body;
    const user_id = req.user_id;

    if (!id) {
        return res.status(400).json({ success: false, message: 'ID da configuração é obrigatório.' });
    }

    try {
        const fields = [];
        const values = [];

        if (phone_number_id) {
            fields.push('phone_number_id = ?');
            values.push(phone_number_id);
        }
        if (waba_id !== undefined) {
            fields.push('waba_id = ?');
            values.push(waba_id);
        }
        if (access_token) {
            fields.push('access_token = ?');
            values.push(access_token);
        }

        if (fields.length === 0) {
            return res.status(400).json({ success: false, message: 'Nenhum dado para atualizar.' });
        }

        values.push(id);
        values.push(user_id);

        const [result] = await pool.query(
            `UPDATE meta SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
            values
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração não encontrada ou não pertence ao usuário.',
            });
        }

        res.json({
            success: true,
            message: 'Configuração Meta atualizada com sucesso.',
        });

    } catch (error) {
        console.error('Erro ao atualizar configuração Meta:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno ao atualizar configuração Meta.',
        });
    }
}

export async function getMetaConfig(req, res) {
    const { agent_id } = req.params;
    const user_id = req.user_id;

    try {
        const [rows] = await pool.query(
            'SELECT id, agent_id, phone_number_id, waba_id, verify_token, created_at FROM meta WHERE agent_id = ? AND user_id = ?',
            [agent_id, user_id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Configuração Meta não encontrada para este agente.',
            });
        }

        res.json({
            success: true,
            data: rows[0],
        });

    } catch (error) {
        console.error('Erro ao buscar configuração Meta:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao buscar configuração Meta.',
        });
    }
}
