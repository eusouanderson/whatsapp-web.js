import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Bot } from '../../bot.js';

const mockGerarResposta = vi.fn(
    async (msg) => `Resposta automática para: "${msg}"`,
);

const mockGerarRespostaRecepcao = vi.fn(
    async (msg, _config, name) =>
        `Recepção LLM: "${msg}"${name ? ` — Olá, ${name.split(' ')[0]}!` : ''}`,
);

function makeSendMessage() {
    const sent = [];
    const fn = async (text) => {
        sent.push(text);
    };
    fn.sent = sent;
    return fn;
}

describe('Bot', () => {
    let bot;

    beforeEach(() => {
        vi.clearAllMocks();
        bot = new Bot({
            gerarResposta: mockGerarResposta,
            gerarRespostaRecepcao: mockGerarRespostaRecepcao,
        });
    });

    describe('constructor e config padrão', () => {
        it('cria bot com configuração padrão', () => {
            expect(bot.config.enabled).toBe(true);
            expect(bot.config.menuOptions).toHaveLength(5);
            expect(bot.conversations).toBeInstanceOf(Map);
        });

        it('mescla opções customizadas com defaults', () => {
            const b = new Bot({ enabled: false, address: 'Rua Teste' });
            expect(b.config.enabled).toBe(false);
            expect(b.config.address).toBe('Rua Teste');
            expect(b.config.greetingMessage).toBeTruthy();
        });

        it('defaultConfig retorna objeto completo', () => {
            const cfg = Bot.defaultConfig();
            expect(cfg).toHaveProperty('enabled');
            expect(cfg).toHaveProperty('greetingMessage');
            expect(cfg).toHaveProperty('menuHeader');
            expect(cfg).toHaveProperty('menuFooter');
            expect(cfg).toHaveProperty('menuOptions');
            expect(cfg).toHaveProperty('schedulingLink');
            expect(cfg).toHaveProperty('scheduleMessage');
            expect(cfg).toHaveProperty('address');
            expect(cfg).toHaveProperty('plans');
            expect(cfg).toHaveProperty('professionalContact');
        });
    });

    describe('gerenciamento de conversas', () => {
        it('getConversation retorna estado new para telefone novo', () => {
            const conv = bot._getConversation('5511900000001');
            expect(conv.state).toBe('new');
            expect(conv.context).toEqual({});
        });

        it('getConversation retorna mesmo objeto para mesmo telefone', () => {
            const c1 = bot._getConversation('5511900000001');
            c1.state = 'main_menu';
            const c2 = bot._getConversation('5511900000001');
            expect(c2.state).toBe('main_menu');
        });

        it('resetConversation remove o estado', () => {
            bot._getConversation('5511900000001');
            bot.resetConversation('5511900000001');
            expect(bot.conversations.has('5511900000001')).toBe(false);
        });
    });

    describe('handleMessage — fluxo principal', () => {
        it('não faz nada se bot estiver desabilitado', async () => {
            bot.config.enabled = false;
            const send = makeSendMessage();
            await bot.handleMessage('Oi', '5511900000001', send);
            expect(send.sent).toHaveLength(0);
        });

        it('na primeira mensagem chama LLM de recepção e exibe o menu', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            expect(send.sent).toHaveLength(1);
            expect(mockGerarRespostaRecepcao).toHaveBeenCalledWith(
                'Olá',
                expect.any(Object),
                '',
            );
            expect(send.sent[0]).toContain('Menu de Atendimento');
            expect(send.sent[0]).toContain('Recepção LLM:');
        });

        it('passa o nome do remetente para gerarRespostaRecepcao', async () => {
            const send = makeSendMessage();
            await bot.handleMessage(
                'Oi',
                '5511900000099',
                send,
                'Carlos Souza',
            );
            expect(mockGerarRespostaRecepcao).toHaveBeenCalledWith(
                'Oi',
                expect.any(Object),
                'Carlos Souza',
            );
            expect(send.sent[0]).toContain('Olá, Carlos!');
        });

        it('usa greeting estático como fallback quando LLM falha', async () => {
            mockGerarRespostaRecepcao.mockRejectedValueOnce(
                new Error('API error'),
            );
            const send = makeSendMessage();
            await bot.handleMessage('Oi', '5511900000001', send);
            expect(send.sent[0]).toContain(bot.config.greetingMessage);
            expect(send.sent[0]).toContain('Menu de Atendimento');
        });

        it('fallback substitui {nome} no greeting quando senderName informado', async () => {
            mockGerarRespostaRecepcao.mockRejectedValueOnce(
                new Error('API error'),
            );
            bot.updateConfig({ greetingMessage: 'Olá, {nome}!' });
            const send = makeSendMessage();
            await bot.handleMessage('Oi', '5511900000001', send, 'Ana Lima');
            expect(send.sent[0]).toContain('Olá, Ana!');
        });

        it('texto livre no main_menu chama LLM e exibe menu', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Oi', '5511900000001', send);
            mockGerarRespostaRecepcao.mockClear();
            await bot.handleMessage(
                'quero saber sobre clareamento',
                '5511900000001',
                send,
            );
            expect(mockGerarRespostaRecepcao).toHaveBeenCalledWith(
                'quero saber sobre clareamento',
                expect.any(Object),
                expect.any(String),
            );
            expect(send.sent[1]).toContain('Menu de Atendimento');
        });

        it('processa escolha de opção válida do menu', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            expect(send.sent).toHaveLength(1);
            await bot.handleMessage('1', '5511900000001', send);
            expect(send.sent).toHaveLength(2);
            expect(send.sent[1]).toContain('Falar com profissional');
        });

        it('digitar 0 volta ao menu principal (estático)', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('1', '5511900000001', send);
            await bot.handleMessage('0', '5511900000001', send);
            expect(send.sent).toHaveLength(3);
            expect(send.sent[2]).toContain('Menu de Atendimento');
        });
    });

    describe('ações do menu', () => {
        it('handleTalkToProfessional envia mensagem e reseta', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('1', '5511900000001', send);
            expect(send.sent[1]).toContain('Falar com profissional');
            expect(bot.conversations.has('5511900000001')).toBe(false);
        });

        it('opção desabilitada não aparece no menu', async () => {
            bot.config.menuOptions[0] = {
                ...bot.config.menuOptions[0],
                enabled: false,
            };
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            expect(send.sent[0]).not.toContain('1 - ');
        });

        it('opção desabilitada chama LLM ao receber seu key como texto livre', async () => {
            bot.config.menuOptions[0] = {
                ...bot.config.menuOptions[0],
                enabled: false,
            };
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            mockGerarRespostaRecepcao.mockClear();
            await bot.handleMessage('1', '5511900000001', send);
            expect(mockGerarRespostaRecepcao).toHaveBeenCalledWith(
                '1',
                expect.any(Object),
                expect.any(String),
            );
            expect(send.sent[1]).toContain('Menu de Atendimento');
        });

        it('custom_response envia response text e reseta', async () => {
            bot.config.menuOptions.push({
                key: '6',
                label: '💰 Preços',
                action: 'custom_response',
                response: 'Consulta: R$150. Limpeza: R$200.',
                enabled: true,
            });
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('6', '5511900000001', send);
            expect(send.sent[1]).toContain('Consulta: R$150');
            expect(send.sent[1]).toContain('menu principal');
            expect(bot.conversations.has('5511900000001')).toBe(false);
        });

        it('custom_response usa label quando response está vazio', async () => {
            bot.config.menuOptions.push({
                key: '7',
                label: 'Info geral',
                action: 'custom_response',
                response: '',
                enabled: true,
            });
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('7', '5511900000001', send);
            expect(send.sent[1]).toContain('Info geral');
        });

        it('handleSchedule envia link quando configurado', async () => {
            bot.config.schedulingLink = 'https://agenda.com';
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('2', '5511900000001', send);
            expect(send.sent[1]).toContain('link');
            expect(send.sent[1]).toContain('https://agenda.com');
        });

        it('handleSchedule envia mensagem sem link quando não configurado', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('2', '5511900000001', send);
            expect(send.sent[1]).toContain('telefone');
        });

        it('handleSchedule usa scheduleMessage personalizada quando configurada', async () => {
            bot.config.scheduleMessage =
                'Ficamos felizes em atendê-lo! Entre em contato.';
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('2', '5511900000001', send);
            expect(send.sent[1]).toContain(
                'Ficamos felizes em atendê-lo! Entre em contato.',
            );
        });

        it('handleSchedule exibe scheduleMessage e link juntos quando ambos configurados', async () => {
            bot.config.scheduleMessage = 'Agende pelo link abaixo:';
            bot.config.schedulingLink = 'https://agenda.com';
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('2', '5511900000001', send);
            expect(send.sent[1]).toContain('Agende pelo link abaixo:');
            expect(send.sent[1]).toContain('https://agenda.com');
        });

        it('handleAddress mostra endereço configurado', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('3', '5511900000001', send);
            expect(send.sent[1]).toContain('Endereço');
            expect(send.sent[1]).toContain(bot.config.address);
        });

        it('handlePlans mostra planos configurados', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('4', '5511900000001', send);
            expect(send.sent[1]).toContain('Planos');
            expect(send.sent[1]).toContain('Plano Básico');
        });

        it('handlePlans mostra mensagem padrão quando sem planos', async () => {
            bot.config.plans = [];
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('4', '5511900000001', send);
            expect(send.sent[1]).toContain('Consulte-nos');
        });
    });

    describe('ai_chat — conversa com IA', () => {
        it('entra em modo ai_chat ao escolher opção 5', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('5', '5511900000001', send);
            expect(send.sent[1]).toContain('Outro assunto');
            const conv = bot._getConversation('5511900000001');
            expect(conv.state).toBe('ai_chat');
        });

        it('responde com IA no estado ai_chat', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('5', '5511900000001', send);
            await bot.handleMessage(
                'Qual o horário de funcionamento?',
                '5511900000001',
                send,
            );
            expect(send.sent).toHaveLength(3);
            expect(send.sent[2]).toContain('Resposta automática');
        });

        it('volta ao menu com 0 no estado ai_chat', async () => {
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('5', '5511900000001', send);
            await bot.handleMessage('0', '5511900000001', send);
            expect(send.sent[2]).toContain('Menu de Atendimento');
        });
    });

    describe('registerAction — extensibilidade', () => {
        it('registra e executa ação customizada', async () => {
            bot.config.menuOptions.push({
                key: '6',
                label: 'Custom',
                action: 'custom_action',
            });
            const handler = vi.fn(async (phone, sendMessage) => {
                await sendMessage('Ação customizada executada!');
            });
            bot.registerAction('custom_action', handler);

            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('6', '5511900000001', send);
            expect(send.sent[1]).toContain('Ação customizada executada!');
            expect(handler).toHaveBeenCalledOnce();
        });

        it('fallback para ação não registrada', async () => {
            bot.config.menuOptions.push({
                key: '7',
                label: 'Ghost',
                action: 'does_not_exist',
            });
            const send = makeSendMessage();
            await bot.handleMessage('Olá', '5511900000001', send);
            await bot.handleMessage('7', '5511900000001', send);
            expect(send.sent[1]).toContain('não disponível');
        });
    });

    describe('getConfig / updateConfig', () => {
        it('getConfig retorna cópia da config', () => {
            const cfg = bot.getConfig();
            cfg.enabled = false;
            expect(bot.config.enabled).toBe(true);
        });

        it('updateConfig mescla com config atual', () => {
            bot.updateConfig({ enabled: false, address: 'Novo Endereço' });
            expect(bot.config.enabled).toBe(false);
            expect(bot.config.address).toBe('Novo Endereço');
            expect(bot.config.greetingMessage).toBeTruthy();
        });

        it('updateConfig substitui menuOptions quando fornecido', () => {
            const newOpts = [{ key: '1', label: 'Novo' }];
            bot.updateConfig({ menuOptions: newOpts });
            expect(bot.config.menuOptions).toEqual(newOpts);
        });

        it('getConfig inclui menuOptions', () => {
            const cfg = bot.getConfig();
            expect(cfg.menuOptions).toHaveLength(5);
        });
    });

    describe('showMainMenu', () => {
        it('usa greeting + menu quando sem prefix', async () => {
            const send = makeSendMessage();
            await bot.showMainMenu('5511900000001', send);
            expect(send.sent[0]).toContain(bot.config.greetingMessage);
            expect(send.sent[0]).toContain('Menu de Atendimento');
        });

        it('usa prefix + menu quando com prefix', async () => {
            const send = makeSendMessage();
            await bot.showMainMenu('5511900000001', send, '⚠️ Erro');
            expect(send.sent[0]).toContain('⚠️ Erro');
            expect(send.sent[0]).not.toContain(bot.config.greetingMessage);
        });

        it('substitui {nome} pelo primeiro nome do remetente', async () => {
            bot.updateConfig({ greetingMessage: 'Olá, {nome}! Bem-vindo(a).' });
            const send = makeSendMessage();
            await bot.showMainMenu('5511900000001', send, null, 'Maria Silva');
            expect(send.sent[0]).toContain('Olá, Maria! Bem-vindo(a).');
        });

        it('mantém greeting intacto quando senderName não é informado', async () => {
            bot.updateConfig({ greetingMessage: 'Olá, {nome}! Bem-vindo(a).' });
            const send = makeSendMessage();
            await bot.showMainMenu('5511900000001', send);
            expect(send.sent[0]).toContain('{nome}');
        });
    });

    describe('conversas ativas', () => {
        it('conversations Map expõe conversas ativas', () => {
            bot._getConversation('5511900000001');
            bot._getConversation('5511900000002');
            expect(bot.conversations.size).toBe(2);
        });

        it('resetConversation limpa conversa específica', () => {
            bot._getConversation('5511900000001');
            bot._getConversation('5511900000002');
            bot.resetConversation('5511900000001');
            expect(bot.conversations.size).toBe(1);
            expect(bot.conversations.has('5511900000002')).toBe(true);
        });
    });
});
