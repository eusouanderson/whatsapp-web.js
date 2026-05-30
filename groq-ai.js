/**
 * =====================================================
 *  🤖 GROQ AI — Gera UM template reutilizável
 *  1 chamada à API → N mensagens personalizadas
 * =====================================================
 */

require('dotenv').config();

// Node 18+ tem fetch nativo na globalThis.
// Em testes, pode ser substituído via vi.stubGlobal('fetch', mockFn).
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';
const MODELO = 'openai/gpt-oss-120b';

/**
 * Gera UM template de mensagem com variável {nome}.
 * Retorna a mensagem pronta para ser enviada a qualquer paciente.
 */
async function gerarTemplate(contexto) {
    const prompt = `
Você é responsável pela comunicação do consultório da Dra. Fabiana Bueno, odontologista.

OBJETIVO DA MENSAGEM:
${contexto}

Crie UMA mensagem de WhatsApp profissional e acolhedora com as seguintes regras:

- Use exatamente o marcador {nome} onde o primeiro nome do paciente deve aparecer
- A mensagem deve ser neutra (funcionar para homem e mulher)
- Tom profissional, cordial e humano — como uma recepcionista escreveria
- Máximo 4 linhas
- Use no máximo 1 emoji
- Termine sempre com: *Equipe Dra. Fabiana Bueno* (em negrito do WhatsApp)
- NÃO use saudações genéricas como "Prezado" ou "Caro"
- Comece diretamente com "Olá, {nome}!"
- Escreva em português brasileiro
- Retorne APENAS o texto da mensagem, sem explicações

`.trim();

    const res = await fetch(GROQ_API, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.GROQ_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: MODELO,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 300,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Groq API ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content.trim();
}

/**
 * Aplica o template para uma lista de contatos.
 * Substitui {nome} pelo primeiro nome de cada um.
 */
function aplicarTemplate(template, contatos) {
    return contatos.map((c) => {
        const primeiroNome = c.nome.trim().split(' ')[0];
        // Capitaliza a primeira letra
        const nomeFormatado =
            primeiroNome.charAt(0).toUpperCase() +
            primeiroNome.slice(1).toLowerCase();
        return {
            ...c,
            mensagem: template.replace(/{nome}/g, nomeFormatado),
        };
    });
}

/**
 * Gera uma resposta contextual para o chat do bot.
 * Usa um prompt mais aberto para responder perguntas dos pacientes.
 */
async function gerarResposta(mensagem) {
    const prompt = `
Você é a recepcionista virtual da Dra. Fabiana Bueno, odontologista.

Regras:
- Responda de forma profissional, cordial e humana
- Seja breve (máximo 3 linhas)
- Se a pergunta for sobre agendamento, endereço ou planos, oriente o paciente a escolher a opção no menu
- Se for outra dúvida, responda com informação útil e educada
- Escreva em português brasileiro
- NÃO use saudações genéricas
- Retorne APENAS o texto da resposta

Pergunta do paciente: "${mensagem}"
`.trim();

    const res = await fetch(GROQ_API, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${process.env.GROQ_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: MODELO,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 300,
        }),
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Groq API ${res.status}: ${err}`);
    }

    const data = await res.json();
    return data.choices[0].message.content.trim();
}

module.exports = { gerarTemplate, aplicarTemplate, gerarResposta };
