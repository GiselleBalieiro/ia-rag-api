import { startWhatsApp, getWhatsappStatus } from './whatsapp.js';
import { buscarAgentesParaRestaurar } from './function.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const CONCURRENT_RESTORES = parseInt(process.env.CONCURRENT_RESTORES || '1'); 
const BATCH_DELAY = parseInt(process.env.BATCH_DELAY || '10000'); 

export async function restaurarConexoes() {
  console.log('[Servidor] Servidor iniciado. Restaurando conexões ativas...');
  try {
    const agentes = await buscarAgentesParaRestaurar() ?? [];

    console.log('[Servidor] agentes raw:', JSON.stringify(agentes, null, 2));

    const idsParaRestaurar = agentes.map(a => {
      if (!a) return String(a);

      const id = a.id ?? a._id ?? a.agentId ?? a.sessionId ?? a.name;
      return id ?? JSON.stringify(a);
    });

    if (idsParaRestaurar.length > 0) {
      console.log(`[Servidor] Restaurando ${idsParaRestaurar.length} sessões em batches de ${CONCURRENT_RESTORES}: [${idsParaRestaurar.join(', ')}]`);

      for (let i = 0; i < idsParaRestaurar.length; i += CONCURRENT_RESTORES) {
        const batch = idsParaRestaurar.slice(i, i + CONCURRENT_RESTORES);
        const batchNumber = Math.floor(i / CONCURRENT_RESTORES) + 1;
        const totalBatches = Math.ceil(idsParaRestaurar.length / CONCURRENT_RESTORES);

        console.log(`[Servidor] Batch ${batchNumber}/${totalBatches}: Iniciando ${batch.length} agentes em paralelo...`);

        const promises = batch.map(async (idLegivel) => {
          try {
            console.log(`[Servidor] Iniciando conexão para o agente: ${idLegivel}`);
            await startWhatsApp(idLegivel);
            console.log(`[Servidor] Agente ${idLegivel} processado com sucesso.`);
          } catch (err) {
            console.error(`[Servidor] Erro ao iniciar agente ${idLegivel}:`, err?.message ?? err);
          }
        });

        await Promise.allSettled(promises);

        if (i + CONCURRENT_RESTORES < idsParaRestaurar.length) {
          console.log(`[Servidor] Batch ${batchNumber} concluído. Aguardando ${BATCH_DELAY}ms antes do próximo batch...`);
          await delay(BATCH_DELAY);
        }
      }

      console.log('[Servidor] Restauração de sessões concluída.');
    } else {
      console.log('[Servidor] Nenhuma sessão encontrada para restaurar.');
    }
  } catch (error) {
    console.error('[Servidor] Erro crítico ao restaurar conexões:', error);
  }
}

export async function verificarSessoesAtivas() {
  console.log('[Verificação] Verificando sessões ativas...');
  try {
    const agentes = await buscarAgentesParaRestaurar() ?? [];

    if (agentes.length === 0) {
      console.log('[Verificação] Nenhum agente encontrado para verificar.');
      return;
    }

    const idsParaVerificar = agentes.map(a => {
      if (!a) return String(a);
      const id = a.id ?? a._id ?? a.agentId ?? a.sessionId ?? a.name;
      return id ?? JSON.stringify(a);
    });

    console.log(`[Verificação] Verificando ${idsParaVerificar.length} agentes: [${idsParaVerificar.join(', ')}]`);

    for (const id of idsParaVerificar) {
      try {
        const status = getWhatsappStatus(id);

        if (status.status === 'desconectado' || status.status === 'erro') {
          console.log(`[Verificação] Tentando reconectar agente ${id} (status: ${status.status})`);

          await startWhatsApp(id, false);
        } else if (status.status === 'conectado') {
          console.log(`[Verificação] Agente ${id} já está conectado.`);
        } else {
          console.log(`[Verificação] Agente ${id} em estado: ${status.status}`);
        }

        await delay(2000);
      } catch (err) {
        console.error(`[Verificação] Erro ao verificar agente ${id}:`, err?.message ?? err);
      }
    }

    console.log('[Verificação] Verificação de sessões concluída.');
  } catch (error) {
    console.error('[Verificação] Erro ao verificar sessões:', error);
  }
}

// verificação automática sessions
// setInterval(verificarSessoesAtivas, 5 * 60 * 1000);
