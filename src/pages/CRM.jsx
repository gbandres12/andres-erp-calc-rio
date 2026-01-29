import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Users, Search, FlaskConical, Tractor, LeafyGreen, Target } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export default function CRM() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [searchTerm, setSearchTerm] = useState("");
  const [editingContact, setEditingContact] = useState(null);

  const defaultFormData = {
    name: "",
    document: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    notes: "",
    type: "cliente", // Default type
    status: "prospect",
    planted_area: null,
    limestone_applied: null,
    gypsum_applied: null,
    purchase_potential: "baixo",
  };

  const [formData, setFormData] = useState(defaultFormData);

  const { data: contacts = [], isLoading: isLoadingContacts } = useQuery({
    queryKey: ['contacts', selectedCompanyId],
    queryFn: () => base44.entities.Contact.filter({ company_id: selectedCompanyId }, '-created_date'),
    initialData: [],
  });

  const isCompanyAllowedForCRM = () => {
    const selectedCompanyName = localStorage.getItem('selectedCompanyName');
    return selectedCompanyName && (
      selectedCompanyName.toLowerCase().includes('santarem') || 
      selectedCompanyName.toLowerCase().includes('mucajaí') ||
      selectedCompanyName.toLowerCase().includes('mucajai') // Handle no accent
    );
  };

  const filteredContacts = contacts.filter(contact =>
    contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.document?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const createOrUpdateMutation = useMutation({
    mutationFn: async (data) => {
      if (editingContact) {
        return base44.entities.Contact.update(editingContact.id, data);
      } else {
        return base44.entities.Contact.create({ ...data, company_id: selectedCompanyId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['contacts']);
      setIsDialogOpen(false);
      setEditingContact(null);
      setFormData(defaultFormData);
      toast.success(editingContact ? "Contato atualizado!" : "Novo prospecto criado!");
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    }
  });

  const handleDelete = useMutation({
    mutationFn: (id) => base44.entities.Contact.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['contacts']);
      toast.success("Contato excluído!");
    },
    onError: (error) => {
      toast.error(`Erro: ${error.message}`);
    }
  });

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setFormData({
      ...contact,
      planted_area: contact.planted_area || null,
      limestone_applied: contact.limestone_applied || null,
      gypsum_applied: contact.gypsum_applied || null,
      purchase_potential: contact.purchase_potential || "baixo",
    });
    setIsDialogOpen(true);
  };

  const handleNewContactClick = () => {
    setEditingContact(null);
    setFormData(defaultFormData);
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    createOrUpdateMutation.mutate(formData);
  };

  if (!isCompanyAllowedForCRM()) {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center bg-white rounded-xl shadow-sm mt-10">
        <Target className="w-16 h-16 mx-auto mb-4 text-slate-300" />
        <h2 className="text-2xl font-bold text-slate-900 mb-2">CRM Indisponível nesta Filial</h2>
        <p className="text-slate-600">
          O módulo de CRM está disponível apenas para as unidades de Santarém e Mucajaí.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">CRM & Prospecção</h1>
          <p className="text-slate-500 mt-1">Gerencie seus prospects e clientes agrícolas</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleNewContactClick} className="bg-green-600 hover:bg-green-700">
              <Plus className="w-4 h-4 mr-2" />
              Novo Prospect
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingContact ? "Editar Contato" : "Novo Prospect"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
                  <Target className="w-4 h-4 mr-2" />
                  Status e Potencial
                </h3>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                    <Label htmlFor="status">Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="prospect">Prospect (Potencial)</SelectItem>
                        <SelectItem value="cliente">Cliente (Já comprou)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="purchase_potential">Potencial de Compra</Label>
                    <Select
                      value={formData.purchase_potential}
                      onValueChange={(value) => setFormData({ ...formData, purchase_potential: value })}
                    >
                      <SelectTrigger className="bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixo">Baixo</SelectItem>
                        <SelectItem value="medio">Médio</SelectItem>
                        <SelectItem value="alto">Alto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="text-lg"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone / WhatsApp</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                 <div className="space-y-2">
                  <Label htmlFor="city">Cidade / Região</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>

                <div className="col-span-2 border-t pt-4 mt-2">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
                    <Tractor className="w-4 h-4 mr-2" />
                    Dados Agrícolas
                  </h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="planted_area">Área Plantada (Hectares)</Label>
                  <div className="relative">
                    <Input
                      id="planted_area"
                      type="number"
                      step="0.01"
                      value={formData.planted_area || ""}
                      onChange={(e) => setFormData({ ...formData, planted_area: parseFloat(e.target.value) || null })}
                      className="pl-8"
                    />
                    <LeafyGreen className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="limestone_applied">Calcário (Toneladas)</Label>
                   <div className="relative">
                    <Input
                      id="limestone_applied"
                      type="number"
                      step="0.01"
                      value={formData.limestone_applied || ""}
                      onChange={(e) => setFormData({ ...formData, limestone_applied: parseFloat(e.target.value) || null })}
                      className="pl-8"
                    />
                    <FlaskConical className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gypsum_applied">Gesso (Toneladas)</Label>
                   <div className="relative">
                    <Input
                      id="gypsum_applied"
                      type="number"
                      step="0.01"
                      value={formData.gypsum_applied || ""}
                      onChange={(e) => setFormData({ ...formData, gypsum_applied: parseFloat(e.target.value) || null })}
                      className="pl-8"
                    />
                    <FlaskConical className="w-4 h-4 absolute left-2.5 top-3 text-slate-400" />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observações do Vendedor</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Interesses, data de contato, detalhes da fazenda..."
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createOrUpdateMutation.isPending} className="bg-green-600 hover:bg-green-700">
                  {createOrUpdateMutation.isPending ? "Salvando..." : "Salvar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            placeholder="Buscar por nome, telefone ou cidade..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoadingContacts ? (
           <p className="text-slate-500 col-span-full text-center py-10">Carregando...</p>
        ) : filteredContacts.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-500 bg-white rounded-xl border border-dashed">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Nenhum prospect ou cliente encontrado.</p>
            <Button variant="link" onClick={handleNewContactClick}>Criar o primeiro</Button>
          </div>
        ) : (
          filteredContacts.map((contact) => (
            <Card key={contact.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-2">
                    <Badge variant={contact.status === 'cliente' ? 'default' : 'secondary'} className={contact.status === 'cliente' ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-blue-50 text-blue-700 hover:bg-blue-50'}>
                      {contact.status === 'cliente' ? 'Cliente' : 'Prospect'}
                    </Badge>
                    <Badge variant="outline" className={`
                      ${contact.purchase_potential === 'alto' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                        contact.purchase_potential === 'medio' ? 'bg-slate-50 text-slate-600' : 'text-slate-400'}
                    `}>
                      Potencial {contact.purchase_potential}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2" onClick={() => handleEdit(contact)}>
                    <Target className="w-4 h-4 text-slate-400" />
                  </Button>
                </div>
                
                <h3 className="font-bold text-lg text-slate-900 mb-1">{contact.name}</h3>
                <p className="text-sm text-slate-500 mb-4 flex items-center gap-2">
                   {contact.city && <span>{contact.city}</span>}
                   {contact.phone && <span>• {contact.phone}</span>}
                </p>

                <div className="grid grid-cols-3 gap-2 py-3 border-t border-b border-slate-100 mb-4 bg-slate-50/50 rounded-lg px-2">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Área</p>
                    <p className="font-semibold text-slate-700">{contact.planted_area || '-'} ha</p>
                  </div>
                  <div className="text-center border-l border-slate-200">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Calcário</p>
                    <p className="font-semibold text-slate-700">{contact.limestone_applied || '-'} t</p>
                  </div>
                  <div className="text-center border-l border-slate-200">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">Gesso</p>
                    <p className="font-semibold text-slate-700">{contact.gypsum_applied || '-'} t</p>
                  </div>
                </div>

                {contact.notes && (
                  <p className="text-xs text-slate-500 italic line-clamp-2 mb-3">
                    "{contact.notes}"
                  </p>
                )}

                <div className="flex gap-2 mt-auto">
                   <Button className="w-full" variant="outline" size="sm" onClick={() => handleEdit(contact)}>
                     Ver Detalhes
                   </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}