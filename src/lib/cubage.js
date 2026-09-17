import { base44 } from "@/api/base44Client";

// Normaliza placas: maiúsculas, sem hífen/espaço (ABC1234 ou Mercosul ABC1D23)
export const normalizePlate = (plate) =>
  String(plate || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// Comprime a foto no próprio celular antes do upload (máx 1280px, JPEG)
export async function compressImage(file, maxSize = 1280, quality = 0.72) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return blob || file;
}

// Comprime e envia a foto para o storage público, retorna a URL
export async function uploadPhoto(file) {
  const compressed = await compressImage(file);
  const res = await base44.integrations.Core.UploadPublicFile({ file: compressed });
  return res.file_url;
}

// Ângulos fixos da cubagem guiada
export const CUBAGE_ANGLES = [
  {
    id: "lateral",
    title: "1. Lateral do caminhão",
    instruction: "Afaste-se até o caminhão INTEIRO caber na foto, visto de lado, com a carga visível.",
  },
  {
    id: "diagonal",
    title: "2. Diagonal 45° (traseira)",
    instruction: "Fique atrás e ao lado do caminhão, mostrando o topo da carga (monte ou rasada).",
  },
  {
    id: "frontal",
    title: "3. Frontal curta",
    instruction: "Fique na frente do caminhão, perto, mostrando a altura da carga contra a cabine.",
  },
];

// Busca o veículo pela placa: primeiro na filial ativa, depois em qualquer filial
export async function findVehicleByPlate(plate, companyId) {
  const norm = normalizePlate(plate);
  if (!norm) return null;
  const inCompany = await base44.entities.Vehicle.filter({ company_id: companyId }, "-created_date", 200);
  let match = inCompany.find((v) => normalizePlate(v.plate) === norm);
  if (!match) {
    const all = await base44.entities.Vehicle.filter({}, "-created_date", 200);
    match = all.find((v) => normalizePlate(v.plate) === norm);
  }
  return match || null;
}

export const hasBedDimensions = (vehicle) =>
  Boolean(
    vehicle &&
    Number(vehicle.bed_length_m) > 0 &&
    Number(vehicle.bed_width_m) > 0 &&
    Number(vehicle.bed_edge_height_m) > 0
  );