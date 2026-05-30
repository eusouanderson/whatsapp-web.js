/**
 * =====================================================
 *  📄 PARSER — clients.csv
 * =====================================================
 * Lida com todos os formatos encontrados no CSV:
 *  +5511957455097 | 11991172734 | 11 919061460
 *  1196420-5580   | +55 11 93151-5382 | etc.
 */

const fs = require('fs');

// ─── NORMALIZAR TELEFONE ──────────────────────────────
function normalizarTelefone(raw) {
    if (!raw || !raw.trim()) return null;

    // Remove tudo que não for dígito
    let n = raw.replace(/\D/g, '');
    if (!n || n.length < 8) return null;

    // Já tem código do país 55
    if (n.startsWith('55')) {
        // 55 + 11 dígitos = 13 (celular) ou 55 + 10 = 12 (fixo) → ok
        if (n.length === 12 || n.length === 13) return n;
        // 55 + 9 dígitos sem DDD → inválido
        return null;
    }

    // Tem DDD + número (10 ou 11 dígitos) → adiciona 55
    if (n.length === 10 || n.length === 11) return '55' + n;

    // 8 ou 9 dígitos → sem DDD, descarta
    return null;
}

// ─── NORMALIZAR NOME ──────────────────────────────────
function normalizarNome(first, last) {
    const f = (first || '').trim();
    const l = (last || '').trim();
    // Lowercase primeiro para garantir capitalização correta (inclui acentos)
    const nome = [f, l].filter(Boolean).join(' ').toLowerCase();
    // Capitaliza a primeira letra de cada palavra (funciona com acentos)
    return nome.replace(/(^|\s)\S/g, (c) => c.toUpperCase()) || null;
}

// ─── PARSE SIMPLES DE LINHA CSV ───────────────────────
// Trata campos com vírgula entre aspas
function parseLinha(linha) {
    const cols = [];
    let campo = '';
    let dentro = false;

    for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') {
            dentro = !dentro;
        } else if (c === ',' && !dentro) {
            cols.push(campo.trim());
            campo = '';
        } else {
            campo += c;
        }
    }
    cols.push(campo.trim());
    return cols;
}

// ─── FUNÇÃO PRINCIPAL ─────────────────────────────────
function parsearCSV(csvPath) {
    const conteudo = fs.readFileSync(csvPath, 'utf-8');
    const linhas = conteudo
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

    // Pega o header (primeira linha)
    const header = parseLinha(linhas[0]).map((h) => h.toLowerCase().trim());
    const idx = {
        firstname: header.indexOf('firstname'),
        lastname: header.indexOf('lastname'),
        phone: header.indexOf('phone'),
        email: header.indexOf('email'),
        note: header.indexOf('note'),
        birthday: header.indexOf('birthday'),
    };

    const vistosNumero = new Set();
    const contatos = [];
    const descartados = { semTelefone: 0, duplicados: 0, invalidos: 0 };

    for (let i = 1; i < linhas.length; i++) {
        const cols = parseLinha(linhas[i]);
        const get = (k) => (idx[k] >= 0 ? (cols[idx[k]] || '').trim() : '');

        const nome = normalizarNome(get('firstname'), get('lastname'));
        const tel = normalizarTelefone(get('phone'));
        const nota = get('note');
        const aniversario = get('birthday'); // ex: "24.08.2023"

        // Sem telefone → descarta
        if (!tel) {
            descartados.semTelefone++;
            continue;
        }

        // Duplicata por número → descarta
        if (vistosNumero.has(tel)) {
            descartados.duplicados++;
            continue;
        }

        // Sem nome → usa o número como nome
        const nomeF = nome || `Contato ${tel.slice(-4)}`;

        vistosNumero.add(tel);
        contatos.push({
            nome: nomeF,
            numero: tel,
            email: get('email') || null,
            nota: nota || null,
            aniversario: aniversario || null,
        });
    }

    return { contatos, descartados, total: linhas.length - 1 };
}

module.exports = { parsearCSV, normalizarTelefone, normalizarNome };
