import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Plus, Search, CheckCircle, XCircle, Clock, CreditCard } from "lucide-react";
import { formatCurrency, formatDate } from "@/components/utils/formatters";
import PaymentDialog from "@/components/purchaseOrders/PaymentDialog";

export default function PurchaseOrders() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentOrder, setPaymentOrder] = useState(null);

  const companyId = localStorage.getItem("selectedCompanyId");

  const [formData, setFormData] = useState({
    supplier_id: "",
    item_name: "",
    quantity: "",
    unit: "TON",
    order_date: new Date().toISOString().split("T")[0],
    expected_delivery_date: "",
    price_per_unit: "",
    notes: "",
  });

  // Fetch data
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["purchaseOrders", companyId],
    queryFn: () => base44.entities.PurchaseOrder.filter({ company_id: companyId }, "-created_date"),
    enabled: !!companyId,
  });

  const { data: allPayments = [] } = useQuery({
    queryKey: ["purchaseOrderPayments", companyId],
    queryFn: () => base44.entities.PurchaseOrderPayment.filter({ company_id: companyId }),
    enabled: !!companyId,
  });

  const { data: suppliers = [] } = useQuery({
    queryKey: ["suppliers", companyId],
    queryFn: async () => {
      const contacts = await base44.entities.Contact.filter({ company_id: companyId, is_active: true });
      return contacts.filter(c => c.type === "fornecedor" || c.type === "ambos");
    },
    enabled: !!companyId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["financialAccounts", companyId],
    queryFn: () => base44.entities.FinancialAccount.filter({ company_id: companyId, is_active: true }),
    enabled: !!companyId,
  });

  // Generate reference
  const generateReference = async () => {
    const allOrders = await base44.entities.PurchaseOrder.list();
    const count = allOrders.length + 1;
    return `OC-${String(count).padStart(5, "0")}`;
  };

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const reference = await generateReference();
      const supplier = suppliers.find(s => s.id === data.supplier_id);
      const total_amount = parseFloat(data.quantity) * parseFloat(data.price_per_unit);

      return base44.entities.PurchaseOrder.create({
        ...data,
        reference,
        supplier_name: supplier?.name || "",
        total_amount,
        company_id: companyId,
        status: "pendente",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["purchaseOrders"]);
      setShowForm(false);
      resetForm();
      toast.success("Pedido de compra criado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao criar pedido: " + error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PurchaseOrder.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["purchaseOrders"]);
      setShowForm(false);
      setEditingOrder(null);
      resetForm();
      toast.success("Pedido atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar pedido: " + error.message);
    },
  });

  // Mark as received mutation
  const markAsReceivedMutation = useMutation({
    mutationFn: async (order) => {
      // Get primary account
      const primaryAccount = accounts.find(acc => acc.name.toLowerCase().includes("principal") || acc.name.toLowerCase().includes("caixa")) || accounts[0];
      
      if (!primaryAccount) {
        throw new Error("Nenhuma conta financeira encontrada");
      }

      // Create transaction (faturado = pago)
      const transaction = await base44.entities.Transaction.create({
        description: `Pedido de Compra ${order.reference} - ${order.item_name}`,
        amount: order.total_amount,
        original_amount: order.total_amount,
        type: "despesa",
        category: "Compras de Insumos",
        status: "pago",
        due_date: order.expected_delivery_date,
        payment_date: new Date().toISOString().split("T")[0],
        account_id: primaryAccount.id,
        contact_id: order.supplier_id,
        contact_name: order.supplier_name,
        company_id: companyId,
        paid_amount: order.total_amount,
        notes: `Referente ao pedido ${order.reference}`,
      });

      // Update order status and link transaction
      await base44.entities.PurchaseOrder.update(order.id, {
        status: "recebido",
        transaction_id: transaction.id,
      });

      // Update account balance
      await base44.entities.FinancialAccount.update(primaryAccount.id, {
        current_balance: primaryAccount.current_balance - order.total_amount,
      });

      return { order, transaction };
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["purchaseOrders"]);
      queryClient.invalidateQueries(["transactions"]);
      queryClient.invalidateQueries(["financialAccounts"]);
      toast.success("Pedido marcado como recebido e lançamento financeiro criado!");
    },
    onError: (error) => {
      toast.error("Erro ao processar recebimento: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      supplier_id: "",
      item_name: "",
      quantity: "",
      unit: "TON",
      order_date: new Date().toISOString().split("T")[0],
      expected_delivery_date: "",
      price_per_unit: "",
      notes: "",
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!formData.supplier_id || !formData.item_name || !formData.quantity || !formData.price_per_unit) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    if (editingOrder) {
      const supplier = suppliers.find(s => s.id === formData.supplier_id);
      const total_amount = parseFloat(formData.quantity) * parseFloat(formData.price_per_unit);
      updateMutation.mutate({
        id: editingOrder.id,
        data: { ...formData, supplier_name: supplier?.name || "", total_amount },
      });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (order) => {
    setEditingOrder(order);
    setFormData({
      supplier_id: order.supplier_id,
      item_name: order.item_name,
      quantity: order.quantity,
      unit: order.unit,
      order_date: order.order_date,
      expected_delivery_date: order.expected_delivery_date,
      price_per_unit: order.price_per_unit,
      notes: order.notes || "",
    });
    setShowForm(true);
  };

  const handleStatusChange = (order, newStatus) => {
    if (newStatus === "recebido") {
      if (window.confirm(`Deseja marcar o pedido ${order.reference} como recebido? Isso criará um lançamento financeiro automático.`)) {
        markAsReceivedMutation.mutate(order);
      }
    } else {
      updateMutation.mutate({ id: order.id, data: { status: newStatus } });
    }
  };

  // Filter orders
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = order.reference.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           order.supplier_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           order.item_name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === "all" || order.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchTerm, statusFilter]);

  // Stats
  const stats = useMemo(() => {
    const pending = orders.filter(o => o.status === "pendente").length;
    const approved = orders.filter(o => o.status === "aprovado").length;
    const received = orders.filter(o => o.status === "recebido").length;
    const totalValue = orders.filter(o => o.status !== "cancelado").reduce((sum, o) => sum + o.total_amount, 0);
    return { pending, approved, received, totalValue };
  }, [orders]);

  const getStatusBadge = (status) => {
    const config = {
      pendente: { label: "Pendente", variant: "secondary", icon: Clock },
      aprovado: { label: "Aprovado", variant: "default", icon: CheckCircle },
      recebido: { label: "Recebido", variant: "default", icon: CheckCircle },
      cancelado: { label: "Cancelado", variant: "destructive", icon: XCircle },
    };
    const { label, variant, icon: Icon } = config[status] || config.pendente;
    return (
      <Badge variant={variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </Badge>
    );
  };

  if (!companyId) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-600">Selecione uma filial para continuar</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Pedidos de Compra</h1>
            <p className="text-slate-600 mt-1">Gerencie seus pedidos de insumos</p>
          </div>
          <Button onClick={() => { setShowForm(true); setEditingOrder(null); resetForm(); }} className="gap-2">
            <Plus className="w-4 h-4" />
            Novo Pedido
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Pendentes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-yellow-600">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Aprovados</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-blue-600">{stats.approved}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Recebidos</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{stats.received}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-slate-600">Valor Total</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-purple-600">{formatCurrency(stats.totalValue)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar por referência, fornecedor ou item..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Status</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="recebido">Recebido</SelectItem>
                  <SelectItem value="cancelado">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="pt-6">
            {isLoading ? (
              <p className="text-center py-8 text-slate-600">Carregando...</p>
            ) : filteredOrders.length === 0 ? (
              <p className="text-center py-8 text-slate-600">Nenhum pedido encontrado</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referência</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Quantidade</TableHead>
                    <TableHead>Valor Unit.</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Pago</TableHead>
                    <TableHead>Data Pedido</TableHead>
                    <TableHead>Previsão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-medium">{order.reference}</TableCell>
                      <TableCell>{order.supplier_name}</TableCell>
                      <TableCell>{order.item_name}</TableCell>
                      <TableCell>{order.quantity} {order.unit}</TableCell>
                      <TableCell>{formatCurrency(order.price_per_unit)}</TableCell>
                      <TableCell className="font-semibold">{formatCurrency(order.total_amount)}</TableCell>
                      <TableCell>
                        {(() => {
                          const paid = allPayments.filter(p => p.purchase_order_id === order.id).reduce((s, p) => s + p.amount, 0);
                          const pct = order.total_amount > 0 ? Math.round((paid / order.total_amount) * 100) : 0;
                          return (
                            <div>
                              <span className="font-medium text-green-700">{formatCurrency(paid)}</span>
                              {paid > 0 && paid < order.total_amount && (
                                <div className="text-xs text-slate-400">{pct}%</div>
                              )}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>{formatDate(order.order_date)}</TableCell>
                      <TableCell>{formatDate(order.expected_delivery_date)}</TableCell>
                      <TableCell>{getStatusBadge(order.status)}</TableCell>
                      <TableCell>
                       <div className="flex gap-2 flex-wrap">
                         {order.status === "pendente" && (
                           <>
                             <Button size="sm" variant="outline" onClick={() => handleEdit(order)}>
                               Editar
                             </Button>
                             <Button size="sm" onClick={() => handleStatusChange(order, "aprovado")}>
                               Aprovar
                             </Button>
                           </>
                         )}
                         {(order.status === "aprovado" || order.status === "pendente") && (
                           <Button size="sm" variant="outline" className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50" onClick={() => setPaymentOrder(order)}>
                             <CreditCard className="w-3 h-3" />
                             Pagar
                           </Button>
                         )}
                         {order.status !== "cancelado" && order.status !== "recebido" && (
                           <Button size="sm" variant="destructive" onClick={() => handleStatusChange(order, "cancelado")}>
                             Cancelar
                           </Button>
                         )}
                       </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Form Dialog */}
        <Dialog open={showForm} onOpenChange={setShowForm}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingOrder ? "Editar Pedido" : "Novo Pedido de Compra"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fornecedor *</Label>
                  <Select value={formData.supplier_id} onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o fornecedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Item *</Label>
                  <Input
                    value={formData.item_name}
                    onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                    placeholder="Ex: Calcário Pedra"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Quantidade *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Unidade</Label>
                  <Select value={formData.unit} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TON">TON</SelectItem>
                      <SelectItem value="KG">KG</SelectItem>
                      <SelectItem value="UN">UN</SelectItem>
                      <SelectItem value="M3">M3</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Preço Unitário *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.price_per_unit}
                    onChange={(e) => setFormData({ ...formData, price_per_unit: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Valor Total</Label>
                  <Input
                    value={formatCurrency((parseFloat(formData.quantity) || 0) * (parseFloat(formData.price_per_unit) || 0))}
                    disabled
                  />
                </div>

                <div className="space-y-2">
                  <Label>Data do Pedido</Label>
                  <Input
                    type="date"
                    value={formData.order_date}
                    onChange={(e) => setFormData({ ...formData, order_date: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Previsão de Entrega</Label>
                  <Input
                    type="date"
                    value={formData.expected_delivery_date}
                    onChange={(e) => setFormData({ ...formData, expected_delivery_date: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingOrder ? "Atualizar" : "Criar Pedido"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}