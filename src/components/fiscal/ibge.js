const cache = {};

const normalize = (s) =>
  String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// Busca o código IBGE (7 dígitos) pelo nome do município + UF, usando a API pública do IBGE
export async function fetchIbgeCode(municipio, uf) {
  if (!municipio || !uf || String(uf).length !== 2) return null;
  const key = String(uf).toUpperCase();
  try {
    if (!cache[key]) {
      const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${key}/municipios`);
      if (!res.ok) return null;
      cache[key] = await res.json();
    }
    const target = normalize(municipio);
    const match = cache[key].find((m) => normalize(m.nome) === target);
    return match ? String(match.id) : null;
  } catch {
    return null;
  }
}