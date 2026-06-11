import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Edit, Check, LogOut, User, Sparkles, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { motion } from "framer-motion";

export default function CompanySelector() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    code: "",
    cnpj: "",
    address: "",
    city: "",
    state: "",
    phone: ""
  });

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const userData = await base44.auth.me();
      setUser(userData);
      setIsLoading(false);
    } catch (error) {
      console.error("Error loading user:", error);
      setIsLoading(false);
    }
  };

  const { data: allCompanies = [] } = useQuery({
    queryKey: ['companies', user?.id],
    queryFn: async () => {
      const companies = await base44.entities.Company.filter({ is_active: true }, '-created_date');
      if (user?.custom_role === 'operator' && user?.allowed_companies?.length > 0) {
        return companies.filter(c => user.allowed_companies.includes(c.id));
      }
      return companies;
    },
    initialData: [],
    enabled: !!user
  });

  const companies = React.useMemo(() => {
    const uniqueCompanies = new Map();
    allCompanies.forEach(company => {
      if (!uniqueCompanies.has(company.code) || 
          new Date(company.created_date) > new Date(uniqueCompanies.get(company.code).created_date)) {
        uniqueCompanies.set(company.code, company);
      }
    });
    return Array.from(uniqueCompanies.values());
  }, [allCompanies]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Company.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['companies']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Empresa criada com sucesso!");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Company.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['companies']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Empresa atualizada com sucesso!");
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      code: "",
      cnpj: "",
      address: "",
      city: "",
      state: "",
      phone: ""
    });
    setEditingCompany(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingCompany) {
      updateMutation.mutate({ id: editingCompany.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (company) => {
    setEditingCompany(company);
    setFormData({
      name: company.name || "",
      code: company.code || "",
      cnpj: company.cnpj || "",
      address: company.address || "",
      city: company.city || "",
      state: company.state || "",
      phone: company.phone || ""
    });
    setIsDialogOpen(true);
  };

  const handleSelectCompany = (company) => {
    localStorage.setItem('selectedCompanyId', company.id);
    localStorage.setItem('selectedCompanyName', company.name);
    toast.success(`Filial selecionada: ${company.name}`);
    window.location.href = createPageUrl('Dashboard');
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  const selectedCompanyId = localStorage.getItem('selectedCompanyId');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-5xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-slate-800 rounded-xl mb-5">
              <Building2 className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-1">
              Andres Tech <span className="text-slate-500 font-normal">ERP</span>
            </h1>
            <p className="text-sm text-slate-400 mb-6">Sistema de Gestão Empresarial</p>

            {/* User Info */}
            {user && (
              <div className="inline-flex items-center gap-3 bg-white border border-slate-200 px-5 py-3 rounded-lg shadow-sm">
                <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                  <User className="w-4 h-4 text-slate-600" />
                </div>
                <div className="text-left">
                  <p className="font-medium text-slate-800 text-sm">{user.full_name || user.email}</p>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500 hover:text-slate-700 h-7 w-7 p-0">
                    <LogOut className="w-4 h-4" />
                  </Button>
                  {user?.role === 'admin' && (
                    <Button variant="ghost" size="sm" onClick={() => window.location.href = createPageUrl('Settings')} className="text-slate-500 hover:text-slate-700 h-7 w-7 p-0">
                      <Settings className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Botão Nova Filial */}
          {user?.role === 'admin' && (
            <div className="flex justify-end mb-5">
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={resetForm} variant="outline" size="sm" className="border-slate-300 text-slate-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Nova Filial
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingCompany ? "Editar Empresa" : "Nova Empresa"}</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Nome *</Label>
                        <Input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Código *</Label>
                        <Input required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>CNPJ</Label>
                        <Input value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Telefone</Label>
                        <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Endereço</Label>
                      <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Cidade</Label>
                        <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Estado</Label>
                        <Input value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                      <Button type="submit" className="bg-slate-800 hover:bg-slate-700 text-white">
                        {editingCompany ? "Atualizar" : "Criar"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {/* Lista de Filiais */}
          {companies.length === 0 ? (
            <Card className="border-slate-200">
              <CardContent className="py-16 text-center">
                <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-7 h-7 text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-slate-700 mb-2">Nenhuma filial cadastrada</h3>
                <p className="text-sm text-slate-400 mb-6">Crie sua primeira filial para começar a usar o sistema</p>
                {user?.role === 'admin' && (
                  <Button onClick={() => setIsDialogOpen(true)} className="bg-slate-800 hover:bg-slate-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Cadastrar Primeira Filial
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {companies.map((company) => (
                <Card
                  key={company.id}
                  className="cursor-pointer border-slate-200 hover:border-slate-400 hover:shadow-md transition-all duration-200 bg-white"
                  onClick={() => handleSelectCompany(company)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-slate-600" />
                        </div>
                        <div>
                          <CardTitle className="text-base font-semibold text-slate-900">{company.name}</CardTitle>
                          <p className="text-xs text-slate-400 mt-0.5">{company.code}</p>
                        </div>
                      </div>
                      {selectedCompanyId === company.id && (
                        <div className="bg-green-100 p-1.5 rounded-full">
                          <Check className="w-3.5 h-3.5 text-green-600" />
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {company.cnpj && (
                      <p className="text-xs text-slate-500"><span className="font-medium">CNPJ:</span> {company.cnpj}</p>
                    )}
                    {company.city && company.state && (
                      <p className="text-xs text-slate-500"><span className="font-medium">Local:</span> {company.city}, {company.state}</p>
                    )}
                    {company.phone && (
                      <p className="text-xs text-slate-500"><span className="font-medium">Tel:</span> {company.phone}</p>
                    )}
                    <div className="pt-3 flex gap-2">
                      <Button
                        className="flex-1 bg-slate-800 hover:bg-slate-700 text-white h-8 text-sm"
                        onClick={() => handleSelectCompany(company)}
                      >
                        Acessar
                      </Button>
                      {user?.role === 'admin' && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 border-slate-200 text-slate-500 hover:text-slate-700"
                          onClick={(e) => { e.stopPropagation(); handleEdit(company); }}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="text-center mt-10">
            <p className="text-xs text-slate-400">© 2024 Andres Tech • Sistema de Gestão Empresarial</p>
          </div>
        </div>
      </div>
    </div>
  );
}