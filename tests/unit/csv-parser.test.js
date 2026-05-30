/**
 * ============================================================
 *  📄 TESTES — csv-parser.js
 *  Cobertura: normalizarTelefone, normalizarNome, parsearCSV
 * ============================================================
 */

import { describe, it, expect, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { normalizarTelefone, normalizarNome, parsearCSV } =
    await import('../../csv-parser.js');

const CSV_FIXTURE = path.join(__dirname, '../fixtures/sample.csv');

// ════════════════════════════════════════════════════════════
//  normalizarTelefone
// ════════════════════════════════════════════════════════════
describe('normalizarTelefone', () => {
    describe('formatos válidos → devem retornar número normalizado', () => {
        it('número com DDD sem código do país (11 dígitos)', () => {
            expect(normalizarTelefone('11991172734')).toBe('5511991172734');
        });
        it('número com DDD sem código do país (10 dígitos)', () => {
            expect(normalizarTelefone('1199117273')).toBe('551199117273');
        });
        it('com +55 e sem espaços', () => {
            expect(normalizarTelefone('+5511957455097')).toBe('5511957455097');
        });
        it('com espaço entre DDD e número', () => {
            expect(normalizarTelefone('11 919061460')).toBe('5511919061460');
        });
        it('com traço no número', () => {
            expect(normalizarTelefone('1196420-5580')).toBe('5511964205580');
        });
        it('com +55, espaços e traço', () => {
            expect(normalizarTelefone('+55 11 93151-5382')).toBe(
                '5511931515382',
            );
        });
        it('já com 55 e formato correto (13 dígitos)', () => {
            expect(normalizarTelefone('5511991172734')).toBe('5511991172734');
        });
        it('já com 55 e formato correto (12 dígitos)', () => {
            expect(normalizarTelefone('551199117273')).toBe('551199117273');
        });
        it('com parênteses no DDD', () => {
            expect(normalizarTelefone('(11) 99999-8888')).toBe('5511999998888');
        });
    });

    describe('formatos inválidos → devem retornar null', () => {
        it('string vazia', () => {
            expect(normalizarTelefone('')).toBeNull();
        });
        it('undefined/null', () => {
            expect(normalizarTelefone(null)).toBeNull();
            expect(normalizarTelefone(undefined)).toBeNull();
        });
        it('apenas espaços', () => {
            expect(normalizarTelefone('   ')).toBeNull();
        });
        it('número muito curto (menos de 8 dígitos)', () => {
            expect(normalizarTelefone('123')).toBeNull();
        });
        it('número sem DDD (8-9 dígitos)', () => {
            expect(normalizarTelefone('99998888')).toBeNull();
        });
        it('texto sem números', () => {
            expect(normalizarTelefone('sem-numero')).toBeNull();
        });
        it('começa com 55 mas comprimento diferente de 12 ou 13 dígitos', () => {
            // 9 dígitos totais (55 + 7): passa pelo filtro de length>=8 mas falha no check de 12/13
            expect(normalizarTelefone('551234567')).toBeNull();
            // 14 dígitos: passa filtro mas não é 12 nem 13
            expect(normalizarTelefone('55119999999999')).toBeNull();
        });
    });
});

// ════════════════════════════════════════════════════════════
//  normalizarNome
// ════════════════════════════════════════════════════════════
describe('normalizarNome', () => {
    it('combina primeiro e último nome', () => {
        expect(normalizarNome('João', 'Silva')).toBe('João Silva');
    });
    it('funciona só com primeiro nome', () => {
        expect(normalizarNome('Maria', '')).toBe('Maria');
        expect(normalizarNome('Maria', null)).toBe('Maria');
    });
    it('funciona só com último nome', () => {
        expect(normalizarNome('', 'Souza')).toBe('Souza');
    });
    it('capitaliza a primeira letra de cada palavra', () => {
        expect(normalizarNome('ANA', 'BEATRIZ')).toBe('Ana Beatriz');
    });
    it('retorna null para nome completamente vazio', () => {
        expect(normalizarNome('', '')).toBeNull();
        expect(normalizarNome(null, null)).toBeNull();
    });
    it('remove espaços extras', () => {
        expect(normalizarNome('  Carlos  ', '  Lima  ')).toBe('Carlos Lima');
    });
});

// ════════════════════════════════════════════════════════════
//  parsearCSV
// ════════════════════════════════════════════════════════════
describe('parsearCSV', () => {
    it('lê e processa o arquivo CSV corretamente', () => {
        const resultado = parsearCSV(CSV_FIXTURE);
        expect(resultado).toHaveProperty('contatos');
        expect(resultado).toHaveProperty('descartados');
        expect(resultado).toHaveProperty('total');
    });

    it('descarta contatos sem telefone', () => {
        const { descartados } = parsearCSV(CSV_FIXTURE);
        expect(descartados.semTelefone).toBeGreaterThan(0);
    });

    it('descarta números duplicados', () => {
        const { descartados } = parsearCSV(CSV_FIXTURE);
        // João Silva e Duplicate User têm o mesmo número
        expect(descartados.duplicados).toBeGreaterThan(0);
    });

    it('todos os contatos retornados têm número válido', () => {
        const { contatos } = parsearCSV(CSV_FIXTURE);
        contatos.forEach((c) => {
            expect(c.numero).toMatch(/^55\d{10,11}$/);
        });
    });

    it('todos os contatos têm nome', () => {
        const { contatos } = parsearCSV(CSV_FIXTURE);
        contatos.forEach((c) => {
            expect(c.nome).toBeTruthy();
            expect(c.nome.length).toBeGreaterThan(0);
        });
    });

    it('preserva o campo nota quando disponível', () => {
        const { contatos } = parsearCSV(CSV_FIXTURE);
        const carlos = contatos.find((c) => c.nome.includes('Carlos'));
        expect(carlos?.nota).toBe('Paciente especial');
    });

    it('número total é correto (inclui inválidos)', () => {
        const { total, contatos, descartados } = parsearCSV(CSV_FIXTURE);
        // total = linhas - header
        expect(total).toBeGreaterThan(0);
        // contatos + descartados = total
        const soma =
            contatos.length +
            descartados.semTelefone +
            descartados.duplicados +
            descartados.invalidos;
        expect(soma).toBe(total);
    });

    it('lança erro para arquivo inexistente', () => {
        expect(() => parsearCSV('/nao/existe.csv')).toThrow();
    });
});

// ════════════════════════════════════════════════════════════
//  parsearCSV — casos extremos de cobertura de branches
// ════════════════════════════════════════════════════════════
describe('parsearCSV — branches não cobertos pelo fixture principal', () => {
    const TMP = path.join(__dirname, '../fixtures/_tmp_test.csv');

    afterEach(() => {
        if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
    });

    it('usa número como nome quando firstname e lastname são vazios (branch nome || fallback)', () => {
        // Contato com telefone válido mas sem nome → nomeF = `Contato XXXX`
        fs.writeFileSync(TMP, 'firstname,lastname,phone\n,,11900000001\n');
        const { contatos } = parsearCSV(TMP);
        expect(contatos).toHaveLength(1);
        expect(contatos[0].nome).toMatch(/^Contato \d{4}$/);
    });

    it('retorna string vazia para colunas ausentes no cabeçalho (branch idx[k] < 0)', () => {
        // CSV sem as colunas email, note, birthday → idx[k] = -1 → branch false do ternário
        fs.writeFileSync(
            TMP,
            'firstname,lastname,phone\nJoão,Silva,11991172734\n',
        );
        const { contatos } = parsearCSV(TMP);
        expect(contatos).toHaveLength(1);
        expect(contatos[0].email).toBeNull();
        expect(contatos[0].nota).toBeNull();
        expect(contatos[0].aniversario).toBeNull();
    });
});
