import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Plus, Trash2, Save } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import ContactCombobox from "@/components/fiscal/ContactCombobox";

const PAYMENT_METHODS = [
  { value: "01", label: "Dinheiro" },
  { value: "02", label: "Cheque" },
  { value: "03", label: "Cartão de Crédito" },
  { value: "04", label: "Cartão de Débito" },
  { value: "15", label: "Boleto Bancário" },
  { value: "90", label: "Sem Pagamento" },
  { value: "99", label: "Outros" },
];

const emptyItem = { sequence: 1, product_name: "", product_code: "", ncm: "", cfop: "", cst: "", csosn: "", unit: "TON", quantity: 1, unit_price: 0, discount: 0, total: 0 };

const fiscalSnapshot = (product, config, recipientUf) => {
  if (!product) return {};
  const internal = !recipientUf || !config?.uf || recipientUf === config.uf;
  return {
    product_id: product.id, product_name: product.fiscal_description || product.name, product_code: product.code || "",
    ncm: product.ncm || "", cest: product.cest || "", cfop: (internal ? product.cfop_internal : product.cfop_interstate) || product.cfop || "",
    tax_classification: product.tax_classification || "", cst: config?.crt === 1 ? "" : product.icms_cst || "",
    csosn: config?.crt === 1 ? product.icms_csosn || "" : "", unit: product.unit || "UN",
    icms_cst: product.icms_cst || "", icms_csosn: product.icms_csosn || "", icms_base: product.icms_base || 0,
    icms_aliquota: product.icms_aliquota ?? 0, icms_aliquota_configurada: !!product.icms_aliquota_configurada, icms_valor: product.icms_valor || 0,
    pis_cst: product.pis_cst || "", pis_base: product.pis_base || 0, pis_aliquota: product.pis_aliquota ?? 0,
    pis_aliquota_configurada: !!product.pis_aliquota_configurada, pis_valor: product.pis_valor || 0,
    cofins_cst: product.cofins_cst || "", cofins_base: product.cofins_base || 0, cofins_aliquota: product.cofins_aliquota ?? 0,
    cofins_aliquota_configurada: !!product.cofins_aliquota_configurada, cofins_valor: product.cofins_valor || 0,
    ibs_cbs_cst: product.ibs_cbs_cst || "", classificacao_tributaria: product.classificacao_tributaria || "",
    ibs_aliquota: product.ibs_aliquota ?? 0, ibs_aliquota_configurada: !!product.ibs_aliquota_configurada,
    cbs_aliquota: product.cbs_aliquota ?? 0, cbs_aliquota_configurada: !!product.cbs_aliquota_configurada,
    accountant_approved: !!product.accountant_approved, fiscal_review_date: product.fiscal_review_date || ""
  };
};

export default function FiscalInvoiceForm() {
  const companyId = localStorage.getItem("selectedCompanyId");
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const saleId = urlParams.get("sale_id");
  const invoiceId = urlParams.get("id");

  const [form, setForm] = useState({
    company_id: companyId,
    document_type: "nfe",
    serie: "1",
    status: "rascunho",
    origin: saleId ? "from_sale" : "manual",
    ...(saleId ? { sale_id: saleId } : {}),
    issue_date: new Date().toISOString().split("T")[0],
    nature_operation: "Venda de produto",
    payment_method: "99",
    items: [{ ...emptyItem }],
    subtotal: 0, discount_total: 0, shipping: 0, total: 0
  });

  const { data: configs = [] } = useQuery({
    queryKey: ["fiscal_config", companyId],
    queryFn: () => base44.entities.FiscalConfig.filter({ company_id: companyId }),
    enabled: !!companyId
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts_active", companyId],
    queryFn: () => base44.entities.Contact.filter({ company_id: companyId }, "name", 2000),
    enabled: !!companyId
  });

  const { data: products = [] } = useQuery({
    queryKey: ["fiscal_products", companyId],
    queryFn: () => base44.entities.Product.filter({ company_id: companyId, is_active: true }, "name", 200),
    enabled: !!companyId
  });

  const config = configs[0];

  const { data: existingInvoice } = useQuery({
    queryKey: ["fiscal_invoice_edit", invoiceId],
    queryFn: () => base44.entities.FiscalInvoice.get(invoiceId),
    enabled: !!invoiceId
  });

  useEffect(() => {
    if (existingInvoice) {
      const { id, created_date, updated_date, created_by_id, ...draft } = existingInvoice;
      setForm(draft);
    }
  }, [existingInvoice]);

  useEffect(() => {
    if (config && !invoiceId) {
      setForm(prev => ({
        ...prev,
        environment: config.environment,
        serie: config.serie || "1",
        document_type: config.document_type || "nfe"
      }));
    }
  }, [config]);

  // Se vier de uma venda, pré-carrega os dados
  const { data: sale } = useQuery({
    queryKey: ["sale_for_fiscal", saleId],
    queryFn: () => base44.entities.Sale.get(saleId),
    enabled: !!saleId
  });

  useEffect(() => {
    if (sale) {
      setForm(prev => ({
        ...prev,
        recipient_name: sale.client_name,
        recipient_id: sale.client_id,
        subtotal: sale.subtotal,
        discount_total: sale.discount || 0,
        shipping: sale.shipping || 0,
        total: sale.total,
        items: (sale.items || []).map((item, i) => {
          const product = products.find(p => p.id === item.product_id);
          return {
            sequence: i + 1, ...fiscalSnapshot(product, config, prev.recipient_address?.uf),
            product_id: item.product_id, product_name: product?.fiscal_description || item.product_name,
            unit: item.unit || product?.unit || "TON", quantity: item.quantity, unit_price: item.unit_price,
            discount: item.discount || 0, total: item.total
          };
        })
      }));
    }
  }, [sale, products, config]);

  const setField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const updateItem = (idx, field, value) => {
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = { ...items[idx], [field]: value };
      // Recalcula total do item
      if (["quantity", "unit_price", "discount"].includes(field)) {
        const q = field === "quantity" ? parseFloat(value) || 0 : parseFloat(items[idx].quantity) || 0;
        const p = field === "unit_price" ? parseFloat(value) || 0 : parseFloat(items[idx].unit_price) || 0;
        const d = field === "discount" ? parseFloat(value) || 0 : parseFloat(items[idx].discount) || 0;
        items[idx].total = q * p - d;
      }
      // Recalcula totais
      const subtotal = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
      const discount_total = items.reduce((s, i) => s + (parseFloat(i.discount) || 0), 0);
      const total = subtotal + (parseFloat(prev.shipping) || 0);
      return { ...prev, items, subtotal, discount_total, total };
    });
  };

  const selectProduct = (idx, productId) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    setForm(prev => {
      const items = [...prev.items];
      items[idx] = {
        ...items[idx],
        ...fiscalSnapshot(product, config, prev.recipient_address?.uf)
      };
      return { ...prev, items };
    });
  };

  const addItem = () => {
    setForm(prev => ({
      ...prev,
      items: [...prev.items, { ...emptyItem, sequence: prev.items.length + 1 }]
    }));
  };

  const removeItem = (idx) => {
    setForm(prev => {
      const items = prev.items.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sequence: i + 1 }));
      const subtotal = items.reduce((s, i) => s + (parseFloat(i.total) || 0), 0);
      return { ...prev, items, subtotal, total: subtotal + (parseFloat(prev.shipping) || 0) };
    });
  };

  const handleContactSelect = (contactId) => {
    const contact = contacts.find(c => c.id === contactId);
    if (contact) {
      setForm(prev => ({
        ...prev,
        recipient_id: contact.id,
        recipient_name: contact.name,
        recipient_cpf_cnpj: contact.cpf_cnpj || contact.document,
        recipient_email: contact.email,
        recipient_address: {
          logradouro: contact.address || "",
          numero: contact.number || "S/N",
          bairro: contact.neighborhood || "",
          municipio: contact.city || "",
          uf: contact.state || "",
          cep: contact.zip_code || ""
        }
      }));
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (invoiceId) return base44.entities.FiscalInvoice.update(invoiceId, data);

      // Gera referência interna
      const allInvoices = await base44.entities.FiscalInvoice.filter({ company_id: companyId });
      let maxNum = 0;
      allInvoices.forEach(inv => {
        const match = inv.reference?.match(/^NF-(\d+)$/);
        if (match) { const n = parseInt(match[1], 10); if (n > maxNum) maxNum = n; }
      });
      const reference = `NF-${String(maxNum + 1).padStart(6, "0")}`;
      const idempotency_key = `${companyId}-${data.document_type}-${data.serie}-${reference}`;
      return base44.entities.FiscalInvoice.create({ ...data, reference, idempotency_key });
    },
    onSuccess: (inv) => {
      toast.success(invoiceId ? "Rascunho atualizado!" : "Nota criada como rascunho!");
      navigate(`${createPageUrl("FiscalInvoiceDetail")}?id=${inv.id || invoiceId}`);
    },
    onError: (e) => toast.error(e.message)
  });

  const isValid = form.recipient_cpf_cnpj && form.items.length > 0 && form.total > 0;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={createPageUrl("FiscalInvoices")}><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{invoiceId ? "Editar Nota Fiscal" : "Nova Nota Fiscal"}</h1>
          <p className="text-slate-500 text-sm">Preencha os dados e salve como rascunho para emitir</p>
        </div>
      </div>

      {!config && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-700">
          ⚠️ Configure os dados fiscais da empresa em <Link to={createPageUrl("FiscalSettings")} className="underline font-medium">Configurações Fiscais</Link> antes de emitir notas.
        </div>
      )}

      {/* Tipo e ambiente */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 grid md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label>Tipo de Documento</Label>
          <Select value={form.document_type} onValueChange={v => setField("document_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="nfe">NF-e</SelectItem>
              <SelectItem value="nfce">NFC-e</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Série</Label>
          <Input value={form.serie} onChange={e => setField("serie", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Data de Emissão</Label>
          <Input type="date" value={form.issue_date} onChange={e => setField("issue_date", e.target.value)} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Natureza da Operação</Label>
          <Input value={form.nature_operation} onChange={e => setField("nature_operation", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Forma de Pagamento</Label>
          <Select value={form.payment_method} onValueChange={v => setField("payment_method", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Destinatário */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <h3 className="font-semibold text-slate-800">Destinatário</h3>
        <div className="space-y-1">
          <Label>Selecionar Cliente Cadastrado ({contacts.length} disponíveis)</Label>
          <ContactCombobox contacts={contacts} value={form.recipient_id} onSelect={handleContactSelect} />
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label>Nome / Razão Social *</Label>
            <Input value={form.recipient_name || ""} onChange={e => setField("recipient_name", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>CPF / CNPJ *</Label>
            <Input value={form.recipient_cpf_cnpj || ""} onChange={e => setField("recipient_cpf_cnpj", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={form.recipient_email || ""} onChange={e => setField("recipient_email", e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>IE Destinatário</Label>
            <Input value={form.recipient_ie || ""} onChange={e => setField("recipient_ie", e.target.value)} />
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="space-y-1 md:col-span-2">
            <Label>Logradouro *</Label>
            <Input value={form.recipient_address?.logradouro || ""} onChange={e => setField("recipient_address", { ...(form.recipient_address || {}), logradouro: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Número</Label>
            <Input value={form.recipient_address?.numero || ""} onChange={e => setField("recipient_address", { ...(form.recipient_address || {}), numero: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Bairro *</Label>
            <Input value={form.recipient_address?.bairro || ""} onChange={e => setField("recipient_address", { ...(form.recipient_address || {}), bairro: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Município *</Label>
            <Input value={form.recipient_address?.municipio || ""} onChange={e => setField("recipient_address", { ...(form.recipient_address || {}), municipio: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Código IBGE *</Label>
            <Input inputMode="numeric" value={form.recipient_address?.codigoMunicipio || ""} onChange={e => setField("recipient_address", { ...(form.recipient_address || {}), codigoMunicipio: e.target.value.replace(/\D/g, "") })} placeholder="7 dígitos" />
          </div>
          <div className="space-y-1">
            <Label>UF *</Label>
            <Input maxLength={2} value={form.recipient_address?.uf || ""} onChange={e => setField("recipient_address", { ...(form.recipient_address || {}), uf: e.target.value.toUpperCase() })} />
          </div>
          <div className="space-y-1">
            <Label>CEP *</Label>
            <Input value={form.recipient_address?.cep || ""} onChange={e => setField("recipient_address", { ...(form.recipient_address || {}), cep: e.target.value })} />
          </div>
        </div>
      </div>

      {/* Itens */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">Itens</h3>
          <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1" /> Adicionar</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-3 py-2 text-slate-500 font-medium w-8">#</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium min-w-56">Produto / Descrição</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium w-24">NCM</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium w-20">CFOP</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium w-20">CST</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium w-24">IBS (%)</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium w-24">CBS (%)</th>
                <th className="text-left px-3 py-2 text-slate-500 font-medium w-24">Un.</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium w-20">Qtd</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium w-24">Unit.</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium w-20">Desc.</th>
                <th className="text-right px-3 py-2 text-slate-500 font-medium w-24">Total</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {form.items.map((item, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-slate-400">{item.sequence}</td>
                  <td className="px-3 py-2 space-y-1">
                    <Select value={item.product_id || ""} onValueChange={value => selectProduct(idx, value)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Selecionar produto" /></SelectTrigger>
                      <SelectContent>{products.map(product => <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={item.product_name} readOnly className="h-7 text-xs bg-slate-50" />
                  </td>
                  <td className="px-3 py-2"><Input value={item.ncm} onChange={e => updateItem(idx, "ncm", e.target.value)} className="h-7 text-xs" placeholder="00000000" /></td>
                  <td className="px-3 py-2"><Input value={item.cfop} onChange={e => updateItem(idx, "cfop", e.target.value)} className="h-7 text-xs" /></td>
                  <td className="px-3 py-2"><Input value={(config?.crt === 1 ? item.csosn : item.cst) || ""} readOnly className="h-7 text-xs bg-slate-50" placeholder={config?.crt === 1 ? "CSOSN" : "CST"} /></td>
                  <td className="px-3 py-2"><Input type="number" min="0" step="0.0001" value={item.ibs_aliquota ?? 0} onChange={e => updateItem(idx, "ibs_aliquota", e.target.value)} className="h-7 text-xs text-right" /></td>
                  <td className="px-3 py-2"><Input type="number" min="0" step="0.0001" value={item.cbs_aliquota ?? 0} onChange={e => updateItem(idx, "cbs_aliquota", e.target.value)} className="h-7 text-xs text-right" /></td>
                  <td className="px-3 py-2">
                    <Select value={item.unit || "TON"} onValueChange={value => updateItem(idx, "unit", value)}>
                      <SelectTrigger className="h-7 min-w-24 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TON">TON</SelectItem>
                        <SelectItem value="KG">KG</SelectItem>
                        <SelectItem value="UN">UN</SelectItem>
                        <SelectItem value="M3">M³</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2"><Input type="number" value={item.quantity} onChange={e => updateItem(idx, "quantity", e.target.value)} className="h-7 text-xs text-right" /></td>
                  <td className="px-3 py-2"><Input type="number" value={item.unit_price} onChange={e => updateItem(idx, "unit_price", e.target.value)} className="h-7 text-xs text-right" /></td>
                  <td className="px-3 py-2"><Input type="number" value={item.discount} onChange={e => updateItem(idx, "discount", e.target.value)} className="h-7 text-xs text-right" /></td>
                  <td className="px-3 py-2 text-right font-medium text-slate-700">
                    {(Number(item.total) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </td>
                  <td className="px-3 py-2">
                    {form.items.length > 1 && (
                      <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-4 flex justify-end">
          <div className="space-y-1 text-sm w-56">
            <div className="flex justify-between text-slate-500">
              <span>Subtotal:</span>
              <span>{(Number(form.subtotal) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
            <div className="flex justify-between items-center text-slate-500">
              <span>Frete (R$):</span>
              <Input type="number" value={form.shipping} onChange={e => {
                const shipping = parseFloat(e.target.value) || 0;
                setForm(prev => ({ ...prev, shipping, total: prev.subtotal + shipping }));
              }} className="h-6 w-24 text-right text-xs" />
            </div>
            <div className="flex justify-between font-bold text-slate-800 text-base border-t pt-2">
              <span>Total:</span>
              <span>{(Number(form.total) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Observações */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2">
        <Label>Observações (informações adicionais na nota)</Label>
        <Textarea value={form.notes || ""} onChange={e => setField("notes", e.target.value)} rows={3} />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" asChild className="flex-1">
          <Link to={createPageUrl("FiscalInvoices")}>Cancelar</Link>
        </Button>
        <Button
          onClick={() => saveMutation.mutate(form)}
          disabled={saveMutation.isPending || !isValid}
          className="flex-1 bg-violet-600 hover:bg-violet-700"
        >
          <Save className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? "Salvando..." : "Salvar como Rascunho"}
        </Button>
      </div>
    </div>
  );
}