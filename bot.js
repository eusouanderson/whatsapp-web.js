/**
 * =====================================================
 *  🤖 BOT DE ATENDIMENTO — WhatsApp
 *  Engine conversacional com menus, ações e estados
 *
 *  Para adicionar nova ação:
 *    1. Adicionar entrada em menuOptions
 *    2. Chamar bot.registerAction('nome', handlerFn)
 * =====================================================
 */

class Bot {
    constructor(options = {}) {
        const { gerarResposta: userGerarResposta } = options;
        this._gerarResposta =
            userGerarResposta || require('./groq-ai').gerarResposta;

        this.conversations = new Map();
        this._actions = new Map();
        this.config = { ...Bot.defaultConfig(), ...options };

        this._registerDefaultActions();
    }

    static defaultConfig() {
        return {
            enabled: true,
            greetingMessage:
                'Olá! 🦷 Bem-vindo(a) ao consultório da Dra. Fabiana Bueno!\n\nComo posso ajudar você hoje?',
            menuHeader: '📋 *Menu de Atendimento*\n\nEscolha uma opção:',
            menuFooter: '\n\n_Envie o número da opção desejada._',
            menuOptions: [
                {
                    key: '1',
                    label: '📞 Falar com profissional',
                    action: 'talk_to_professional',
                },
                { key: '2', label: '📅 Marcar consulta', action: 'schedule' },
                {
                    key: '3',
                    label: '📍 Endereço da clínica',
                    action: 'address',
                },
                { key: '4', label: '🏥 Planos de saúde', action: 'plans' },
                { key: '5', label: '💬 Outro assunto', action: 'ai_chat' },
            ],
            schedulingLink: '',
            address: 'Rua Exemplo, 123 - Centro\nCEP: 00000-000\nCidade - SP',
            plans: ['Plano Básico', 'Plano Premium', 'Plano Empresarial'],
            professionalContact: '',
        };
    }

    _registerDefaultActions() {
        this.registerAction(
            'talk_to_professional',
            async (phone, sendMessage) => {
                const lines = ['🔌 *Falar com profissional*', ''];
                lines.push(
                    'Sua solicitação foi encaminhada. Em breve um de nossos profissionais entrará em contato.',
                );
                if (this.config.professionalContact) {
                    lines.push(`Contato: ${this.config.professionalContact}`);
                }
                lines.push('', '_Digite 0 para voltar ao menu principal._');
                await sendMessage(lines.join('\n'));
                this.resetConversation(phone);
            },
        );

        this.registerAction('schedule', async (phone, sendMessage) => {
            const lines = ['📅 *Agendar Consulta*', ''];
            if (this.config.schedulingLink) {
                lines.push(
                    'Clique no link abaixo para escolher o melhor horário:',
                );
                lines.push(this.config.schedulingLink);
            } else {
                lines.push(
                    'Entre em contato conosco pelo telefone para agendar sua consulta.',
                );
            }
            lines.push('', '_Digite 0 para voltar ao menu principal._');
            await sendMessage(lines.join('\n'));
            this.resetConversation(phone);
        });

        this.registerAction('address', async (phone, sendMessage) => {
            const lines = [
                '📍 *Endereço*',
                '',
                this.config.address,
                '',
                '_Digite 0 para voltar ao menu principal._',
            ];
            await sendMessage(lines.join('\n'));
            this.resetConversation(phone);
        });

        this.registerAction('plans', async (phone, sendMessage) => {
            const lines = ['🏥 *Planos de Saúde*', ''];
            if (this.config.plans.length) {
                this.config.plans.forEach((p, i) =>
                    lines.push(`${i + 1} - ${p}`),
                );
            } else {
                lines.push(
                    'Consulte-nos para mais informações sobre os planos aceitos.',
                );
            }
            lines.push('', '_Digite 0 para voltar ao menu principal._');
            await sendMessage(lines.join('\n'));
            this.resetConversation(phone);
        });

        this.registerAction('ai_chat', async (phone, sendMessage) => {
            const conv = this._getConversation(phone);
            conv.state = 'ai_chat';
            const lines = [
                '💬 *Outro assunto*',
                '',
                'Pode me perguntar! Vou ajudar no que for possível.',
                '',
                '_Digite 0 a qualquer momento para voltar ao menu principal._',
            ];
            await sendMessage(lines.join('\n'));
        });

        this.registerAction('back_to_menu', async (phone, sendMessage) => {
            this.resetConversation(phone);
            await this.showMainMenu(phone, sendMessage);
        });
    }

    registerAction(actionName, handler) {
        this._actions.set(actionName, handler);
    }

    _getConversation(phone) {
        if (!this.conversations.has(phone)) {
            this.conversations.set(phone, { state: 'new', context: {} });
        }
        return this.conversations.get(phone);
    }

    resetConversation(phone) {
        this.conversations.delete(phone);
    }

    _renderMenu() {
        const lines = [this.config.menuHeader];
        this.config.menuOptions.forEach((opt) => {
            lines.push(`${opt.key} - ${opt.label}`);
        });
        lines.push(this.config.menuFooter);
        return lines.join('\n');
    }

    async showMainMenu(phone, sendMessage, prefix) {
        const menu = this._renderMenu();
        const text = prefix
            ? `${prefix}\n\n${menu}`
            : `${this.config.greetingMessage}\n\n${menu}`;
        await sendMessage(text);
    }

    async handleMessage(messageText, phone, sendMessage) {
        if (!this.config.enabled) return;

        const conv = this._getConversation(phone);

        if (conv.state === 'new') {
            conv.state = 'main_menu';
            await this.showMainMenu(phone, sendMessage);
            return;
        }

        const trimmed = (messageText || '').trim();

        if (trimmed === '0') {
            await this._actions.get('back_to_menu')(phone, sendMessage);
            return;
        }

        const matchedOption = this.config.menuOptions.find(
            (o) => o.key === trimmed,
        );

        if (matchedOption) {
            conv.state = 'main_menu';
            await this._executeAction(matchedOption, phone, sendMessage);
            return;
        }

        if (conv.state === 'ai_chat') {
            await this._handleAiChat(trimmed, phone, sendMessage);
            return;
        }

        await this.showMainMenu(
            phone,
            sendMessage,
            '❓ Opção inválida. Tente novamente:',
        );
    }

    async _executeAction(option, phone, sendMessage) {
        const actionKey = option.action || option.key;
        const handler = this._actions.get(actionKey);
        if (handler) {
            await handler(phone, sendMessage);
        } else {
            await sendMessage('Opção não disponível no momento.');
            this.resetConversation(phone);
        }
    }

    async _handleAiChat(messageText, phone, sendMessage) {
        const response = await this._gerarResposta(messageText);
        await sendMessage(response);
    }

    getConfig() {
        return { ...this.config, menuOptions: [...this.config.menuOptions] };
    }

    updateConfig(newConfig) {
        if (newConfig.menuOptions) {
            newConfig.menuOptions = [...newConfig.menuOptions];
        }
        Object.assign(this.config, newConfig);
    }
}

module.exports = { Bot };
