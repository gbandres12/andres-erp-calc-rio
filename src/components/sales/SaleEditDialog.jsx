import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Save, Edit3 } from "lucide-react";
import { formatBRL } from "@/components/utils/formatters";
import { ProductSelector } from "@/components/sales/ProductSelector";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function SaleEditDialog({ sale, products, contacts, open, onClose, onSuccess }) {
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  // Inicializar form quando a venda muda
  useEffect(() => {
    if (sale) {
      setForm({
        client_id: sale.client_id || "",
        client_name: sale.client_name || "",
        seller_name: sale.seller_name || "",
        sale_date: sale.sale_date || "",
        items: (sale.items || []).map(i => ({ ...i })),
        discount: sale.discount || 0,
        shipping: sale.shipping || 0,
        subtotal: sale.subtotal || 0,
        total: sale.total || 0,
        notes: sale.notes || ""
      });
    }
  }, [sale]);

  if (!sale || !form) return null;

  const recalculate = (items, discount, shipping) => {
    const subtotal = items.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
    const total = subtotal - (parseFloat(discount) || 0) + (parseFloat(shipping) || 0);
    return { subtotal, total };
  };

  const updateItem = (idx, field, value) => {
    const items = [...form.items];
    items[idx] = { ...items[idx], [field]: value };

    if (field === "product_id") {
      const prod = products.find(p => p.id === value);
      if (prod) {
        items[idx].product_name = prod.name;
        items[idx].unit = prod.unit;
        items[idx].unit_price = prod.sale_price || 0;
      }
    }

    const qty = parseFloat(items[idx].quantity) || 0;
    const price = parseFloat(items[idx].unit_price) || 0;
    const disc = parseFloat(items[idx].discount) || 0;
    items[idx].total = qty * price - disc;

    const { subtotal, total } = recalculate(items, form.discount, form.shipping);
    setForm({ ...form, items, subtotal, total });
  };

  const addItem = () => {
    const items = [...form.items, { product_id: "", product_name: "", quantity: 0, unit: "UN", unit_price: 0, discount: 0, total: 0 }];
    const { subtotal, total } = recalculate(items, form.discount, form.shipping);
    setForm({ ...form, items, subtotal, total });
  };

  const removeItem = (idx) => {
    const items = form.items.filter((_, i) => i !== idx);
    const { subtotal, total } = recalculate(items, form.discount, form.shipping);
    setForm({ ...form, items, subtotal, total });
  };

  const updateGlobal = (field, value) => {
    const updated = { ...form, [field]: value };
    const { subtotal, total } = recalculate(updated.items, updated.discount, updated.shipping);
    setForm({ ...updated, subtotal, total });
  };

  const handleSave = async () => {
    if (!form.client_id) { toast.error("Selecione o cliente."); return; }
    if (form.items.length === 0) { toast.error("Adicione ao menos um item."); return; }

    setSaving(true);
    try {
      // Recalcular paid/remaining mantendo o que já foi pago
      const newTotal = form.total;
      const paidAmount = sale.paid_amount || 0;
      const newRemaining = Math.max(0, newTotal - paidAmount);
      let paymentStatus = sale.payment_status;
      if (newRemaining <= 0.01) paymentStatus = "pago";
      else if (paidAmount > 0) paymentStatus = "parcial";
      else paymentStatus = "pendente";

      await base44.entities.Sale.update(sale.id, {
        client_id: form.client_id,
        client_name: form.client_name,
        seller_name: form.seller_name,
        sale_date: form.sale_date,
        items: form.items,
        subtotal: form.subtotal,
        discount: parseFloat(form.discount) || 0,
        shipping: parseFloat(form.shipping) || 0,
        total: form.total,
        remaining_amount: newRemaining,
        payment_status: paymentStatus,
        notes: form.notes
      });

      toast.success("Venda atualizada com sucesso!");
      onSuccess();
      onClose();
    } catch (e) {
      toast.error("Erro ao salvar: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-blue-600" />
            Editar Venda — {sale.reference}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Dados gerais */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Select value={form.client_id} onValueChange={v => {
                const c = contacts.find(x => x.id === v);
                setForm({ ...form, client_id: v, client_name: c?.name || "" });
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vendedor</Label>
              <Input value={form.seller_name} onChange={e => setForm({ ...form, seller_name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data da Venda</Label>
              <Input type="date" value={form.sale_date} onChange={e => setForm({ ...form, sale_date: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Observações</Label>
              <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>

          {/* Itens */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <Label className="font-semibold">Itens da Venda</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Item
              </Button>
            </div>
            <div className="space-y-3">
              {form.items.map((item, idx) => (
                <Card key={idx} className="border-slate-200">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-6 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">Produto</Label>
                        <ProductSelector
                          products={products}
                          value={item.product_id}
                          onChange={v => updateItem(idx, "product_id", v)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Quantidade</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.quantity}
                          onChange={e => updateItem(idx, "quantity", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Preço Un.</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={e => updateItem(idx, "unit_price", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Desconto</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.discount}
                          onChange={e => updateItem(idx, "discount", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total</Label>
                        <div className="flex gap-1">
                          <Input
                            value={formatBRL(item.total)}
                            readOnly
                            className="bg-slate-50 text-sm"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(idx)}
                            disabled={form.items.length === 1}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Totais */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="grid grid-cols-3 gap-4 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Desconto Geral</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.discount}
                    onChange={e => updateGlobal("discount", e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Frete</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.shipping}
                    onChange={e => updateGlobal("shipping", e.target.value)}
                  />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 mb-1">TOTAL</p>
                  <p className="text-3xl font-bold text-blue-700">{formatBRL(form.total)}</p>
                  {(sale.paid_amount || 0) > 0 && (
                    <p className="text-xs text-slate-500 mt-1">
                      Já pago: {formatBRL(sale.paid_amount)} • Restante: {formatBRL(Math.max(0, form.total - sale.paid_amount))}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t mt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-blue-600 hover:bg-blue-700">
            <Save className="w-4 h-4 mr-2" />
            {saving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}