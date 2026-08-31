import { base44 } from "@/api/base44Client";

export async function deleteProtectedRecord({ kind, id, password, company_id }) {
  const companyId = company_id || localStorage.getItem("selectedCompanyId");
  const res = await base44.functions.invoke("deleteProtectedRecord", {
    kind,
    id,
    password,
    company_id: companyId,
  });
  const data = res?.data ?? res;
  if (data?.error) throw new Error(data.error);
  if (data?.success === false) throw new Error(data.message || "Falha ao excluir");
  return data;
}
