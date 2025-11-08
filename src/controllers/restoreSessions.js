import { startWhatsApp } from './whatsapp.js';
import { buscarAgentesParaRestaurar } from './function.js';

export async function restaurarConexoes () {
  console.log('[Servidor] Servidor iniciado. Restaurando conexões ativas...');
  try {
    const agentes = await buscarAgentesParaRestaurar();

    console.log('[Servidor] agentes raw:', JSON.stringify(agentes, null, 2));

    const idsParaRestaurar = agentes.map(a => a.id ?? a._id ?? a.agentId ?? a.sessionId ?? a.name ?? a);

    if (idsParaRestaurar.length > 0) {
      console.log(`[Servidor] Restaurando ${idsParaRestaurar.length} sessões: [${idsParaRestaurar.join(', ')}]`);
      await Promise.all(
        idsParaRestaurar.map(id => startWhatsApp(id))
      );
    } else {
      console.log('Nenhuma sessão encontrada para restaurar.');
    }
  } catch (error) {
    console.error(' Erro crítico ao restaurar conexões:', error);
  }
}
