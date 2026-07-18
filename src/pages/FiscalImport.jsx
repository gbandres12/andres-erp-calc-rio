import React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, Package, Receipt, Database } from "lucide-react";
import ImportUploader from "@/components/fiscal/import/ImportUploader";

const clientSchema = {
  type: "object",
  properties: {
    nome: { type: "string" }, cpf_cnpj: { type: "string" }, email: { type: "string" },
    telefone: { type: "string" }, endereco: { type: "string" }, cidade: { type: "string" },
    uf: { type: "string" }, cep: { type: "string" }
  }
};

const productSchema = {
  type: "object",
  properties: {
    codigo: { type: "string" }, nome: { type: "string" }, descricao_fiscal: { type: "string" },
    ncm: { type: "string" }, unidade: { type: "string" }, cfop: { type: "string" },
    icms_cst: { type: "string" }, icms_aliquota: { type: "number" },
    pis_cst: { type: "string" }, pis_aliquota: { type: "number" },
    cofins_cst: { type: "string" }, cofins_aliquota: { type: "number" },
    preco_venda: { type: "number" }
  }
};

const invoiceSchema = {
  type: "object",
  properties: {
    numero: { type: "string" }, serie: { type: "string" }, data_emissao: { type: "string" },
    chave_acesso: { type: "string" }, destinatario_nome: { type: "string" },
    destinatario_cpf_cnpj: { type: "string" }, valor_total: { type: "number" },
    descricao_itens: { type: "string" }
  }
};

const UNITS = ["UN", "KG", "TON", "L", "M", "M2", "M3"];

export default function FiscalImport() {
  const companyId = localStorage.getItem("selectedCompanyId");
  const companyName = localStorage.getItem("selectedCompanyName") || "";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
          <Database className="w-5 h-5 text-violet-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Importar do Emissor Antigo</h1>
          <p className="text-slate-500 text-sm">Os dados serão importados para a filial atual: <strong>{companyName}</strong></p>
        </div>
      </div>

      <Tabs defaultValue="clientes">
        <TabsList className="w-full">
          <TabsTrigger value="clientes" className="flex-1 gap-1.5"><Users className="w-4 h-4" /> Clientes</TabsTrigger>
          <TabsTrigger value="produtos" className="flex-1 gap-1.5"><Package className="w-4 h-4" /> Produtos</TabsTrigger>
          <TabsTrigger value="notas" className="flex-1 gap-1.5"><Receipt className="w-4 h-4" /> Notas Emitidas</TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="mt-5">
          <ImportUploader
            title="Importar Clientes"
            description="Envie o arquivo exportado do emissor antigo com nome, CPF/CNPJ, endereço e contato."
            jsonSchema={clientSchema}
            columns={[
              { key: "nome", label: "Nome" }, { key: "cpf_cnpj", label: "CPF/CNPJ" },
              { key: "cidade", label: "Cidade" }, { key: "uf", label: "UF" },
              { key: "telefone", label: "Telefone" }, { key: "email", label: "Email" }
            ]}
            entityName="Contact"
            transform={(row) => row.nome ? {
              type: "cliente", status: "cliente", name: row.nome,
              document: row.cpf_cnpj || "", email: row.email || "", phone: row.telefone || "",
              address: row.endereco || "", city: row.cidade || "", state: row.uf || "",
              zip_code: row.cep || "", company_id: companyId, is_active: true,
              notes: "Importado do emissor antigo"
            } : null}
          />
        </TabsContent>

        <TabsContent value="produtos" className="mt-5">
          <ImportUploader
            title="Importar Produtos"
            description="Envie o cadastro de produtos com NCM, CFOP, CST e alíquotas do emissor antigo."
            warning="Produtos importados entram como NÃO aprovados fiscalmente. Revise cada um com o contador antes de emitir notas."
            jsonSchema={productSchema}
            columns={[
              { key: "codigo", label: "Código" }, { key: "nome", label: "Nome" },
              { key: "ncm", label: "NCM" }, { key: "cfop", label: "CFOP" },
              { key: "unidade", label: "Un." }, { key: "icms_cst", label: "CST ICMS" }
            ]}
            entityName="Product"
            transform={(row, i) => row.nome ? {
              name: row.nome, code: row.codigo || `IMP-${Date.now()}-${i}`,
              fiscal_description: row.descricao_fiscal || row.nome,
              unit: UNITS.includes(String(row.unidade || "").toUpperCase()) ? String(row.unidade).toUpperCase() : "UN",
              ncm: String(row.ncm || "").replace(/\D/g, ""),
              cfop_internal: String(row.cfop || "").replace(/\D/g, ""),
              icms_cst: row.icms_cst || "", icms_aliquota: Number(row.icms_aliquota || 0),
              icms_aliquota_configurada: row.icms_aliquota !== undefined && row.icms_aliquota !== null,
              pis_cst: row.pis_cst || "", pis_aliquota: Number(row.pis_aliquota || 0),
              pis_aliquota_configurada: row.pis_aliquota !== undefined && row.pis_aliquota !== null,
              cofins_cst: row.cofins_cst || "", cofins_aliquota: Number(row.cofins_aliquota || 0),
              cofins_aliquota_configurada: row.cofins_aliquota !== undefined && row.cofins_aliquota !== null,
              sale_price: Number(row.preco_venda || 0),
              accountant_approved: false, company_id: companyId, is_active: true,
              observacao_fiscal: "Importado do emissor antigo - revisar com contador"
            } : null}
          />
        </TabsContent>

        <TabsContent value="notas" className="mt-5">
          <ImportUploader
            title="Importar Notas Emitidas (Histórico)"
            description="Envie o relatório de notas já autorizadas no emissor antigo. Elas ficam salvas apenas como histórico — não são reenviadas à SEFAZ."
            warning="Notas importadas não podem ser canceladas ou reemitidas por aqui. Cancelamentos de notas antigas devem ser feitos no emissor de origem."
            jsonSchema={invoiceSchema}
            columns={[
              { key: "numero", label: "Número" }, { key: "serie", label: "Série" },
              { key: "data_emissao", label: "Emissão" }, { key: "destinatario_nome", label: "Destinatário" },
              { key: "valor_total", label: "Total" }, { key: "chave_acesso", label: "Chave" }
            ]}
            entityName="FiscalInvoice"
            transform={(row) => (row.numero && row.destinatario_cpf_cnpj) ? {
              reference: `LEG-${String(row.numero).padStart(6, "0")}`,
              company_id: companyId, document_type: "nfe",
              serie: String(row.serie || "1"), number: Number(String(row.numero).replace(/\D/g, "")) || undefined,
              status: "autorizada", environment: "producao", origin: "manual",
              issue_date: row.data_emissao || "",
              recipient_name: row.destinatario_nome || "",
              recipient_cpf_cnpj: String(row.destinatario_cpf_cnpj),
              api_access_key: String(row.chave_acesso || "").replace(/\D/g, ""),
              total: Number(row.valor_total || 0), subtotal: Number(row.valor_total || 0),
              items: [{
                sequence: 1, product_name: row.descricao_itens || "Histórico importado do emissor antigo",
                quantity: 1, unit_price: Number(row.valor_total || 0), total: Number(row.valor_total || 0)
              }],
              notes: "Nota importada do emissor antigo (histórico)"
            } : null}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}