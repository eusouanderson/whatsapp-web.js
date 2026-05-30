/**
 * ============================================================
 *  🤖 TESTES — groq-ai.js
 *  Cobertura: gerarTemplate, aplicarTemplate, gerarResposta
 * ============================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
    gerarTemplate,
    aplicarTemplate,
    gerarResposta,
} from '../../groq-ai.js';

// ─── HELPERS ─────────────────────────────────────────────────
const mockGroqResponse = (content) => {
    mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
            choices: [{ message: { content } }],
        }),
    });
};

const mockGroqError = (status = 429, body = 'Rate limit') => {
    mockFetch.mockResolvedValueOnce({
        ok: false,
        status,
        text: async () => body,
    });
};

// ════════════════════════════════════════════════════════════
//  gerarTemplate
// ════════════════════════════════════════════════════════════
describe('gerarTemplate', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    it('retorna o template gerado pela IA', async () => {
        const templateEsperado =
            'Olá, {nome}! 😊\nPassando para lembrar da sua revisão semestral.\n\n*Equipe Dra. Fabiana Bueno*';
        mockGroqResponse(templateEsperado);

        const resultado = await gerarTemplate('Lembrar revisão semestral');
        expect(resultado).toBe(templateEsperado);
    });

    it('faz exatamente 1 chamada à API', async () => {
        mockGroqResponse('Olá, {nome}!');
        await gerarTemplate('qualquer contexto');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('chama a URL correta da API Groq', async () => {
        mockGroqResponse('template');
        await gerarTemplate('contexto');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.groq.com/openai/v1/chat/completions',
            expect.any(Object),
        );
    });

    it('envia Authorization Bearer no header', async () => {
        mockGroqResponse('template');
        await gerarTemplate('contexto');
        const [, options] = mockFetch.mock.calls[0];
        expect(options.headers['Authorization']).toMatch(/^Bearer /);
    });

    it('inclui o contexto no prompt enviado', async () => {
        mockGroqResponse('template');
        const contexto = 'Promoção de limpeza dental em junho';
        await gerarTemplate(contexto);
        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(body.messages[0].content).toContain(contexto);
    });

    it('lança erro quando a API retorna status de erro', async () => {
        mockGroqError(429, 'Rate limit exceeded');
        await expect(gerarTemplate('contexto')).rejects.toThrow('Groq API 429');
    });

    it('remove espaços extras do retorno', async () => {
        mockGroqResponse('  Olá, {nome}!  \n\n');
        const r = await gerarTemplate('contexto');
        expect(r).toBe('Olá, {nome}!');
    });
});

// ════════════════════════════════════════════════════════════
//  aplicarTemplate
// ════════════════════════════════════════════════════════════
describe('aplicarTemplate', () => {
    const template =
        'Olá, {nome}! Temos novidades para você.\n\n*Equipe Dra. Fabiana Bueno*';

    it('substitui {nome} pelo primeiro nome do contato', () => {
        const resultado = aplicarTemplate(template, [
            { id: 1, nome: 'João Silva', numero: '5511900000001' },
        ]);
        expect(resultado[0].mensagem).toContain('Olá, João!');
        expect(resultado[0].mensagem).not.toContain('{nome}');
    });

    it('usa apenas o primeiro nome (não o sobrenome)', () => {
        const resultado = aplicarTemplate(template, [
            { id: 1, nome: 'Maria Aparecida Souza', numero: '5511900000001' },
        ]);
        expect(resultado[0].mensagem).toContain('Maria');
        expect(resultado[0].mensagem).not.toContain('Aparecida');
    });

    it('capitaliza o primeiro nome corretamente', () => {
        const casos = [
            { nome: 'JOÃO SILVA', esperado: 'João' },
            { nome: 'ana beatriz', esperado: 'Ana' },
            { nome: 'cArLoS Lima', esperado: 'Carlos' },
        ];
        casos.forEach(({ nome, esperado }) => {
            const r = aplicarTemplate(template, [
                { id: 1, nome, numero: '5511900000001' },
            ]);
            expect(r[0].mensagem).toContain(esperado);
        });
    });

    it('aplica o template para múltiplos contatos', () => {
        const contatos = [
            { id: 1, nome: 'Ana', numero: '5511900000001' },
            { id: 2, nome: 'Bruno', numero: '5511900000002' },
            { id: 3, nome: 'Carla', numero: '5511900000003' },
        ];
        const resultado = aplicarTemplate(template, contatos);
        expect(resultado).toHaveLength(3);
        expect(resultado[0].mensagem).toContain('Ana');
        expect(resultado[1].mensagem).toContain('Bruno');
        expect(resultado[2].mensagem).toContain('Carla');
    });

    it('preserva todos os outros campos do contato', () => {
        const contato = {
            id: 42,
            nome: 'Teste',
            numero: '5511900000001',
            nota: 'VIP',
            email: 'a@b.com',
        };
        const resultado = aplicarTemplate(template, [contato]);
        expect(resultado[0].id).toBe(42);
        expect(resultado[0].nota).toBe('VIP');
        expect(resultado[0].email).toBe('a@b.com');
        expect(resultado[0].numero).toBe('5511900000001');
    });

    it('retorna lista vazia para entrada vazia', () => {
        expect(aplicarTemplate(template, [])).toEqual([]);
    });

    it('substitui múltiplas ocorrências de {nome} no template', () => {
        const multiTemplate = 'Olá, {nome}! {nome}, temos novidades!';
        const resultado = aplicarTemplate(multiTemplate, [
            { id: 1, nome: 'Pedro', numero: '5511900000001' },
        ]);
        expect(resultado[0].mensagem).toBe(
            'Olá, Pedro! Pedro, temos novidades!',
        );
    });

    it('mantém a assinatura da Dra. Fabiana Bueno no template', () => {
        const resultado = aplicarTemplate(template, [
            { id: 1, nome: 'Ana', numero: '5511900000001' },
        ]);
        expect(resultado[0].mensagem).toContain('Dra. Fabiana Bueno');
    });
});

// ════════════════════════════════════════════════════════════
//  gerarResposta
// ════════════════════════════════════════════════════════════
describe('gerarResposta', () => {
    beforeEach(() => {
        mockFetch.mockClear();
    });

    it('retorna resposta gerada pela IA', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [
                    {
                        message: {
                            content: 'Sim, temos horários disponíveis!',
                        },
                    },
                ],
            }),
        });
        const resultado = await gerarResposta('Tem horário amanhã?');
        expect(resultado).toBe('Sim, temos horários disponíveis!');
    });

    it('faz exatamente 1 chamada à API', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
        });
        await gerarResposta('Teste');
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('chama a URL correta da API Groq', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
        });
        await gerarResposta('teste');
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.groq.com/openai/v1/chat/completions',
            expect.any(Object),
        );
    });

    it('envia a pergunta do paciente no prompt', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
        });
        await gerarResposta('Qual o valor da consulta?');
        const [, options] = mockFetch.mock.calls[0];
        const body = JSON.parse(options.body);
        expect(body.messages[0].content).toContain('Qual o valor da consulta?');
    });

    it('lança erro quando a API retorna status de erro', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
        });
        await expect(gerarResposta('teste')).rejects.toThrow('Groq API 500');
    });

    it('remove espaços extras do retorno', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                choices: [{ message: { content: '  Resposta aqui.  \n' } }],
            }),
        });
        const r = await gerarResposta('teste');
        expect(r).toBe('Resposta aqui.');
    });
});

// ════════════════════════════════════════════════════════════
//  CJS require path (v8 coverage tracking de function bodies)
//  v8 coverage rastreia bodies apenas para módulos carregados
//  via CJS require(). O ESM import do Vite não expõe bodies.
// ════════════════════════════════════════════════════════════
describe('CJS require (v8 coverage)', () => {
    const cjsRequire = createRequire(import.meta.url);

    beforeEach(() => {
        mockFetch.mockClear();
    });

    it('gerarTemplate function body via CJS', async () => {
        mockGroqResponse('Olá, {nome}! Teste CJS.');
        const cjs = cjsRequire('../../groq-ai.js');
        const resultado = await cjs.gerarTemplate('teste');
        expect(resultado).toBe('Olá, {nome}! Teste CJS.');
    });

    it('gerarTemplate error path via CJS', async () => {
        mockGroqError(500, 'Internal Server Error');
        const cjs = cjsRequire('../../groq-ai.js');
        await expect(cjs.gerarTemplate('teste')).rejects.toThrow(
            'Groq API 500',
        );
    });

    it('aplicarTemplate function body via CJS', () => {
        const cjs = cjsRequire('../../groq-ai.js');
        const template = 'Olá, {nome}! Teste CJS.';
        const resultado = cjs.aplicarTemplate(template, [
            { id: 1, nome: 'João Silva', numero: '5511900000001' },
        ]);
        expect(resultado[0].mensagem).toBe('Olá, João! Teste CJS.');
    });

    it('aplicarTemplate multiple contacts via CJS', () => {
        const cjs = cjsRequire('../../groq-ai.js');
        const contatos = [
            { id: 1, nome: 'Ana', numero: '5511900000001' },
            { id: 2, nome: 'Bruno', numero: '5511900000002' },
        ];
        const resultado = cjs.aplicarTemplate('Olá, {nome}!', contatos);
        expect(resultado).toHaveLength(2);
        expect(resultado[0].mensagem).toContain('Ana');
        expect(resultado[1].mensagem).toContain('Bruno');
    });

    it('gerarResposta success path via CJS', async () => {
        mockGroqResponse('Sim, temos horários!');
        const cjs = cjsRequire('../../groq-ai.js');
        const resultado = await cjs.gerarResposta('Tem horário?');
        expect(resultado).toBe('Sim, temos horários!');
    });

    it('gerarResposta error path via CJS', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 502,
            text: async () => 'Bad Gateway',
        });
        const cjs = cjsRequire('../../groq-ai.js');
        await expect(cjs.gerarResposta('teste')).rejects.toThrow(
            'Groq API 502',
        );
    });
});
