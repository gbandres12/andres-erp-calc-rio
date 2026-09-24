// Máscara dinâmica de documento: formata como CPF (até 11 dígitos)
// ou CNPJ (12 ou mais dígitos), detectando o tipo enquanto digita.
export const maskCpfCnpj = (value) => {
  const d = (value || "").replace(/\D/g, "").slice(0, 14);
  if (d.length > 11) {
    return d
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
      .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, "$1.$2.$3/$4-$5");
  }
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
};