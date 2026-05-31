/**
 * =====================================================
 *  🗄️  BANCO DE DADOS — JSON (sem compilação nativa)
 * =====================================================
 */

const fs = require('fs');
const path = require('path');

/* c8 ignore next */
const DB_PATH =
    process.env.WHATSAPP_DB_PATH || path.join(__dirname, 'whatsapp-db.json');

// ─── ESTRUTURA INICIAL ───────────────────────────────
const EMPTY = { contatos: [], historico: [], _nextId: 1, _nextHId: 1 };

// ─── LER / SALVAR ────────────────────────────────────
function ler() {
    if (!fs.existsSync(DB_PATH)) return JSON.parse(JSON.stringify(EMPTY));
    try {
        return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch {
        return JSON.parse(JSON.stringify(EMPTY));
    }
}

function salvar(dados) {
    fs.writeFileSync(DB_PATH, JSON.stringify(dados, null, 2), 'utf-8');
}

// ─── CONTATOS ─────────────────────────────────────────

const listarContatos = () => {
    const db = ler();
    return db.contatos
        .map((c) => {
            const envios = db.historico.filter((h) => h.contato_id === c.id);
            const enviados = envios.filter((h) => h.status === 'ok');
            const ultimo = envios.sort((a, b) =>
                b.enviado_em.localeCompare(a.enviado_em),
            )[0];
            return {
                ...c,
                total_envios: envios.length,
                envios_ok: enviados.length,
                ultimo_envio: ultimo?.enviado_em || null,
            };
        })
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

const buscarPorNumero = (numero) => {
    const num = normalizarNumero(numero);
    return ler().contatos.find((c) => c.numero === num) || null;
};

const inserirContato = (nome, numero, extra = {}) => {
    const num = normalizarNumero(numero);
    const db = ler();
    if (db.contatos.find((c) => c.numero === num))
        return {
            ok: false,
            duplicado: true,
            msg: `Número ${num} já cadastrado`,
        };

    const contato = {
        id: db._nextId++,
        nome,
        numero: num,
        email: extra.email || null,
        nota: extra.nota || null,
        aniversario: extra.aniversario || null,
        criado_em: new Date().toLocaleString('pt-BR'),
    };
    db.contatos.push(contato);
    salvar(db);
    return { ok: true, id: contato.id, duplicado: false };
};

const atualizarContato = (id, nome) => {
    const db = ler();
    const c = db.contatos.find((c) => c.id === parseInt(id));
    if (c) {
        c.nome = nome;
        salvar(db);
    }
};

const removerContato = (id) => {
    const db = ler();
    db.contatos = db.contatos.filter((c) => c.id !== parseInt(id));
    db.historico = db.historico.filter((h) => h.contato_id !== parseInt(id));
    salvar(db);
};

const importarContatos = (lista) => {
    const db = ler();
    let inseridos = 0,
        duplicados = 0;

    for (const { nome, numero, email, nota, aniversario } of lista) {
        const num = normalizarNumero(numero);
        if (db.contatos.find((c) => c.numero === num)) {
            duplicados++;
            continue;
        }
        db.contatos.push({
            id: db._nextId++,
            nome,
            numero: num,
            email: email || null,
            nota: nota || null,
            aniversario: aniversario || null,
            criado_em: new Date().toLocaleString('pt-BR'),
        });
        inseridos++;
    }
    salvar(db);
    return { inseridos, duplicados };
};

// ─── HISTÓRICO ────────────────────────────────────────

const registrarEnvio = (contatoId, mensagem, status, motivo = null) => {
    const db = ler();
    db.historico.push({
        id: db._nextHId++,
        contato_id: contatoId,
        mensagem,
        status,
        motivo,
        enviado_em: new Date().toLocaleString('pt-BR'),
    });
    salvar(db);
};

const historicoContato = (contatoId) => {
    const db = ler();
    return db.historico
        .filter((h) => h.contato_id === parseInt(contatoId))
        .sort((a, b) => b.id - a.id)
        .slice(0, 50);
};

const resumo = () => {
    const db = ler();
    return {
        total_contatos: db.contatos.length,
        total_envios: db.historico.length,
        envios_ok: db.historico.filter((h) => h.status === 'ok').length,
        envios_erro: db.historico.filter((h) => h.status === 'erro').length,
    };
};

// ─── UTILITÁRIO ───────────────────────────────────────

function normalizarNumero(numero) {
    let n = String(numero).replace(/\D/g, '');
    if (!n.startsWith('55')) n = '55' + n;
    return n;
}

// ─── BOT CONFIG ───────────────────────────────────────

function lerBotConfig() {
    const dados = ler();
    return dados.botConfig || {};
}

function salvarBotConfig(config) {
    const dados = ler();
    dados.botConfig = config;
    salvar(dados);
}

module.exports = {
    listarContatos,
    buscarPorNumero,
    inserirContato,
    atualizarContato,
    removerContato,
    importarContatos,
    registrarEnvio,
    historicoContato,
    resumo,
    normalizarNumero,
    lerBotConfig,
    salvarBotConfig,
};
