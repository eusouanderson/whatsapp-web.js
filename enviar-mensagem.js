/**
 * =============================================================
 *  📱 EXEMPLO: Como enviar mensagens com whatsapp-web.js
 * =============================================================
 *
 * COMO USAR:
 *   1. Execute: node enviar-mensagem.js
 *   2. Escaneie o QR Code com seu celular
 *      (WhatsApp → Dispositivos conectados → Conectar dispositivo)
 *   3. Aguarde a mensagem "✅ PRONTO! Bot conectado!"
 *   4. O script enviará as mensagens automaticamente
 *
 * FORMATO DO NÚMERO:
 *   - Código do país + DDD + número (sem +, espaços ou traços)
 *   - Brasil: 5511999998888@c.us  (55 + 11 + 999998888)
 *   - Grupos:  XXXXXXXXXX@g.us
 * =============================================================
 */

const { Client, LocalAuth, MessageMedia } = require('./index');
const qrcode = require('qrcode-terminal');

// ─── CONFIGURAÇÃO DO CLIENTE ────────────────────────────────
const client = new Client({
    authStrategy: new LocalAuth(), // Salva a sessão localmente (não precisa escanear todo dia)
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/google-chrome-stable', // usa o Chrome já instalado
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
});

// ─── EVENTOS ────────────────────────────────────────────────

// Mostra o QR Code no terminal para escanear com o celular
client.on('qr', (qr) => {
    console.log('\n📲 Escaneie o QR Code abaixo com seu WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    console.log(
        '\n(WhatsApp → Dispositivos conectados → Conectar dispositivo)\n',
    );
});

// Autenticado com sucesso
client.on('authenticated', () => {
    console.log('🔐 Autenticado com sucesso!');
});

// Pronto para enviar mensagens
client.on('ready', async () => {
    console.log('✅ PRONTO! Bot conectado!\n');
    console.log('═'.repeat(50));

    // ──────────────────────────────────────────────────────
    // 📝 EXEMPLOS DE ENVIO DE MENSAGEM
    // Altere o número abaixo para o destinatário desejado!
    // ──────────────────────────────────────────────────────

    const numero = '5511954914441@c.us'; // Seu número: +55 11 95491-4441

    try {
        // ── 1️⃣  MENSAGEM DE TEXTO SIMPLES ─────────────────
        await client.sendMessage(
            numero,
            'Olá! 👋 Mensagem enviada via whatsapp-web.js!',
        );
        console.log('✅ 1. Mensagem de texto enviada!');

        // ── 2️⃣  MENSAGEM COM FORMATAÇÃO ────────────────────
        await client.sendMessage(
            numero,
            '*Negrito*\n' +
                '_Itálico_\n' +
                '~Tachado~\n' +
                '```Código```\n' +
                '> Citação',
        );
        console.log('✅ 2. Mensagem formatada enviada!');

        // ── 3️⃣  RESPONDER UMA MENSAGEM ESPECÍFICA ──────────
        // Envia e depois responde a mesma mensagem
        const msgEnviada = await client.sendMessage(
            numero,
            'Mensagem original 📨',
        );
        await msgEnviada.reply('Esta é uma resposta! 💬');
        console.log('✅ 3. Resposta enviada!');

        // ── 4️⃣  ENVIAR IMAGEM LOCAL ─────────────────────────
        const path = require('path');
        const imagemLocal = MessageMedia.fromFilePath(
            path.join(__dirname, 'teste.png'),
        );
        await client.sendMessage(numero, imagemLocal, {
            caption: '📸 Foto enviada via bot! (imagem local)',
        });
        console.log('✅ 4. Imagem local enviada!');

        // ── 5️⃣  VERIFICAR SE NÚMERO EXISTE ─────────────────
        const numeroTeste = '5511954914441'; // sem @c.us para checar
        const existe = await client.isRegisteredUser(`${numeroTeste}@c.us`);
        console.log(
            `\n📋 O número ${numeroTeste} está no WhatsApp? ${existe ? 'SIM ✅' : 'NÃO ❌'}`,
        );

        // ── 6️⃣  LISTAR TODOS OS CHATS ──────────────────────
        const chats = await client.getChats();
        console.log(`\n💬 Você tem ${chats.length} conversas abertas.`);
        console.log('Primeiras 3 conversas:');
        chats.slice(0, 3).forEach((chat, i) => {
            console.log(`  ${i + 1}. ${chat.name} (${chat.id._serialized})`);
        });

        console.log('\n' + '═'.repeat(50));
        console.log('🎉 Todos os exemplos executados com sucesso!');
        console.log('   O bot continua ativo. Pressione Ctrl+C para sair.\n');
    } catch (err) {
        console.error('❌ Erro ao enviar mensagem:', err.message);
    }
});

// Receber mensagens e responder automaticamente
client.on('message', async (msg) => {
    console.log(`\n📩 Mensagem recebida de ${msg.from}: "${msg.body}"`);

    // Auto-resposta simples
    if (msg.body.toLowerCase() === 'oi') {
        await msg.reply('Oi! 👋 Sou um bot criado com whatsapp-web.js!');
    }

    if (msg.body.toLowerCase() === '!ajuda') {
        await msg.reply(
            '*Comandos disponíveis:*\n' +
                '• `oi` → Respondo com saudação\n' +
                '• `!ajuda` → Lista de comandos\n' +
                '• `!info` → Informações da conexão',
        );
    }

    if (msg.body.toLowerCase() === '!info') {
        const info = client.info;
        await msg.reply(
            `*Informações do Bot:*\n` +
                `Nome: ${info.pushname}\n` +
                `Número: ${info.wid.user}\n` +
                `Plataforma: ${info.platform}`,
        );
    }
});

// Desconectado
client.on('disconnected', (reason) => {
    console.log('⚠️  Bot desconectado:', reason);
});

// ─── INICIAR ────────────────────────────────────────────────
console.log('🚀 Iniciando bot WhatsApp...\n');
client.initialize();
