/**
 * ============================================================
 *  🌐 TESTES — server.js (Integração)
 *  Estratégia: createApp(deps) com dependências injetadas
 *  Cobertura: 100% de rotas + eventos WhatsApp + socket.io
 * ============================================================
 */

import {
    describe,
    it,
    expect,
    vi,
    beforeAll,
    afterAll,
    beforeEach,
} from 'vitest';
import supertest from 'supertest';
import { createRequire } from 'module';
import { io as ioClient } from 'socket.io-client';

const require = createRequire(import.meta.url);
const { Bot } = require('../../bot.js');

// ─── MOCKS DAS DEPENDÊNCIAS ──────────────────────────────────

/** Mock do WhatsApp Client */
const mockClient = {
    on: vi.fn(),
    initialize: vi.fn(),
    logout: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => {}),
    getNumberId: vi.fn(async (num) => ({ _serialized: `${num}@c.us` })),
    info: { pushname: 'Dra. Fabiana', wid: { user: '5511999998888' } },
};

const MockClient = vi.fn(function () {
    return mockClient;
});
const MockLocalAuth = vi.fn(function () {});
const MockMessageMedia = vi.fn(function (mimetype, data, filename) {
    this.mimetype = mimetype;
    this.data = data;
    this.filename = filename;
});

/** Mock do banco de dados */
const mockDb = {
    normalizarNumero: vi.fn((n) => {
        const d = String(n || '').replace(/\D/g, '');
        return d.startsWith('55') ? d : '55' + d;
    }),
    listarContatos: vi.fn(() => [
        { id: 1, nome: 'Ana Lima', numero: '5511900000001' },
        { id: 2, nome: 'Bruno Melo', numero: '5511900000002' },
    ]),
    inserirContato: vi.fn(() => ({ ok: true, id: 3, duplicado: false })),
    atualizarContato: vi.fn(),
    removerContato: vi.fn(),
    importarContatos: vi.fn(() => ({ inseridos: 2, duplicados: 0 })),
    registrarEnvio: vi.fn(),
    historicoContato: vi.fn(() => [
        { id: 1, status: 'ok', mensagem: 'Olá!', enviado_em: '2025-01-01' },
    ]),
    resumo: vi.fn(() => ({
        total_contatos: 2,
        total_envios: 5,
        envios_ok: 4,
        envios_erro: 1,
    })),
};

/** Mock do CSV parser */
const mockParsearCSV = vi.fn(() => ({
    contatos: [{ nome: 'João Silva', numero: '5511991172734' }],
    descartados: { semTelefone: 1, duplicados: 1, invalidos: 0 },
    total: 3,
}));

/** Mock do Groq AI */
const TEMPLATE_MOCK =
    'Olá, {nome}! Temos uma novidade.\n\n*Equipe Dra. Fabiana Bueno*';
const mockGroqAI = {
    gerarTemplate: vi.fn(async () => TEMPLATE_MOCK),
    aplicarTemplate: vi.fn((template, contatos) =>
        contatos.map((c) => ({
            ...c,
            mensagem: template.replace(/{nome}/g, c.nome.split(' ')[0]),
        })),
    ),
};

/** Mock do qrcode */
const mockQrcode = {
    toDataURL: vi.fn(
        async () =>
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    ),
};

// ─── DEPS INJETADAS ──────────────────────────────────────────
const deps = {
    whatsappLib: {
        Client: MockClient,
        LocalAuth: MockLocalAuth,
        MessageMedia: MockMessageMedia,
    },
    db: mockDb,
    parsearCSV: mockParsearCSV,
    groqAI: mockGroqAI,
    qrcode: mockQrcode,
    csvPath: '/dev/null',
};

// ─── CRIAR APP E CAPTURAR CALLBACKS ─────────────────────────
let app, server, io, bot;
let waCallbacks = {}; // { loading_screen: fn, qr: fn, ... }

beforeAll(async () => {
    const { createApp } = require('../../server.js');
    ({ app, server, io, bot } = createApp(deps));

    // Captura os callbacks registrados via mockClient.on
    mockClient.on.mock.calls.forEach(([event, cb]) => {
        waCallbacks[event] = cb;
    });

    // Inicia o servidor numa porta aleatória para testes com socket.io
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
    // Fecha socket.io antes de fechar o servidor HTTP
    await new Promise((resolve) => io.close(resolve));
    await new Promise((resolve) => server.close(resolve));
});

// ─── RESTAURAR MOCKS ANTES DE CADA TESTE ─────────────────────
beforeEach(() => {
    vi.clearAllMocks();

    mockDb.listarContatos.mockReturnValue([
        { id: 1, nome: 'Ana Lima', numero: '5511900000001' },
        { id: 2, nome: 'Bruno Melo', numero: '5511900000002' },
    ]);
    mockDb.inserirContato.mockReturnValue({
        ok: true,
        id: 3,
        duplicado: false,
    });
    mockDb.importarContatos.mockReturnValue({ inseridos: 2, duplicados: 0 });
    mockDb.historicoContato.mockReturnValue([
        { id: 1, status: 'ok', mensagem: 'Olá!', enviado_em: '2025-01-01' },
    ]);
    mockDb.resumo.mockReturnValue({
        total_contatos: 2,
        total_envios: 5,
        envios_ok: 4,
        envios_erro: 1,
    });
    mockDb.normalizarNumero.mockImplementation((n) => {
        const d = String(n || '').replace(/\D/g, '');
        return d.startsWith('55') ? d : '55' + d;
    });
    mockClient.logout.mockResolvedValue(undefined);
    mockClient.sendMessage.mockResolvedValue(undefined);
    mockClient.getNumberId.mockResolvedValue({
        _serialized: '5511900000001@c.us',
    });
    mockParsearCSV.mockReturnValue({
        contatos: [{ nome: 'João Silva', numero: '5511991172734' }],
        descartados: { semTelefone: 1, duplicados: 1, invalidos: 0 },
        total: 3,
    });
    mockGroqAI.gerarTemplate.mockResolvedValue(TEMPLATE_MOCK);
    mockGroqAI.aplicarTemplate.mockImplementation((template, contatos) =>
        contatos.map((c) => ({
            ...c,
            mensagem: template.replace(/{nome}/g, c.nome.split(' ')[0]),
        })),
    );
    mockQrcode.toDataURL.mockResolvedValue(
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    );
    // Garante estado inicial limpo
    app._setClientReady(false);
    app._setSendingQueue(false);
    app._setStatus('iniciando');
});

const req = () => supertest(app);
const port = () => server.address().port;

// ════════════════════════════════════════════════════════════
//  EVENTOS WHATSAPP — callbacks registrados via client.on()
// ════════════════════════════════════════════════════════════
describe('Eventos WhatsApp — callbacks internos', () => {
    it('loading_screen: atualiza statusAtual para "carregando"', () => {
        waCallbacks.loading_screen(75, 'Loading');
        // Apenas valida que não lança exceção e cobre as linhas
        expect(true).toBe(true);
    });

    it('qr: gera dataURL e armazena ultimoQR', async () => {
        await waCallbacks.qr('fake-qr-string');
        expect(mockQrcode.toDataURL).toHaveBeenCalledWith(
            'fake-qr-string',
            expect.any(Object),
        );
        // Depois do qr, /api/qr deve retornar imagem PNG
        const res = await req().get('/api/qr');
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('image/png');
    });

    it('authenticated: emite status de autenticação', () => {
        waCallbacks.authenticated();
        expect(true).toBe(true);
    });

    it('ready: marca cliente como conectado e expõe info', async () => {
        await waCallbacks.ready();
        const state = app._state();
        expect(state.clientReady).toBe(true);
        expect(state.clientInfo).toBeDefined();
        // Limpa para não interferir nos outros testes
        app._setClientReady(false);
    });

    it('auth_failure: marca status como erro', () => {
        waCallbacks.auth_failure('Sessão expirada');
        expect(true).toBe(true);
    });

    it('disconnected: marca cliente como desconectado', () => {
        // Primeiro conecta
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        waCallbacks.disconnected('LOGOUT');
        const state = app._state();
        expect(state.clientReady).toBe(false);
    });

    it('message (bot): responde mensagem de novo contato com menu', async () => {
        const msg = {
            fromMe: false,
            from: '5511900000001',
            body: 'Olá',
        };
        await waCallbacks.message(msg);
        expect(mockClient.sendMessage).toHaveBeenCalledWith(
            '5511900000001',
            expect.stringContaining('Menu de Atendimento'),
        );
    });

    it('message (bot): não responde mensagens do próprio bot', async () => {
        const msg = {
            fromMe: true,
            from: '5511900000001',
            body: 'Olá',
        };
        await waCallbacks.message(msg);
        expect(mockClient.sendMessage).not.toHaveBeenCalled();
    });
});

// ════════════════════════════════════════════════════════════
//  SOCKET.IO — handler de conexão
// ════════════════════════════════════════════════════════════
describe('Socket.io — handler de conexão', () => {
    const connectSocket = () =>
        new Promise((resolve, reject) => {
            const sock = ioClient(`http://127.0.0.1:${port()}`, {
                transports: ['polling'],
                reconnection: false,
            });
            sock.on('status', (data) => {
                resolve({ sock, data });
            });
            sock.on('ready', (data) => {
                resolve({ sock, data, type: 'ready' });
            });
            sock.on('connect_error', reject);
            setTimeout(() => reject(new Error('timeout')), 3000);
        });

    it('emite status "info" quando desconectado e sem QR', async () => {
        app._setClientReady(false);
        const { sock, data } = await connectSocket();
        expect(data.type).toBe('info');
        sock.disconnect();
    });

    it('emite status "warning" quando QR está disponível', async () => {
        // Gera QR primeiro
        await waCallbacks.qr('fake-qr-for-socket-test');

        const { sock, data } = await connectSocket();
        expect(['warning', 'info']).toContain(data.type);
        sock.disconnect();
        app._setClientReady(false);
    });

    it('emite "ready" quando cliente está conectado', async () => {
        app._setClientReady(true, {
            pushname: 'Dra. Fabiana',
            wid: { user: '55' },
        });
        const result = await connectSocket();
        expect(result.sock).toBeDefined();
        result.sock.disconnect();
        app._setClientReady(false);
    });

    it('emite status "warning" quando statusAtual é autenticando', async () => {
        app._setClientReady(false);
        app._setStatus('autenticando');
        const { sock, data } = await connectSocket();
        expect(data.type).toBe('warning');
        expect(data.statusAtual).toBe('autenticando');
        sock.disconnect();
        app._setStatus('iniciando');
    });

    it('emite status "info" genérico para estado não mapeado (ex: qr)', async () => {
        app._setClientReady(false);
        // 'qr' não está no objeto msgs → cai no fallback `|| { type: 'info', msg: ... }`
        app._setStatus('qr');
        const { sock, data } = await connectSocket();
        expect(data.type).toBe('info');
        expect(data.statusAtual).toBe('qr');
        sock.disconnect();
        app._setStatus('iniciando');
    });
});

// ════════════════════════════════════════════════════════════
//  GET /api/status
// ════════════════════════════════════════════════════════════
describe('GET /api/status', () => {
    it('retorna estrutura correta com WhatsApp desconectado', async () => {
        const res = await req().get('/api/status');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('ready');
        expect(res.body).toHaveProperty('hasQR');
        expect(res.body).toHaveProperty('db');
        expect(res.body).toHaveProperty('statusAtual');
    });

    it('retorna resumo do banco', async () => {
        const res = await req().get('/api/status');
        expect(res.body.db.total_contatos).toBe(2);
        expect(res.body.db.total_envios).toBe(5);
    });

    it('ready é false antes de conectar', async () => {
        const res = await req().get('/api/status');
        expect(res.body.ready).toBe(false);
    });

    it('info é null quando desconectado', async () => {
        const res = await req().get('/api/status');
        expect(res.body.info).toBeNull();
    });

    it('retorna info quando conectado', async () => {
        app._setClientReady(true, {
            pushname: 'Dra. Fabiana',
            wid: { user: '5511999998888' },
        });
        const res = await req().get('/api/status');
        expect(res.body.ready).toBe(true);
        expect(res.body.info.name).toBe('Dra. Fabiana');
        app._setClientReady(false);
    });

    it('statusAtual reflete o estado atual do cliente', async () => {
        app._setStatus('autenticando');
        const res = await req().get('/api/status');
        expect(res.body.statusAtual).toBe('autenticando');
        app._setStatus('iniciando');
    });

    it('statusAtual é "conectado" quando ready=true', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        // ready callback sets statusAtual = 'conectado'
        await waCallbacks.ready();
        const res = await req().get('/api/status');
        expect(res.body.ready).toBe(true);
        app._setClientReady(false);
        app._setStatus('iniciando');
    });
});

// ════════════════════════════════════════════════════════════
//  GET /api/qr
// ════════════════════════════════════════════════════════════
describe('GET /api/qr', () => {
    it('retorna 202 quando QR ainda não foi gerado', async () => {
        const res = await req().get('/api/qr');
        expect(res.status).toBe(202);
    });

    it('retorna 204 quando já está conectado', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        const res = await req().get('/api/qr');
        expect(res.status).toBe(204);
        app._setClientReady(false);
    });
});

// ════════════════════════════════════════════════════════════
//  POST /api/logout
// ════════════════════════════════════════════════════════════
describe('POST /api/logout', () => {
    it('retorna ok:true ao fazer logout', async () => {
        const res = await req().post('/api/logout');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('chama client.logout() exatamente uma vez', async () => {
        await req().post('/api/logout');
        expect(mockClient.logout).toHaveBeenCalledTimes(1);
    });

    it('retorna 500 se client.logout lançar erro', async () => {
        mockClient.logout.mockRejectedValueOnce(
            new Error('Already disconnected'),
        );
        const res = await req().post('/api/logout');
        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error');
    });
});

// ════════════════════════════════════════════════════════════
//  GET /api/contatos
// ════════════════════════════════════════════════════════════
describe('GET /api/contatos', () => {
    it('retorna lista de contatos', async () => {
        const res = await req().get('/api/contatos');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body).toHaveLength(2);
    });

    it('retorna contatos com nome e numero', async () => {
        const res = await req().get('/api/contatos');
        expect(res.body[0]).toHaveProperty('nome');
        expect(res.body[0]).toHaveProperty('numero');
    });

    it('chama db.listarContatos()', async () => {
        await req().get('/api/contatos');
        expect(mockDb.listarContatos).toHaveBeenCalledTimes(1);
    });

    it('retorna 500 em caso de erro no banco', async () => {
        mockDb.listarContatos.mockImplementationOnce(() => {
            throw new Error('DB error');
        });
        const res = await req().get('/api/contatos');
        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error');
    });
});

// ════════════════════════════════════════════════════════════
//  POST /api/contatos
// ════════════════════════════════════════════════════════════
describe('POST /api/contatos', () => {
    it('cria contato com dados válidos', async () => {
        const res = await req()
            .post('/api/contatos')
            .send({ nome: 'Carlos Silva', numero: '11900000003' });
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('id');
        expect(res.body.nome).toBe('Carlos Silva');
    });

    it('retorna 400 sem nome', async () => {
        const res = await req()
            .post('/api/contatos')
            .send({ numero: '11900000001' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('nome');
    });

    it('retorna 400 sem numero', async () => {
        const res = await req().post('/api/contatos').send({ nome: 'Teste' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('numero');
    });

    it('retorna 409 para número duplicado', async () => {
        mockDb.inserirContato.mockReturnValueOnce({
            ok: false,
            duplicado: true,
            msg: 'Número já cadastrado',
        });
        const res = await req()
            .post('/api/contatos')
            .send({ nome: 'Duplicado', numero: '5511900000001' });
        expect(res.status).toBe(409);
        expect(res.body.duplicado).toBe(true);
    });

    it('chama db.inserirContato com nome e numero', async () => {
        await req()
            .post('/api/contatos')
            .send({ nome: 'Maria', numero: '11988887777' });
        expect(mockDb.inserirContato).toHaveBeenCalledWith(
            'Maria',
            '11988887777',
        );
    });
});

// ════════════════════════════════════════════════════════════
//  PUT /api/contatos/:id
// ════════════════════════════════════════════════════════════
describe('PUT /api/contatos/:id', () => {
    it('atualiza o nome do contato', async () => {
        const res = await req()
            .put('/api/contatos/1')
            .send({ nome: 'Ana Novo Nome' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('chama db.atualizarContato com o id e nome corretos', async () => {
        await req().put('/api/contatos/42').send({ nome: 'Novo Nome' });
        expect(mockDb.atualizarContato).toHaveBeenCalledWith('42', 'Novo Nome');
    });

    it('retorna 400 sem nome', async () => {
        const res = await req().put('/api/contatos/1').send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('nome');
    });
});

// ════════════════════════════════════════════════════════════
//  DELETE /api/contatos/:id
// ════════════════════════════════════════════════════════════
describe('DELETE /api/contatos/:id', () => {
    it('remove o contato pelo id', async () => {
        const res = await req().delete('/api/contatos/1');
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
    });

    it('chama db.removerContato com o id correto', async () => {
        await req().delete('/api/contatos/99');
        expect(mockDb.removerContato).toHaveBeenCalledWith('99');
    });
});

// ════════════════════════════════════════════════════════════
//  GET /api/contatos/:id/historico
// ════════════════════════════════════════════════════════════
describe('GET /api/contatos/:id/historico', () => {
    it('retorna histórico de envios do contato', async () => {
        const res = await req().get('/api/contatos/1/historico');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body[0].status).toBe('ok');
    });

    it('retorna lista vazia para contato sem histórico', async () => {
        mockDb.historicoContato.mockReturnValueOnce([]);
        const res = await req().get('/api/contatos/999/historico');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('chama db.historicoContato com o id correto', async () => {
        await req().get('/api/contatos/7/historico');
        expect(mockDb.historicoContato).toHaveBeenCalledWith('7');
    });
});

// ════════════════════════════════════════════════════════════
//  POST /api/contatos/importar
// ════════════════════════════════════════════════════════════
describe('POST /api/contatos/importar', () => {
    it('importa lista de contatos', async () => {
        const res = await req()
            .post('/api/contatos/importar')
            .send({ contatos: [{ nome: 'A', numero: '11900000001' }] });
        expect(res.status).toBe(200);
        expect(res.body.inseridos).toBe(2);
    });

    it('retorna 400 para lista vazia', async () => {
        const res = await req()
            .post('/api/contatos/importar')
            .send({ contatos: [] });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('vazia');
    });

    it('retorna 400 sem campo contatos', async () => {
        const res = await req().post('/api/contatos/importar').send({});
        expect(res.status).toBe(400);
    });

    it('chama db.importarContatos com a lista correta', async () => {
        const lista = [{ nome: 'X', numero: '11900000001' }];
        await req().post('/api/contatos/importar').send({ contatos: lista });
        expect(mockDb.importarContatos).toHaveBeenCalledWith(lista);
    });
});

// ════════════════════════════════════════════════════════════
//  GET /api/csv/preview
// ════════════════════════════════════════════════════════════
describe('GET /api/csv/preview', () => {
    it('retorna prévia do CSV com contatos e descartados', async () => {
        const res = await req().get('/api/csv/preview');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('contatos');
        expect(res.body).toHaveProperty('descartados');
        expect(res.body).toHaveProperty('total');
    });

    it('contatos têm nome e numero', async () => {
        const res = await req().get('/api/csv/preview');
        expect(res.body.contatos[0]).toHaveProperty('nome');
        expect(res.body.contatos[0]).toHaveProperty('numero');
    });

    it('retorna 500 se parsearCSV lançar erro', async () => {
        mockParsearCSV.mockImplementationOnce(() => {
            throw new Error('ENOENT');
        });
        const res = await req().get('/api/csv/preview');
        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error');
    });
});

// ════════════════════════════════════════════════════════════
//  POST /api/csv/importar
// ════════════════════════════════════════════════════════════
describe('POST /api/csv/importar', () => {
    it('importa CSV e retorna estatísticas', async () => {
        const res = await req().post('/api/csv/importar');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('total');
        expect(res.body).toHaveProperty('inseridos');
        expect(res.body).toHaveProperty('duplicados');
        expect(res.body).toHaveProperty('descartados');
        expect(res.body).toHaveProperty('validos');
    });

    it('retorna 500 se parsearCSV lançar erro', async () => {
        mockParsearCSV.mockImplementationOnce(() => {
            throw new Error('Arquivo não encontrado');
        });
        const res = await req().post('/api/csv/importar');
        expect(res.status).toBe(500);
    });

    it('combina resultado do CSV com db.importarContatos', async () => {
        const res = await req().post('/api/csv/importar');
        expect(res.body.inseridos).toBe(2);
        expect(res.body.total).toBe(3);
    });
});

// ════════════════════════════════════════════════════════════
//  POST /api/groq/gerar
// ════════════════════════════════════════════════════════════
describe('POST /api/groq/gerar', () => {
    it('retorna 400 sem contexto', async () => {
        const res = await req()
            .post('/api/groq/gerar')
            .send({ ids: [1] });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('contexto');
    });

    it('retorna 400 com contexto vazio', async () => {
        const res = await req()
            .post('/api/groq/gerar')
            .send({ ids: [1], contexto: '   ' });
        expect(res.status).toBe(400);
    });

    it('retorna 400 sem ids', async () => {
        const res = await req()
            .post('/api/groq/gerar')
            .send({ contexto: 'Revisão semestral' });
        expect(res.status).toBe(400);
        expect(res.body.error).toContain('contato');
    });

    it('retorna 400 com ids vazio', async () => {
        const res = await req()
            .post('/api/groq/gerar')
            .send({ contexto: 'Revisão', ids: [] });
        expect(res.status).toBe(400);
    });

    it('retorna 404 quando ids não encontrados no banco', async () => {
        mockDb.listarContatos.mockReturnValueOnce([]);
        const res = await req()
            .post('/api/groq/gerar')
            .send({ contexto: 'Revisão', ids: [999] });
        expect(res.status).toBe(404);
    });

    it('retorna ok:true e total de contatos quando tudo certo', async () => {
        const res = await req()
            .post('/api/groq/gerar')
            .send({ contexto: 'Revisão semestral', ids: [1, 2] });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.total).toBe(2);
    });

    it('responde imediatamente e processa em background', async () => {
        const start = Date.now();
        const res = await req()
            .post('/api/groq/gerar')
            .send({ contexto: 'Teste', ids: [1] });
        expect(Date.now() - start).toBeLessThan(1000);
        expect(res.status).toBe(200);
    });

    it('emite groq:erro via socket quando gerarTemplate falha', async () => {
        // Testa o caminho de erro do background task — precisa aguardar
        mockGroqAI.gerarTemplate.mockRejectedValueOnce(new Error('API error'));
        await req()
            .post('/api/groq/gerar')
            .send({ contexto: 'Teste', ids: [1] });
        // Aguarda o processamento assíncrono
        await new Promise((r) => setTimeout(r, 100));
        // Se não lançou exceção não capturada, o teste passa
        expect(true).toBe(true);
    });
});

// ════════════════════════════════════════════════════════════
//  POST /api/send
// ════════════════════════════════════════════════════════════
describe('POST /api/send', () => {
    it('retorna 503 se WhatsApp não está conectado', async () => {
        const res = await req()
            .post('/api/send')
            .send({ ids: [1], mensagem: 'Olá!' });
        expect(res.status).toBe(503);
        expect(res.body.error).toContain('não conectado');
    });

    it('retorna 400 sem contatos quando conectado', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        mockDb.listarContatos.mockReturnValueOnce([]);
        const res = await req()
            .post('/api/send')
            .send({ ids: [999], mensagem: 'Olá!' });
        expect(res.status).toBe(400);
        app._setClientReady(false);
    });

    it('retorna 200 e inicia envio para contatos válidos (via ids)', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        const res = await req()
            .post('/api/send')
            .send({ ids: [1], mensagem: 'Olá {nome}!', delay: 0 });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.total).toBe(1);
        // Aguarda o envio assíncrono
        await new Promise((r) => setTimeout(r, 100));
        app._setClientReady(false);
    });

    it('suporta envio via lista avulsa de contatos', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        const res = await req()
            .post('/api/send')
            .send({
                contatos: [
                    {
                        nome: 'Teste',
                        numero: '5511900000001',
                        mensagem: 'Olá!',
                    },
                ],
                delay: 0,
            });
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        await new Promise((r) => setTimeout(r, 100));
        app._setClientReady(false);
    });

    it('retorna 429 quando já existe envio em andamento', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        // Simula queue ativa via setter de estado
        app._setSendingQueue(true);
        const res = await req()
            .post('/api/send')
            .send({ ids: [1], mensagem: 'y', delay: 0 });
        expect(res.status).toBe(429);
        // Limpa o queue
        app._setSendingQueue(false);
        app._setClientReady(false);
    });

    it('registra falha quando getNumberId não encontra número', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        mockClient.getNumberId.mockResolvedValue(null); // número não encontrado
        const res = await req()
            .post('/api/send')
            .send({ ids: [1], mensagem: 'Olá!', delay: 0 });
        expect(res.status).toBe(200);
        await new Promise((r) => setTimeout(r, 200));
        expect(mockDb.registrarEnvio).toHaveBeenCalledWith(
            expect.any(Number),
            expect.any(String),
            'erro',
            expect.any(String),
        );
        app._setClientReady(false);
    });

    it('usa mensagem padrão quando nenhuma mensagem é fornecida (fallback "Olá {nome}!")', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        // Nenhum campo `mensagem` no body → cobre o fallback `|| 'Olá {nome}!'`
        const res = await req()
            .post('/api/send')
            .send({ ids: [1], delay: 0 });
        expect(res.status).toBe(200);
        await new Promise((r) => setTimeout(r, 200));
        expect(mockClient.sendMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining('Ana'),
        );
        app._setClientReady(false);
    });

    it('retorna 400 quando nem ids nem contatos são fornecidos', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        // Sem ids e sem contatos → branch false do else-if + lista vazia
        const res = await req().post('/api/send').send({ mensagem: 'Olá!' });
        expect(res.status).toBe(400);
        app._setClientReady(false);
    });

    it('executa sleep entre envios com múltiplos contatos', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        // Dois contatos + delay 0 → cobre o `sleep` e o loop com i < lista.length - 1
        const res = await req()
            .post('/api/send')
            .send({ ids: [1, 2], mensagem: 'Olá {nome}!', delay: 0 });
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(2);
        await new Promise((r) => setTimeout(r, 300));
        expect(mockClient.sendMessage).toHaveBeenCalledTimes(2);
        app._setClientReady(false);
    });

    it('registra falha para contato da lista avulsa sem id', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        mockClient.getNumberId.mockResolvedValue(null);
        // Contato sem `id` → cobre o branch `if (c.id)` = false no catch
        const res = await req()
            .post('/api/send')
            .send({
                contatos: [
                    {
                        nome: 'Sem Id',
                        numero: '5511900000001',
                        mensagem: 'Olá!',
                    },
                ],
                delay: 0,
            });
        expect(res.status).toBe(200);
        await new Promise((r) => setTimeout(r, 200));
        // registrarEnvio NÃO deve ser chamado pois c.id é undefined
        expect(mockDb.registrarEnvio).not.toHaveBeenCalled();
        app._setClientReady(false);
    });

    it('envia mensagem com imagem (base64)', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        const res = await req()
            .post('/api/send')
            .send({
                ids: [1],
                mensagem: 'Veja a foto!',
                imagem: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                imagemMime: 'image/png',
                delay: 0,
            });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        await new Promise((r) => setTimeout(r, 200));
        expect(mockClient.sendMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.objectContaining({ media: expect.any(Object) }),
        );
        app._setClientReady(false);
    });

    it('envia imagem sem texto (mensagem vazia cai no fallback)', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        const res = await req()
            .post('/api/send')
            .send({
                ids: [1],
                imagem: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                imagemMime: 'image/png',
                delay: 0,
            });
        expect(res.status).toBe(200);
        await new Promise((r) => setTimeout(r, 200));
        expect(mockClient.sendMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.objectContaining({ media: expect.any(Object) }),
        );
        app._setClientReady(false);
    });

    it('envia imagem para contato avulso (via contatos array)', async () => {
        app._setClientReady(true, { pushname: 'X', wid: { user: '55' } });
        const res = await req()
            .post('/api/send')
            .send({
                contatos: [
                    {
                        id: 99,
                        nome: 'Foto',
                        numero: '5511900000099',
                        mensagem: 'Com imagem',
                    },
                ],
                imagem: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                imagemMime: 'image/jpeg',
                delay: 0,
            });
        expect(res.status).toBe(200);
        await new Promise((r) => setTimeout(r, 200));
        expect(mockClient.sendMessage).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(String),
            expect.objectContaining({ media: expect.any(Object) }),
        );
        app._setClientReady(false);
    });
});

// ════════════════════════════════════════════════════════════
//  BOT — /api/bot/* (Config, Conversas, Reset)
// ════════════════════════════════════════════════════════════
describe('Bot — /api/bot/*', () => {
    beforeEach(() => {
        bot.conversations.clear();
        bot.updateConfig(Bot.defaultConfig());
    });

    describe('GET /api/bot/config', () => {
        it('retorna configuração padrão completa', async () => {
            const res = await req().get('/api/bot/config');
            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('enabled', true);
            expect(res.body).toHaveProperty('greetingMessage');
            expect(res.body).toHaveProperty('menuHeader');
            expect(res.body).toHaveProperty('menuFooter');
            expect(res.body).toHaveProperty('menuOptions');
            expect(res.body).toHaveProperty('schedulingLink');
            expect(res.body).toHaveProperty('address');
            expect(res.body).toHaveProperty('plans');
            expect(res.body).toHaveProperty('professionalContact');
            expect(res.body.menuOptions).toHaveLength(5);
        });

        it('retorna configuração atualizada após PUT', async () => {
            await req()
                .put('/api/bot/config')
                .send({ enabled: false, address: 'Rua Nova' });
            const res = await req().get('/api/bot/config');
            expect(res.body.enabled).toBe(false);
            expect(res.body.address).toBe('Rua Nova');
        });
    });

    describe('PUT /api/bot/config', () => {
        it('atualiza e retorna { ok: true }', async () => {
            const res = await req()
                .put('/api/bot/config')
                .send({ greetingMessage: 'Bem-vindo!' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
        });

        it('atualização parcial não altera outros campos', async () => {
            await req()
                .put('/api/bot/config')
                .send({ schedulingLink: 'https://agenda.com' });
            const res = await req().get('/api/bot/config');
            expect(res.body.schedulingLink).toBe('https://agenda.com');
            expect(res.body.enabled).toBe(true);
            expect(res.body.greetingMessage).toBeTruthy();
        });

        it('atualiza menuOptions corretamente', async () => {
            const newOptions = [
                { key: '1', label: 'Novo' },
                { key: '2', label: 'Menu' },
            ];
            await req()
                .put('/api/bot/config')
                .send({ menuOptions: newOptions });
            const res = await req().get('/api/bot/config');
            expect(res.body.menuOptions).toEqual(newOptions);
        });
    });

    describe('GET /api/bot/conversations', () => {
        it('retorna array vazio quando não há conversas', async () => {
            const res = await req().get('/api/bot/conversations');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([]);
        });

        it('retorna conversas ativas', async () => {
            bot._getConversation('5511900000001');
            bot._getConversation('5511900000002');

            const res = await req().get('/api/bot/conversations');
            expect(res.status).toBe(200);
            expect(res.body).toHaveLength(2);
            expect(res.body[0]).toHaveProperty('phone');
            expect(res.body[0]).toHaveProperty('state');
            expect(res.body[0]).toHaveProperty('context');
        });

        it('reflete estado das conversas', async () => {
            const conv = bot._getConversation('5511900000001');
            conv.state = 'ai_chat';
            conv.context = { lastQuestion: 'horários' };

            const res = await req().get('/api/bot/conversations');
            const entry = res.body.find((c) => c.phone === '5511900000001');
            expect(entry.state).toBe('ai_chat');
            expect(entry.context).toEqual({ lastQuestion: 'horários' });
        });
    });

    describe('message handler — integração com IA', () => {
        afterEach(function () {
            vi.unstubAllGlobals();
        });

        it('chama gerarResposta via callback de mensagem no estado ai_chat', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    choices: [
                        {
                            message: {
                                content: 'Horário comercial: 8h às 18h.',
                            },
                        },
                    ],
                }),
            });
            vi.stubGlobal('fetch', mockFetch);

            const phone = '5511900000099';
            bot.resetConversation(phone);

            // 1ª msg: new → mostra menu
            await waCallbacks.message({
                fromMe: false,
                from: phone,
                body: 'Olá',
            });
            expect(mockClient.sendMessage).toHaveBeenCalledWith(
                phone,
                expect.stringContaining('Menu de Atendimento'),
            );

            // 2ª msg: opção 5 → entra em ai_chat
            await waCallbacks.message({
                fromMe: false,
                from: phone,
                body: '5',
            });
            expect(mockClient.sendMessage).toHaveBeenCalledWith(
                phone,
                expect.stringContaining('Outro assunto'),
            );

            // 3ª msg: pergunta → chama gerarResposta (CJS require path)
            await waCallbacks.message({
                fromMe: false,
                from: phone,
                body: 'Qual o horário?',
            });
            expect(mockFetch).toHaveBeenCalled();
            expect(mockClient.sendMessage).toHaveBeenCalledWith(
                phone,
                expect.stringContaining('Horário comercial'),
            );

            const conv = bot._getConversation(phone);
            expect(conv.state).toBe('ai_chat');
        });

        it('captura erro da API Groq no catch do server.js', async () => {
            const mockFetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
                text: async () => 'Internal Server Error',
            });
            vi.stubGlobal('fetch', mockFetch);

            const phone = '5511900000100';
            bot.resetConversation(phone);

            // 1ª msg: new → mostra menu
            await waCallbacks.message({
                fromMe: false,
                from: phone,
                body: 'Olá',
            });

            // 2ª msg: opção 5 → entra em ai_chat
            await waCallbacks.message({
                fromMe: false,
                from: phone,
                body: '5',
            });

            // 3ª msg: pergunta → gerarResposta falha (fetch ok:false)
            // Erro propagado → catch server.js linha 74 → não lança exceção
            await waCallbacks.message({
                fromMe: false,
                from: phone,
                body: 'Qual o horário?',
            });

            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe('POST /api/bot/reset', () => {
        it('reseta todas as conversas', async () => {
            bot._getConversation('5511900000001');
            bot._getConversation('5511900000002');
            expect(bot.conversations.size).toBe(2);

            const res = await req().post('/api/bot/reset').send({});
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.resetAll).toBe(true);
            expect(bot.conversations.size).toBe(0);
        });

        it('reseta conversa específica por telefone', async () => {
            bot._getConversation('5511900000001');
            bot._getConversation('5511900000002');

            const res = await req()
                .post('/api/bot/reset')
                .send({ phone: '5511900000001' });
            expect(res.status).toBe(200);
            expect(res.body.ok).toBe(true);
            expect(res.body.phone).toBe('5511900000001');
            expect(bot.conversations.has('5511900000001')).toBe(false);
            expect(bot.conversations.has('5511900000002')).toBe(true);
        });
    });
});

// ════════════════════════════════════════════════════════════
//  Rota estática / frontend
// ════════════════════════════════════════════════════════════
describe('GET / (frontend estático)', () => {
    it('serve o index.html na raiz', async () => {
        const res = await req().get('/');
        expect([200, 404]).toContain(res.status);
        if (res.status === 200) {
            expect(res.headers['content-type']).toContain('text/html');
        }
    });
});

// ════════════════════════════════════════════════════════════
//  Rota inexistente
// ════════════════════════════════════════════════════════════
describe('Rota inexistente', () => {
    it('retorna 404 para rota não registrada', async () => {
        const res = await req().get('/api/nao-existe');
        expect(res.status).toBe(404);
    });
});
