/**
 * Formata um valor para o padrão monetário brasileiro (BRL)
 * Aceita números ou strings, tratando separadores de milhar e decimal
 * 
 * @param {number | string} input - O valor a ser formatado
 * @returns {string} O valor formatado no padrão BRL (R$ X.XXX,XX)
 */
export function formatBRL(input) {
  let numericValue;

  // Passo 1: Limpar e converter a entrada para um número
  if (typeof input === 'string') {
    // Remove tudo que não for dígito, vírgula ou ponto
    let cleanedString = input.replace(/[^0-9,\.]/g, '');

    // Heurística para identificar separadores BRL vs. padrão americano
    const lastCommaIndex = cleanedString.lastIndexOf(',');
    const lastDotIndex = cleanedString.lastIndexOf('.');

    if (lastCommaIndex > lastDotIndex) {
      // Formato BRL: remove pontos de milhar e troca vírgula decimal por ponto
      cleanedString = cleanedString.replace(/\./g, '');
      cleanedString = cleanedString.replace(',', '.');
    } else {
      // Formato padrão (americano) ou sem separador: remove vírgulas de milhar
      cleanedString = cleanedString.replace(/,/g, '');
    }
    
    numericValue = parseFloat(cleanedString);
  } else {
    // Se a entrada já é um número, usa-o diretamente
    numericValue = input;
  }

  // Garante que o valor é um número válido, caso contrário, usa 0
  if (isNaN(numericValue) || numericValue === null || numericValue === undefined) {
    numericValue = 0;
  }

  // Passo 2: Formatar o número para o padrão BRL
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

// Alias para compatibilidade
export const formatCurrency = formatBRL;

/**
 * Formata uma data para o padrão brasileiro (DD/MM/YYYY)
 * 
 * @param {string | Date} date - A data a ser formatada
 * @returns {string} A data formatada (DD/MM/YYYY)
 */
export function formatDate(date) {
  if (!date) return 'N/A';
  
  // Se for string YYYY-MM-DD, formata direto para evitar problemas de fuso horário
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }

  const d = new Date(date);
  // Adiciona o offset do fuso horário para garantir a data correta se for objeto Date puro
  // Mas geralmente objetos Date já estão no fuso local do navegador.
  // O problema maior é string YYYY-MM-DD que vira UTC meia-noite.
  
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Retorna a data atual no formato YYYY-MM-DD considerando o fuso local
 */
export function getTodayDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formata uma data e hora para o padrão brasileiro (DD/MM/YYYY HH:MM)
 * 
 * @param {string | Date} date - A data a ser formatada
 * @returns {string} A data e hora formatadas
 */
export function formatDateTime(date) {
  if (!date) return '';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hour}:${minute}`;
}