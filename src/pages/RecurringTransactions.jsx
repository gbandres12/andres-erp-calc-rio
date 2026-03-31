import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, RepeatIcon, ArrowDownCircle, ArrowUpCircle, PlayCircle, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "@/components/utils/formatters";

const FREQUENCY_LABELS = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

const EMPTY_FORM = {
  description: "",
  type: "despesa",
  amount: "",
  category: "",
  frequency: "mensal",
  day_of_month: "",
  account_id: "",
  contact_id: "",
  contact_name: "",
  is_active: true,
  notes: "",
  next_due_date: "",
};

export default function RecurringTransactions() {
  const queryClient = useQueryClient();
  const [selectedCompanyId] = useState(localStorage.getItem("selectedCompanyId"));
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [filterType, setFilterType] = useState("all");

  const { data: recurrings = [] } = useQuery({
    queryKey: ["recurrings", selectedCompanyId],
    queryFn: () => base44.entities.RecurringTransaction.filter({ company_id: selectedCompanyId }),
    initialData: [],
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts", selectedCompanyId],
    queryFn: () => base44.entities.FinancialAccount.filter({ company_id: selectedCompanyId }),
    initialData: [],
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: () => base44.entities.Contact.filter({ is_active: true }),
    initialData: [],
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      const payload = {
        ...data,
        amount: parseFloat(data.amount) || 0,
        day_of_month: parseInt(data.day_of_month) || null,
        company_id: selectedCompanyId,
      };
      return editingId
        ? base44.entities.RecurringTransaction.update(editingId, payload)
        : base44.entities.RecurringTransaction.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["recurrings"]);
      setIsDialogOpen(false);
      setEditingId(null);
      setFormData(EMPTY_FORM);
      toast.success(editingId ? "Recorrência atualizada!" : "Recorrência criada!");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.RecurringTransaction.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["recurrings"]);
      toast.success("Recorrência removida.");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.RecurringTransaction.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries(["recurrings"]),
  });

  // Generate a real Transaction from a recurring
  const generateMutation = useMutation({
    mutationFn: async (rec) => {
      const today = new Date().toISOString().split("T")[0];
      await base44.entities.Transaction.create({
        description: rec.description,
        type: rec.type,
        amount: rec.amount,
        category: rec.category || "",
        status: "pendente",
        due_date: rec.next_due_date || today,
        account_id: rec.account_id || null,
        contact_id: rec.contact_id || null,
        contact_name: rec.contact_name || "",
        company_id: rec.company_id,
        notes: `[Recorrente] ${rec.notes || ""}`,
      });
      // Update last generated date
      const nextDate = calcNextDate(rec.next_due_date || today, rec.frequency);
      await base44.entities.RecurringTransaction.update(rec.id, {
        last_generated_date: today,
        next_due_date: nextDate,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["recurrings"]);
      queryClient.invalidateQueries(["transactions"]);
      toast.success("Lançamento gerado com sucesso!");
    },
  });

  function calcNextDate(fromDate, frequency) {
    const d = new Date(fromDate + "T12:00:00");
    const map = { diaria: 1, semanal: 7, quinzenal: 15, mensal: 30, bimestral: 60, trimestral: 90, semestral: 180, anual: 365 };
    d.setDate(d.getDate() + (map[frequency] || 30));
    return d.toISOString().split("T")[0];
  }

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const openEdit = (rec) => {
    setEditingId(rec.id);
    setFormData({
      description: rec.description || "",
      type: rec.type || "despesa",
      amount: rec.amount || "",
      category: rec.category || "",
      frequency: rec.frequency || "mensal",
      day_of_month: rec.day_of_month || "",
      account_id: rec.account_id || "",
      contact_id: rec.contact_id || "",
      contact_name: rec.contact_name || "",
      is_active: rec.is_active !== false,
      notes: rec.notes || "",
      next_due_date: rec.next_due_date || "",
    });
    setIsDialogOpen(true);
  };

  const filtered = useMemo(() => {
    if (filterType === "all") return recurrings;
    return recurrings.filter((r) => r.type === filterType);
  }, [recurrings, filterType]);

  const totalMonthlyExpense = recurrings
    .filter((r) => r.type === "despesa" && r.is_active !== false)
    .reduce((sum, r) => sum + (r.amount || 0), 0);
  const totalMonthlyRevenue = recurrings
    .filter((r) => r.type === "receita" && r.is_active !== false)
    .reduce((sum, r) => sum + (r.amount || 0), 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <RepeatIcon className="w-7 h-7 text-purple-600" />
            Recorrências
          </h1>
          <p className="text-slate-500 mt-1">Gerencie despesas e receitas recorrentes</p>
        </div>
        <Button onClick={openCreate} className="bg-purple-600 hover:bg-purple-700">
          <Plus className="w-4 h-4 mr-2" /> Nova Recorrência
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-gradient-to-br from-red-500 to-red-600 text-white">
          <CardContent className="p-4">
            <p className="text-red-100 text-sm">Despesas Recorrentes / mês</p>
            <p className="text-2xl font-bold mt-1">{formatBRL(totalMonthlyExpense)}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="p-4">
            <p className="text-green-100 text-sm">Receitas Recorrentes / mês</p>
            <p className="text-2xl font-bold mt-1">{formatBRL(totalMonthlyRevenue)}</p>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br text-white ${totalMonthlyRevenue - totalMonthlyExpense >= 0 ? "from-blue-500 to-blue-600" : "from-orange-500 to-orange-600"}`}>
          <CardContent className="p-4">
            <p className="text-white/80 text-sm">Saldo Recorrente / mês</p>
            <p className="text-2xl font-bold mt-1">{formatBRL(totalMonthlyRevenue - totalMonthlyExpense)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {["all", "despesa", "receita"].map((t) => (
          <Button
            key={t}
            variant={filterType === t ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterType(t)}
          >
            {t === "all" ? "Todas" : t === "despesa" ? "Despesas" : "Receitas"}
          </Button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-slate-500">
              <RepeatIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Nenhuma recorrência cadastrada ainda.</p>
            </CardContent>
          </Card>
        )}
        {filtered.map((rec) => (
          <Card key={rec.id} className={`border ${rec.is_active === false ? "opacity-50 bg-slate-50" : ""}`}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${rec.type === "despesa" ? "bg-red-100" : "bg-green-100"}`}>
                {rec.type === "despesa" ? (
                  <ArrowDownCircle className="w-5 h-5 text-red-600" />
                ) : (
                  <ArrowUpCircle className="w-5 h-5 text-green-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-800">{rec.description}</p>
                  <Badge variant="outline" className="text-xs">{FREQUENCY_LABELS[rec.frequency] || rec.frequency}</Badge>
                  {rec.category && <Badge variant="secondary" className="text-xs">{rec.category}</Badge>}
                  {rec.is_active === false && <Badge className="text-xs bg-slate-200 text-slate-500">Inativo</Badge>}
                </div>
                <div className="flex gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                  {rec.contact_name && <span>👤 {rec.contact_name}</span>}
                  {rec.next_due_date && <span>📅 Próximo: {new Date(rec.next_due_date + "T12:00:00").toLocaleDateString("pt-BR")}</span>}
                  {rec.day_of_month && <span>📆 Dia {rec.day_of_month}</span>}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className={`text-xl font-bold ${rec.type === "despesa" ? "text-red-600" : "text-green-600"}`}>
                  {rec.type === "despesa" ? "-" : "+"}{formatBRL(rec.amount)}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Switch
                  checked={rec.is_active !== false}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: rec.id, is_active: v })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  title="Gerar Lançamento Agora"
                  onClick={() => generateMutation.mutate(rec)}
                  disabled={generateMutation.isPending}
                >
                  <PlayCircle className="w-4 h-4 text-purple-600" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(rec)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => { if (confirm("Remover esta recorrência?")) deleteMutation.mutate(rec.id); }}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Recorrência" : "Nova Recorrência"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(formData); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Descrição *</Label>
                <Input required value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Ex: Aluguel, Salário, Luz..." />
              </div>
              <div className="space-y-1">
                <Label>Tipo *</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="despesa">💸 Despesa</SelectItem>
                    <SelectItem value="receita">💰 Receita</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Valor *</Label>
                <Input required type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({ ...formData, amount: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1">
                <Label>Frequência</Label>
                <Select value={formData.frequency} onValueChange={(v) => setFormData({ ...formData, frequency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FREQUENCY_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Dia do Mês</Label>
                <Input type="number" min="1" max="31" value={formData.day_of_month} onChange={(e) => setFormData({ ...formData, day_of_month: e.target.value })} placeholder="Ex: 5, 10, 25" />
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Input value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} placeholder="Ex: Aluguel, Folha..." />
              </div>
              <div className="space-y-1">
                <Label>Próximo Vencimento</Label>
                <Input type="date" value={formData.next_due_date} onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Conta Financeira</Label>
                <Select value={formData.account_id} onValueChange={(v) => setFormData({ ...formData, account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Nenhuma</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Contato (Cliente/Fornecedor)</Label>
                <Select value={formData.contact_id} onValueChange={(v) => {
                  const c = contacts.find((x) => x.id === v);
                  setFormData({ ...formData, contact_id: v, contact_name: c?.name || "" });
                }}>
                  <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Nenhum</SelectItem>
                    {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Observações</Label>
                <Textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} rows={2} />
              </div>
              <div className="col-span-2 flex items-center gap-3">
                <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                <Label>Recorrência Ativa</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending} className="bg-purple-600 hover:bg-purple-700">
                {editingId ? "Salvar Alterações" : "Criar Recorrência"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}