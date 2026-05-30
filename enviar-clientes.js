/**
 * =============================================================
 *  📤 ENVIO EM MASSA PARA CLIENTES — whatsapp-web.js
 * =============================================================
 */

const { Client, LocalAuth } = require('./index');

// ─── LISTA DE CLIENTES ───────────────────────────────────────
// Formato: { nome, numero (55 + DDD + número), mensagem personalizada }
const clientes = [
    {
        nome: 'João Silva',
        numero: '5511954914441', // seu número para teste
        mensagem: 'Olá João! Temos uma promoção especial para você! 🎉',
    },
    {
        nome: 'Maria Souza',
        numero: '5511988887777',
        mensagem: 'Oi Maria! Seu pedido está pronto para retirada! 📦',
    },
    {
        nome: 'Carlos Lima',
        numero: '5521977776666',
        mensagem: 'Carlos, não esqueça da sua consulta amanhã às 14h! 🏥',
    },
    // Adicione quantos clientes quiser aqui...
];

// ─── CONFIGURAÇÕES ───────────────────────────────────────────
const DELAY_ENTRE_MENSAGENS = 5000; // 5 segundos entre cada envio (evita ban)
const MENSAGEM_PADRAO = 'Olá {nome}! Esta é uma mensagem da nossa empresa. 😊';

// ─── UTILITÁRIOS ─────────────────────────────────────────────
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatarNumero = (numero) => {
    // Remove tudo que não for número
    const limpo = numero.replace(/\D/g, '');
    return `${limpo}@c.us`;
};

const personalizarMensagem = (template, nome) => {
    return template.replace('{nome}', nome);
};

// ─── CLIENTE WHATSAPP ────────────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome-stable',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
});

// ─── RELATÓRIO ───────────────────────────────────────────────
const relatorio = {
    enviados: [],
    falhas: [],
    inicio: null,
};

// ─── FUNÇÃO PRINCIPAL DE ENVIO ───────────────────────────────
async function enviarParaTodos() {
    console.log(`\n📋 Total de clientes: ${clientes.length}`);
    console.log(`⏱️  Delay entre mensagens: ${DELAY_ENTRE_MENSAGENS / 1000}s`);
    console.log(
        `⌛ Tempo estimado: ~${Math.ceil((clientes.length * DELAY_ENTRE_MENSAGENS) / 60000)} minuto(s)\n`,
    );
    console.log('═'.repeat(50));

    relatorio.inicio = new Date();

    for (let i = 0; i < clientes.length; i++) {
        const cliente = clientes[i];
        const numero = formatarNumero(cliente.numero);
        const mensagem =
            cliente.mensagem ||
            personalizarMensagem(MENSAGEM_PADRAO, cliente.nome);

        console.log(
            `\n[${i + 1}/${clientes.length}] Enviando para ${cliente.nome} (${cliente.numero})...`,
        );

        try {
            // Verifica se o número está cadastrado no WhatsApp
            const existe = await client.isRegisteredUser(numero);

            if (!existe) {
                console.log(
                    `  ⚠️  Número não encontrado no WhatsApp — pulando`,
                );
                relatorio.falhas.push({
                    ...cliente,
                    motivo: 'Número não registrado no WhatsApp',
                });
                continue;
            }

            // Envia a mensagem
            await client.sendMessage(numero, mensagem);
            console.log(`  ✅ Mensagem enviada com sucesso!`);
            relatorio.enviados.push(cliente);
        } catch (err) {
            console.log(`  ❌ Erro: ${err.message}`);
            relatorio.falhas.push({ ...cliente, motivo: err.message });
        }

        // Aguarda antes do próximo envio (evita ban do WhatsApp)
        if (i < clientes.length - 1) {
            console.log(`  ⏳ Aguardando ${DELAY_ENTRE_MENSAGENS / 1000}s...`);
            await sleep(DELAY_ENTRE_MENSAGENS);
        }
    }

    // ─── RELATÓRIO FINAL ─────────────────────────────────────
    const duracao = Math.round((new Date() - relatorio.inicio) / 1000);
    console.log('\n' + '═'.repeat(50));
    console.log('📊 RELATÓRIO FINAL');
    console.log('═'.repeat(50));
    console.log(`✅ Enviados com sucesso: ${relatorio.enviados.length}`);
    console.log(`❌ Falhas:              ${relatorio.falhas.length}`);
    console.log(`⏱️  Tempo total:         ${duracao}s`);

    if (relatorio.enviados.length > 0) {
        console.log('\n✅ Enviados:');
        relatorio.enviados.forEach((c) =>
            console.log(`   • ${c.nome} — ${c.numero}`),
        );
    }

    if (relatorio.falhas.length > 0) {
        console.log('\n❌ Falhas:');
        relatorio.falhas.forEach((c) =>
            console.log(`   • ${c.nome} — ${c.numero} → ${c.motivo}`),
        );
    }

    console.log('\n🎉 Envio concluído!\n');
    process.exit(0);
}

// ─── EVENTOS ────────────────────────────────────────────────
client.on('qr', (qr) => {
    // Se já escaneou antes, não vai aparecer QR novamente (sessão salva)
    const qrcode = require('qrcode-terminal');
    console.log('\n📲 Escaneie o QR Code:\n');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('🔐 Autenticado!'));

client.on('ready', async () => {
    console.log('✅ Bot conectado! Iniciando envios...');
    await enviarParaTodos();
});

client.on('disconnected', (r) => console.log('⚠️  Desconectado:', r));

// ─── INICIAR ────────────────────────────────────────────────
console.log('🚀 Iniciando envio para clientes...\n');
client.initialize();
