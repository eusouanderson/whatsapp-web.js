/**
 * =====================================================
 *  🚀 SERVIDOR — WhatsApp Sender Web UI
 *  Factory pattern → testável via createApp(deps)
 * =====================================================
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const PORT = 3000;

// ─────────────────────────────────────────────────────
//  FACTORY — aceita dependências injetadas (para testes)
// ─────────────────────────────────────────────────────
function createApp(deps = {}) {
    // Dependências (reais ou mock) — fallbacks cobertos em produção, ignorados no coverage
    /* c8 ignore start */
    const { Client, LocalAuth, MessageMedia } =
        deps.whatsappLib || require('./index');
    const db = deps.db || require('./db');
    const parsearCSV = deps.parsearCSV || require('./csv-parser').parsearCSV;
    const { gerarTemplate, aplicarTemplate } =
        deps.groqAI || require('./groq-ai');
    const qrcode = deps.qrcode || require('qrcode');
    const CSV_PATH = deps.csvPath || path.join(__dirname, 'clients.csv');
    const Bot = deps.Bot || require('./bot').Bot;
    /* c8 ignore stop */

    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);

    app.use(express.json());
    app.use(express.static(path.join(__dirname, 'public')));

    // ─── ESTADO ──────────────────────────────────────
    let clientReady = false;
    let clientInfo = null;
    let sendingQueue = false;
    let ultimoQR = null;
    let statusAtual = 'iniciando';

    // ─── WHATSAPP CLIENT ─────────────────────────────
    const client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
            ],
        },
    });

    // ─── BOT ──────────────────────────────────────────
    const bot = new Bot();

    client.on('message', async (msg) => {
        if (msg.fromMe) return;
        try {
            const sendMessage = async (text) => {
                await client.sendMessage(msg.from, text);
            };
            await bot.handleMessage(msg.body, msg.from, sendMessage);
        } catch (e) {
            console.error('🤖 Bot error:', e.message);
        }
    });

    // ─── SOCKET: estado atual para novos sockets ─────
    io.on('connection', (socket) => {
        console.log('🌐 Browser conectado ao servidor');
        if (clientReady && clientInfo) {
            socket.emit('ready', {
                name: clientInfo.pushname,
                number: clientInfo.wid.user,
            });
            socket.emit('status', {
                type: 'success',
                msg: '✅ WhatsApp conectado!',
                statusAtual,
            });
        } else if (ultimoQR) {
            socket.emit('qr_disponivel'); // sinal para o front buscar o QR via HTTP
            socket.emit('status', {
                type: 'warning',
                msg: '📷 QR Code pronto — escaneie pelo WhatsApp!',
                statusAtual,
            });
        } else {
            // Envia mensagem específica por estado
            const msgs = {
                iniciando: { type: 'info', msg: '⏳ Iniciando Chrome...' },
                carregando: {
                    type: 'info',
                    msg: '⏳ Carregando WhatsApp Web...',
                },
                autenticando: {
                    type: 'warning',
                    msg: '🔐 Sessão encontrada! Autenticando...',
                },
                erro: {
                    type: 'error',
                    msg: '❌ Erro na autenticação — recarregue a página',
                },
                desconectado: { type: 'error', msg: '⚠️ Desconectado' },
            };
            const m = msgs[statusAtual] || {
                type: 'info',
                msg: `⏳ Aguardando (${statusAtual})...`,
            };
            socket.emit('status', { ...m, statusAtual });
        }
    });

    // ─── EVENTOS WHATSAPP ────────────────────────────
    client.on('loading_screen', (percent) => {
        statusAtual = 'carregando';
        const txt = `⏳ Carregando WhatsApp Web: ${percent}%`;
        console.log(txt);
        io.emit('status', { type: 'info', msg: txt });
    });

    client.on('qr', async (qr) => {
        statusAtual = 'qr';
        console.log('📲 QR Code gerado — aguardando scan');
        ultimoQR = await qrcode.toDataURL(qr, { width: 300 });
        io.emit('qr_disponivel'); // avisa o front para buscar /api/qr
        io.emit('status', {
            type: 'warning',
            msg: '📷 QR Code pronto — escaneie pelo WhatsApp!',
            statusAtual,
        });
    });

    client.on('authenticated', () => {
        statusAtual = 'autenticando';
        console.log('🔐 Autenticado');
        io.emit('status', { type: 'info', msg: '🔐 Autenticando...' });
    });

    client.on('ready', async () => {
        statusAtual = 'conectado';
        clientReady = true;
        clientInfo = client.info;
        ultimoQR = null;
        console.log('✅ WhatsApp pronto:', clientInfo.pushname);
        io.emit('ready', {
            name: clientInfo.pushname,
            number: clientInfo.wid.user,
        });
        io.emit('status', { type: 'success', msg: '✅ WhatsApp conectado!' });
    });

    client.on('auth_failure', (msg) => {
        statusAtual = 'erro';
        console.error('❌ Falha de autenticação:', msg);
        io.emit('status', {
            type: 'error',
            msg: '❌ Falha de autenticação: ' + msg,
        });
    });

    client.on('disconnected', (reason) => {
        statusAtual = 'desconectado';
        clientReady = false;
        clientInfo = null;
        console.log('⚠️ Desconectado:', reason);
        io.emit('disconnected', reason);
        io.emit('status', { type: 'error', msg: '⚠️ Desconectado: ' + reason });
    });

    // ─── UTILITÁRIOS ─────────────────────────────────
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const resolveNumber = async (numero) => {
        let clean = db.normalizarNumero(numero);
        let numberId = await client.getNumberId(clean);
        if (!numberId && clean.length === 13) {
            const semNove = clean.slice(0, 4) + clean.slice(5);
            numberId = await client.getNumberId(semNove);
        }
        if (!numberId) throw new Error('Número não encontrado no WhatsApp');
        return numberId._serialized;
    };

    // ─── API: STATUS ──────────────────────────────────
    app.get('/api/status', (req, res) => {
        res.json({
            ready: clientReady,
            hasQR: !!ultimoQR,
            statusAtual, // expõe o estado atual para o frontend
            info: clientInfo
                ? { name: clientInfo.pushname, number: clientInfo.wid.user }
                : null,
            db: db.resumo(),
        });
    });

    // ─── API: LOGOUT ──────────────────────────────────
    app.post('/api/logout', async (req, res) => {
        try {
            await client.logout();
            clientReady = false;
            clientInfo = null;
            ultimoQR = null;
            res.json({ ok: true });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ─── API: QR CODE como imagem PNG ─────────────────
    app.get('/api/qr', async (req, res) => {
        if (clientReady) return res.status(204).end();
        if (!ultimoQR) return res.status(202).end();

        const base64 = ultimoQR.replace(/^data:image\/png;base64,/, '');
        const buf = Buffer.from(base64, 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'no-store');
        res.send(buf);
    });

    // ══════════════════════════════════════════════════
    //  CRUD CONTATOS
    // ══════════════════════════════════════════════════

    app.get('/api/contatos', (req, res) => {
        try {
            res.json(db.listarContatos());
        } catch (e) {
            console.error('Erro ao listar contatos:', e.message);
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/contatos', (req, res) => {
        const { nome, numero } = req.body;
        if (!nome || !numero)
            return res
                .status(400)
                .json({ error: 'nome e numero são obrigatórios' });
        const result = db.inserirContato(nome, numero);
        if (!result.ok)
            return res.status(409).json({ error: result.msg, duplicado: true });
        res.status(201).json({
            id: result.id,
            nome,
            numero: db.normalizarNumero(numero),
        });
    });

    app.post('/api/contatos/importar', (req, res) => {
        const { contatos } = req.body;
        if (!contatos?.length)
            return res.status(400).json({ error: 'Lista vazia' });
        const result = db.importarContatos(contatos);
        res.json(result);
    });

    app.put('/api/contatos/:id', (req, res) => {
        const { nome } = req.body;
        if (!nome) return res.status(400).json({ error: 'nome é obrigatório' });
        db.atualizarContato(req.params.id, nome);
        res.json({ ok: true });
    });

    app.delete('/api/contatos/:id', (req, res) => {
        db.removerContato(req.params.id);
        res.json({ ok: true });
    });

    app.get('/api/contatos/:id/historico', (req, res) => {
        res.json(db.historicoContato(req.params.id));
    });

    // ══════════════════════════════════════════════════
    //  ENVIO EM MASSA
    // ══════════════════════════════════════════════════

    app.post('/api/send', async (req, res) => {
        if (!clientReady)
            return res.status(503).json({ error: 'WhatsApp não conectado' });
        if (sendingQueue)
            return res
                .status(429)
                .json({ error: 'Já existe um envio em andamento' });

        const { ids, mensagem, imagem, imagemMime, delay = 5000 } = req.body;

        let lista = [];
        if (ids && ids.length) {
            lista = db.listarContatos().filter((c) => ids.includes(c.id));
        } else if (req.body.contatos) {
            lista = req.body.contatos;
        }

        if (!lista.length)
            return res
                .status(400)
                .json({ error: 'Nenhum contato selecionado' });

        let media = null;
        if (imagem && imagemMime) {
            media = new MessageMedia(imagemMime, imagem, 'imagem.jpg');
        }

        res.json({ ok: true, total: lista.length });

        sendingQueue = true;
        io.emit('send:start', { total: lista.length });

        const report = { enviados: [], falhas: [] };

        for (let i = 0; i < lista.length; i++) {
            const c = lista[i];
            const msgFinal = (c.mensagem || mensagem || 'Olá {nome}!')
                .replace(/{nome}/g, c.nome)
                .replace(/{numero}/g, c.numero);

            io.emit('send:progress', {
                index: i + 1,
                total: lista.length,
                nome: c.nome,
                numero: c.numero,
            });

            try {
                const whatsappId = await resolveNumber(c.numero);
                if (media) {
                    await client.sendMessage(whatsappId, msgFinal, { media });
                } else {
                    await client.sendMessage(whatsappId, msgFinal);
                }
                if (c.id) db.registrarEnvio(c.id, msgFinal, 'ok');
                report.enviados.push(c);
                io.emit('send:item', {
                    ok: true,
                    nome: c.nome,
                    numero: c.numero,
                });
                console.log(`  ✅ ${c.nome}`);
            } catch (err) {
                if (c.id)
                    db.registrarEnvio(c.id, msgFinal, 'erro', err.message);
                report.falhas.push({ ...c, motivo: err.message });
                io.emit('send:item', {
                    ok: false,
                    nome: c.nome,
                    numero: c.numero,
                    motivo: err.message,
                });
                console.log(`  ❌ ${c.nome}: ${err.message}`);
            }

            if (i < lista.length - 1) await sleep(delay);
        }

        sendingQueue = false;
        io.emit('send:done', report);
    });

    // ══════════════════════════════════════════════════
    //  CSV — IMPORTAR clients.csv
    // ══════════════════════════════════════════════════

    app.get('/api/csv/preview', (req, res) => {
        try {
            res.json(parsearCSV(CSV_PATH));
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/csv/importar', (req, res) => {
        try {
            const { contatos, descartados, total } = parsearCSV(CSV_PATH);
            const resultado = db.importarContatos(contatos);
            res.json({
                total,
                validos: contatos.length,
                inseridos: resultado.inseridos,
                duplicados: resultado.duplicados,
                descartados,
            });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // ══════════════════════════════════════════════════
    //  GROQ — GERAR MENSAGENS COM IA
    // ══════════════════════════════════════════════════

    app.post('/api/groq/gerar', async (req, res) => {
        const { ids, contexto } = req.body;
        if (!contexto?.trim())
            return res
                .status(400)
                .json({ error: 'Informe o contexto/objetivo da mensagem' });
        if (!ids?.length)
            return res
                .status(400)
                .json({ error: 'Selecione ao menos um contato' });

        const todos = db.listarContatos();
        const contatos = todos.filter((c) => ids.includes(c.id));
        if (!contatos.length)
            return res.status(404).json({ error: 'Contatos não encontrados' });

        io.emit('groq:start', { total: contatos.length });

        try {
            io.emit('groq:status', '🤖 Gerando template com IA...');
            const template = await gerarTemplate(contexto);
            io.emit(
                'groq:status',
                `✅ Template gerado! Aplicando para ${contatos.length} pacientes...`,
            );
            const resultado = aplicarTemplate(template, contatos);
            io.emit('groq:done', { template, resultado });
            res.json({ ok: true, template, resultado, total: contatos.length });
        } catch (err) {
            io.emit('groq:erro', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    // ══════════════════════════════════════════════════
    //  BOT — CONFIGURAÇÃO
    // ══════════════════════════════════════════════════

    app.get('/api/bot/config', (req, res) => {
        res.json(bot.getConfig());
    });

    app.put('/api/bot/config', (req, res) => {
        bot.updateConfig(req.body);
        res.json({ ok: true });
    });

    app.get('/api/bot/conversations', (req, res) => {
        const entries = [];
        bot.conversations.forEach((conv, phone) => {
            entries.push({ phone, state: conv.state, context: conv.context });
        });
        res.json(entries);
    });

    app.post('/api/bot/reset', (req, res) => {
        const { phone } = req.body;
        if (phone) {
            bot.resetConversation(phone);
            res.json({ ok: true, phone });
        } else {
            bot.conversations.clear();
            res.json({ ok: true, resetAll: true });
        }
    });

    // ─── Expõe estado interno (útil para testes) ──────
    app._state = () => ({
        clientReady,
        clientInfo,
        ultimoQR,
        statusAtual,
        sendingQueue,
        botEnabled: bot.config.enabled,
    });
    app._setClientReady = (val, info = null) => {
        clientReady = val;
        clientInfo = info;
        if (!val) ultimoQR = null;
    };
    app._setSendingQueue = (val) => {
        sendingQueue = val;
    };
    app._setStatus = (val) => {
        statusAtual = val;
    };

    return { app, server, io, client, bot };
}

// ─── Exporta a factory ────────────────────────────────
module.exports = { createApp };

/* c8 ignore start */
// ─── Inicia quando executado diretamente ─────────────
if (require.main === module) {
    console.log('🚀 Iniciando servidor...\n');

    const { server, client } = createApp();

    client.initialize();

    server.on('error', (e) => {
        if (e.code === 'EADDRINUSE') {
            console.error(`\n❌ Porta ${PORT} já está em uso!`);
            console.error(
                `   Rode: kill -9 $(ss -tlnp | grep ${PORT} | grep -oP 'pid=\\K[0-9]+')`,
            );
            console.error(`   Depois tente novamente.\n`);
            process.exit(1);
        }
    });

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 Local:        http://localhost:${PORT}`);
        console.log(`🌐 Rede local:   http://SEU_IP_WINDOWS:${PORT}`);
        const db = require('./db');
        const r = db.resumo();
        console.log(
            `🗄️  Banco: ${r.total_contatos} contatos | ${r.total_envios} envios registrados\n`,
        );
    });
}
/* c8 ignore stop */
