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

/**
 * Formata uma data para o padrão brasileiro (DD/MM/YYYY)
 * 
 * @param {string | Date} date - A data a ser formatada
 * @returns {string} A data formatada (DD/MM/YYYY)
 */
export function formatDate(date) {
  if (!date) return 'N/A';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
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