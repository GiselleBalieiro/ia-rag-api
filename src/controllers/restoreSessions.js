import { startWhatsApp } from './whatsapp.js';
import { buscarAgentesParaRestaurar } from './function.js';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function restaurarConexoes() {
  console.log('[Servidor] Servidor iniciado. Restaurando conexões ativas...');
  try {
    const idsParaRestaurar = await buscarAgentesParaRestaurar(); 

    if (idsParaRestaurar.length > 0) {
      console.log(`[Servidor] Restaurando ${idsParaRestaurar.length} sessões: [${idsParaRestaurar.join(', ')}]`);

      for (const id of idsParaRestaurar) {
        try {
          console.log(`[Servidor] Iniciando conexão para o agente: ${id}`);
          await startWhatsApp(id);
          console.log(`[Servidor] Agente ${id} processado. Aguardando 10 segundos...`);
          await delay(10000); 
        } catch (err) {
          console.error(`[Servidor] Erro ao iniciar agente ${id}:`, err.message);
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
