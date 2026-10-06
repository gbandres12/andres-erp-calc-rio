import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Edit, Check, LogOut, RefreshCw, Landmark, MapPin, Phone, RadioTower, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";

export default function CompanySelector() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
      const isAdmin = user?.role === 'admin' || user?.custom_role === 'admin';
      if (!isAdmin && user?.allowed_companies?.length > 0) {
        return companies.filter(c => user.allowed_companies.includes(c.id));
      }
      return companies;
    },
    initialData: [],
    enabled: !!user
  });

  const companies = allCompanies;

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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await queryClient.invalidateQueries(['companies']);
    setTimeout(() => setIsRefreshing(false), 700);
  };

  const selectedCompanyId = localStorage.getItem('selectedCompanyId');
  const isAdmin = user?.role === 'admin' || user?.custom_role === 'admin';
  const canAccessGerencial = isAdmin || !user?.custom_role ||
    (user.custom_role === 'custom'
      ? (user.custom_permissions || []).includes('Gerencial')
      : true);
  const initials = (user?.full_name || user?.email || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-500 text-sm font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-jakarta">
      {/* TopBar escura */}
      <header className="bg-[#111827] text-white border-b border-slate-800 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 h-12 flex items-center justify-between text-xs sm:text-sm font-medium">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center font-black text-[13px] shadow-sm">A</div>
            <span className="font-bold text-sm hidden sm:inline">Andres Tech ERP</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/10 text-slate-200 border border-white/10 font-semibold tracking-wide text-[11px] uppercase">
              Central de Filiais
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-[10px] text-white">
                {initials}
              </div>
              <span className="text-xs text-slate-300 hidden md:inline">{user?.full_name || user?.email}</span>
            </div>
            <span className="h-3.5 w-px bg-slate-700 hidden sm:block" />
            <button onClick={handleLogout} title="Sair" className="flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded hover:bg-slate-800 transition duration-150 font-medium">
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 px-4 sm:px-6 lg:px-8 py-7">
        <div className="max-w-[1400px] mx-auto space-y-7">
          {/* Command bar */}
          <section className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 bg-white p-6 rounded-2xl shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 uppercase tracking-wider">
                  Painel de Controle Corporativo
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs text-slate-500 font-medium">{companies.length} {companies.length === 1 ? 'unidade' : 'unidades'} cadastradas</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">Dashboard das Empresas</h1>
              <p className="text-sm text-slate-500 font-medium">Selecione a unidade para acessar a visão estratégica consolidada</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleRefresh}
                className="p-2.5 text-slate-500 hover:text-indigo-600 bg-slate-50 hover:bg-slate-100 rounded-xl transition shadow-sm"
                title="Atualizar dados agora"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              {isAdmin && (
                <Dialog open={isDialogOpen} onOpenChange={(o) => { setIsDialogOpen(o); if (!o) resetForm(); }}>
                  <DialogTrigger asChild>
                    <Button onClick={resetForm} className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-sm gap-2 h-auto">
                      <Plus className="w-4 h-4 text-slate-300" />
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
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                          {editingCompany ? "Atualizar" : "Criar"}
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </section>

          {/* Painel Gerencial — visão consolidada do grupo */}
          {canAccessGerencial && companies.length > 0 && (
            <section
              onClick={() => navigate(createPageUrl('Gerencial'))}
              className="bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-950 text-white p-5 rounded-2xl shadow-sm cursor-pointer flex items-center justify-between gap-4 hover:shadow-md transition-all group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-11 h-11 rounded-xl bg-indigo-600 flex items-center justify-center flex-shrink-0">
                  <RadioTower className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold">Painel Gerencial Consolidado</h3>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase tracking-wide">Ao vivo</span>
                  </div>
                  <p className="text-xs text-slate-300 truncate">Todas as filiais em uma tela: faturamento, notas, retiradas e lançamentos</p>
                </div>
              </div>
              <span className="flex items-center gap-1.5 text-xs font-bold bg-white/10 border border-white/15 px-4 py-2 rounded-xl group-hover:bg-indigo-600 transition flex-shrink-0">
                Abrir
                <ArrowRight className="w-4 h-4" />
              </span>
            </section>
          )}

          {/* Cards de filiais */}
          {companies.length === 0 ? (
            <section className="bg-white p-6 rounded-2xl shadow-sm">
              <div className="py-14 text-center">
                <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Building2 className="w-7 h-7 text-indigo-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-1">Nenhuma filial cadastrada</h3>
                <p className="text-sm text-slate-500 mb-6">Crie sua primeira filial para começar a usar o sistema</p>
                {isAdmin && (
                  <Button onClick={() => setIsDialogOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                    <Plus className="w-4 h-4 mr-2" />
                    Cadastrar Primeira Filial
                  </Button>
                )}
              </div>
            </section>
          ) : (
            <section>
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Gestão de Unidades & Filiais</h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {companies.map((company) => {
                  const selected = selectedCompanyId === company.id;
                  return (
                    <div
                      key={company.id}
                      onClick={() => handleSelectCompany(company)}
                      className={`bg-white p-5 rounded-2xl shadow-sm cursor-pointer flex flex-col justify-between transition-all duration-200 hover:shadow-md ${
                        selected ? 'ring-2 ring-indigo-500 border border-transparent' : 'hover:-translate-y-0.5'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${selected ? 'bg-indigo-600 shadow-md shadow-indigo-200' : 'bg-indigo-50'}`}>
                              <Landmark className={`w-5 h-5 ${selected ? 'text-white' : 'text-indigo-600'}`} />
                            </div>
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 leading-tight">{company.name}</h3>
                              <span className="inline-flex items-center mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">
                                {company.code}
                              </span>
                            </div>
                          </div>
                          {selected && (
                            <div className="bg-indigo-600 p-1.5 rounded-full shadow-sm">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-600">
                          {company.cnpj && (
                            <p className="flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-slate-400" />{company.cnpj}</p>
                          )}
                          {company.city && (
                            <p className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" />{company.city}{company.state ? `, ${company.state}` : ''}</p>
                          )}
                          {company.phone && (
                            <p className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" />{company.phone}</p>
                          )}
                        </div>
                      </div>
                      <div className="mt-4 pt-3 bg-slate-50 -mx-5 -mb-5 px-5 py-3 rounded-b-2xl flex items-center gap-2">
                        <Button
                          onClick={(e) => { e.stopPropagation(); handleSelectCompany(company); }}
                          className={`flex-1 h-8 text-xs font-bold rounded-lg ${selected ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-900 hover:bg-slate-800 text-white'}`}
                        >
                          {selected ? 'Continuar' : 'Acessar'}
                        </Button>
                        {isAdmin && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleEdit(company); }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 hover:bg-slate-50 transition"
                            title="Editar"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <div className="text-center pt-2">
            <p className="text-xs text-slate-400 font-medium">© 2026 Andres Tech • Sistema de Gestão Empresarial</p>
          </div>
        </div>
      </main>
    </div>
  );
}