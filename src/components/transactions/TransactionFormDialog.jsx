import React, { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, TrendingDown, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { formatBRL, getTodayDate } from "@/components/utils/formatters";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/components/utils/categories";
import CategorySuggestion from "@/components/transactions/CategorySuggestion";
import CostCenterSuggestion from "@/components/transactions/CostCenterSuggestion";
import BranchBadge from "@/components/BranchBadge";

const emptyForm = {
  description: "",
  amount: 0,
  original_amount: 0,
  discount_type: "valor",
  discount_value: 0,
  type: "receita",
  category: "",
  status: "pendente",
  due_date: getTodayDate(),
  payment_date: getTodayDate(),
  account_id: "",
  contact_id: "",
  cost_center: "",
  notes: ""
};

export default function TransactionFormDialog({
  open,
  onOpenChange,
  editingTransaction,
  initialData,
  accounts,
  contacts,
  transactions,
  onSubmit,
  isSubmitting
}) {
  const [formData, setFormData] = useState(emptyForm);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [openCategoryCombobox, setOpenCategoryCombobox] = useState(false);

  // Sincroniza o formulário quando abre (novo) ou quando muda o lançamento editado
  useEffect(() => {
    if (!open) return;
    if (editingTransaction) {
      setFormData({
        description: editingTransaction.description || "",
        amount: editingTransaction.amount || 0,
        original_amount: editingTransaction.original_amount || editingTransaction.amount || 0,
        discount_type: editingTransaction.discount_type || "valor",
        discount_value: editingTransaction.discount_value || 0,
        type: editingTransaction.type || "receita",
        category: editingTransaction.category || "",
        status: editingTransaction.status || "pendente",
        due_date: editingTransaction.due_date || getTodayDate(),
        payment_date: editingTransaction.payment_date || getTodayDate(),
        account_id: editingTransaction.account_id || "",
        contact_id: editingTransaction.contact_id || "",
        cost_center: editingTransaction.cost_center || "",
        notes: editingTransaction.notes || ""
      });
    } else if (initialData) {
      setFormData({ ...emptyForm, due_date: getTodayDate(), payment_date: getTodayDate(), ...initialData });
    } else {
      // Sempre recalcula a data de hoje ao abrir um novo lançamento — emptyForm é
      // constante de módulo e ficaria defasado se o app ficar aberto entre dias.
      setFormData({ ...emptyForm, due_date: getTodayDate(), payment_date: getTodayDate() });
    }
  }, [open, editingTransaction, initialData]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const original = parseFloat(formData.original_amount || 0);
    const discVal = parseFloat(formData.discount_value || 0);
    let finalAmount = original;
    let totalDiscount = 0;

    if (formData.discount_type === "porcentagem") {
      totalDiscount = (original * discVal) / 100;
      finalAmount = original - totalDiscount;
    } else {
      totalDiscount = discVal;
      finalAmount = original - totalDiscount;
    }

    const dataToSubmit = {
      ...formData,
      amount: finalAmount,
      discount: totalDiscount,
      original_amount: original,
      discount_type: formData.discount_type,
      discount_value: discVal,
      paid_amount: formData.status === "pago" ? finalAmount : (formData.paid_amount || 0)
    };

    onSubmit(dataToSubmit);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingTransaction ? "Editar" : "Novo"} Lançamento</DialogTitle>
        </DialogHeader>
        <BranchBadge className="mb-2" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="dados">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dados">Dados</TabsTrigger>
              <TabsTrigger value="pagamento">Pagamento</TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "receita" })}
                    className={cn("flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm transition-all",
                      formData.type === "receita" ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}
                  >
                    <TrendingUp className="w-4 h-4" /> Entrada
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, type: "despesa" })}
                    className={cn("flex items-center justify-center gap-2 py-3 rounded-lg border-2 font-semibold text-sm transition-all",
                      formData.type === "despesa" ? "border-red-500 bg-red-50 text-red-700" : "border-slate-200 text-slate-500 hover:border-slate-300")}
                  >
                    <TrendingDown className="w-4 h-4" /> Saída
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label>Valor Original (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    required
                    value={formData.original_amount}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value || 0);
                      setFormData(prev => {
                        const discVal = parseFloat(prev.discount_value || 0);
                        const disc = prev.discount_type === "porcentagem"
                          ? (val * discVal / 100)
                          : discVal;
                        return { ...prev, original_amount: e.target.value, amount: val - disc };
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Desconto</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.discount_type}
                      onValueChange={(val) => {
                        setFormData(prev => {
                          const orig = parseFloat(prev.original_amount || 0);
                          const discVal = parseFloat(prev.discount_value || 0);
                          const disc = val === "porcentagem"
                            ? (orig * discVal / 100)
                            : discVal;
                          return { ...prev, discount_type: val, amount: orig - disc };
                        });
                      }}
                    >
                      <SelectTrigger className="w-[80px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="valor">R$</SelectItem>
                        <SelectItem value="porcentagem">%</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.discount_value}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value || 0);
                        setFormData(prev => {
                          const orig = parseFloat(prev.original_amount || 0);
                          const disc = prev.discount_type === "porcentagem"
                            ? (orig * val / 100)
                            : val;
                          return { ...prev, discount_value: e.target.value, amount: orig - disc };
                        });
                      }}
                      placeholder={formData.discount_type === "porcentagem" ? "%" : "R$"}
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border flex justify-between items-center mb-4">
                <span className="text-sm font-medium text-slate-500">Valor Líquido (Final):</span>
                <span className={`text-lg font-bold ${formData.type === "receita" ? "text-green-600" : "text-red-600"}`}>
                  {formatBRL(formData.amount)}
                </span>
              </div>

              <div className="space-y-2">
                <Label>Descrição *</Label>
                <Input
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={formData.type === "receita" ? "Ex: Venda de Mercadoria" : "Ex: Compra de Material"}
                />
                <CategorySuggestion
                  description={formData.description}
                  notes={formData.notes}
                  type={formData.type}
                  transactions={transactions}
                  currentCategory={formData.category}
                  onSuggest={(cat) => {
                    setFormData(prev => ({ ...prev, category: cat }));
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 flex flex-col">
                  <Label>{formData.type === "receita" ? "Categoria de Entrada" : "Categoria de Saída"}</Label>
                  <Popover open={openCategoryCombobox} onOpenChange={setOpenCategoryCombobox}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCategoryCombobox}
                        className="justify-between w-full font-normal"
                      >
                        {formData.category || "Selecione..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Buscar categoria..."
                          onValueChange={(search) => {
                            const cats = formData.type === "receita" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
                            if (search && !cats.includes(search)) {
                              setFormData(prev => ({ ...prev, category: search }));
                            }
                          }}
                        />
                        <CommandList>
                          <CommandEmpty>Digite para criar nova.</CommandEmpty>
                          <CommandGroup heading="Sugestões">
                            {(formData.type === "receita" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((category) => (
                              <CommandItem
                                key={category}
                                value={category}
                                onSelect={(currentValue) => {
                                  setFormData({ ...formData, category: currentValue });
                                  setOpenCategoryCombobox(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    formData.category === category ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {category}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2 flex flex-col">
                  <Label>{formData.type === "receita" ? "Cliente" : "Fornecedor"}</Label>
                  <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={openCombobox}
                        className="justify-between w-full font-normal"
                      >
                        {formData.contact_id
                          ? contacts.find((contact) => contact.id === formData.contact_id)?.name
                          : "Selecione..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Pesquisar..." />
                        <CommandList>
                          <CommandEmpty>Nenhum encontrado.</CommandEmpty>
                          <CommandGroup>
                            {contacts
                              .filter(c => {
                                if (formData.type === "receita") return c.type === "cliente" || c.type === "ambos";
                                return c.type === "fornecedor" || c.type === "ambos";
                              })
                              .map((contact) => (
                                <CommandItem
                                  key={contact.id}
                                  value={contact.name}
                                  onSelect={() => {
                                    setFormData({ ...formData, contact_id: contact.id });
                                    setOpenCombobox(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      formData.contact_id === contact.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {contact.name}
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Centro de Custo</Label>
                <Input
                  value={formData.cost_center}
                  onChange={e => setFormData({ ...formData, cost_center: e.target.value })}
                  placeholder="Ex: Administrativo, Frota, Obras, Vendas..."
                />
                <CostCenterSuggestion
                  description={formData.description}
                  category={formData.category}
                  notes={formData.notes}
                  transactions={transactions}
                  currentCostCenter={formData.cost_center}
                  onSuggest={(cc) => setFormData(prev => ({ ...prev, cost_center: cc }))}
                />
                <p className="text-xs text-slate-500">Necessário para o extrato por centro de custo e abatimentos.</p>
              </div>

              <div className="space-y-2">
                <Label>Data de Vencimento *</Label>
                <Input
                  type="date"
                  required
                  value={formData.due_date}
                  onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </TabsContent>

            <TabsContent value="pagamento" className="space-y-4">
              <div className="space-y-2">
                <Label>Status *</Label>
                <Select
                  required
                  value={formData.status}
                  onValueChange={(value) => setFormData({
                    ...formData,
                    status: value,
                    payment_date: value === "pago" && !formData.payment_date ? getTodayDate() : formData.payment_date
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="parcial">Parcial</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.status === "pago" && (
                <>
                  <div className="space-y-2">
                    <Label>Data de Pagamento *</Label>
                    <Input
                      type="date"
                      required
                      value={formData.payment_date}
                      onChange={(e) => setFormData({ ...formData, payment_date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Conta *</Label>
                    <Select
                      required
                      value={formData.account_id}
                      onValueChange={(value) => setFormData({ ...formData, account_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.name} ({formatBRL(account.current_balance)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {editingTransaction ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}