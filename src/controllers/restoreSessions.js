// ...existing code...
import { startWhatsApp } from './whatsapp.js';
import { buscarAgentesParaRestaurar } from './function.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
      console.log(`[Servidor] Restaurando ${idsParaRestaurar.length} sessões: [${idsParaRestaurar.join(', ')}]`);

      for (let i = 0; i < agentes.length; i++) {
        const agente = agentes[i];
        const idLegivel = idsParaRestaurar[i];
        try {
          console.log(`[Servidor] Iniciando conexão para o agente: ${idLegivel}`);

          await startWhatsApp(idLegivel);
          console.log(`[Servidor] Agente ${idLegivel} processado. Aguardando 10 segundos...`);
          await delay(10000);
        } catch (err) {
          console.error(`[Servidor] Erro ao iniciar agente ${idLegivel}:`, err?.message ?? err);
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
