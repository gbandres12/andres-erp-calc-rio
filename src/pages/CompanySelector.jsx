
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, Plus, Edit, Check, LogOut, User, Sparkles } from "lucide-react";
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
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }, '-created_date'),
    initialData: []
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
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-slate-900 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="w-20 h-20 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center mb-6 mx-auto">
            <Sparkles className="w-10 h-10 text-white animate-pulse" />
          </div>
          <p className="text-white text-xl font-light">Carregando...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-slate-900 relative overflow-hidden">
      {/* Efeitos de fundo animados */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute w-96 h-96 bg-purple-500/20 rounded-full blur-3xl -top-20 -left-20 animate-pulse"></div>
        <div className="absolute w-96 h-96 bg-purple-400/20 rounded-full blur-3xl top-1/2 right-0 animate-pulse delay-700"></div>
        <div className="absolute w-96 h-96 bg-purple-600/20 rounded-full blur-3xl bottom-0 left-1/3 animate-pulse delay-1000"></div>
      </div>

      <div className="relative z-10 flex items-center justify-center min-h-screen p-6">
        <div className="w-full max-w-7xl">
          {/* Header Premium */}
          <motion.div
            initial={{ opacity: 0, y: -30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            {/* Logo */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="inline-flex items-center gap-4 mb-8"
            >
              <div className="relative">
                <div className="w-24 h-24 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/50 transform rotate-6">
                  <Building2 className="w-14 h-14 text-white transform -rotate-6" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-400 rounded-full border-4 border-purple-900 animate-pulse"></div>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight"
            >
              Andres Tech <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-purple-100">ERP</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-xl text-purple-200 font-light mb-8"
            >
              Sistema de Gestão Empresarial de Alto Padrão
            </motion.p>

            {/* User Info Card */}
            {user && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="inline-flex items-center gap-4 bg-white/10 backdrop-blur-xl px-8 py-4 rounded-2xl shadow-2xl border border-white/20"
              >
                <div className="w-14 h-14 bg-gradient-to-br from-purple-400 to-purple-600 rounded-xl flex items-center justify-center">
                  <User className="w-7 h-7 text-white" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-white text-lg">{user.full_name || user.email}</p>
                  <p className="text-sm text-purple-200">{user.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="ml-4 text-white hover:bg-white/10"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </motion.div>
            )}
          </motion.div>

          {/* Botão de Nova Empresa */}
          {user?.role === 'admin' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex justify-end mb-8"
            >
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={resetForm}
                    className="bg-white/10 backdrop-blur-xl hover:bg-white/20 text-white border border-white/20 shadow-xl"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    Nova Filial
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl bg-purple-950 border-white/20 text-white">
                  <DialogHeader>
                    <DialogTitle className="text-2xl">
                      {editingCompany ? "Editar Empresa" : "Nova Empresa"}
                    </DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-purple-200">Nome *</Label>
                        <Input
                          required
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          className="bg-white/5 border-white/20 text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-purple-200">Código *</Label>
                        <Input
                          required
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                          className="bg-white/5 border-white/20 text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-purple-200">CNPJ</Label>
                        <Input
                          value={formData.cnpj}
                          onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                          className="bg-white/5 border-white/20 text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-purple-200">Telefone</Label>
                        <Input
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="bg-white/5 border-white/20 text-white"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-purple-200">Endereço</Label>
                      <Input
                        value={formData.address}
                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                        className="bg-white/5 border-white/20 text-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-purple-200">Cidade</Label>
                        <Input
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                          className="bg-white/5 border-white/20 text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-purple-200">Estado</Label>
                        <Input
                          value={formData.state}
                          onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                          className="bg-white/5 border-white/20 text-white"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                      <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} className="border-white/20 text-white hover:bg-white/10">
                        Cancelar
                      </Button>
                      <Button type="submit" className="bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800">
                        {editingCompany ? "Atualizar" : "Criar"}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </motion.div>
          )}

          {/* Lista de Filiais - Cards Premium */}
          {companies.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 }}
            >
              <Card className="bg-white/10 backdrop-blur-xl border-white/20 shadow-2xl">
                <CardContent className="py-20 text-center">
                  <div className="w-24 h-24 bg-white/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Building2 className="w-12 h-12 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-white mb-4">Nenhuma filial cadastrada</h3>
                  <p className="text-purple-200 text-lg mb-8">Crie sua primeira filial para começar a usar o sistema</p>
                  {user?.role === 'admin' && (
                    <Button
                      onClick={() => setIsDialogOpen(true)}
                      size="lg"
                      className="bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white shadow-xl"
                    >
                      <Plus className="w-5 h-5 mr-2" />
                      Cadastrar Primeira Filial
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {companies.map((company, index) => (
                <motion.div
                  key={company.id}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.7 + index * 0.1 }}
                >
                  <Card
                    className="group cursor-pointer transition-all duration-300 hover:scale-105 bg-white/10 backdrop-blur-xl border-white/20 hover:bg-white/15 hover:shadow-2xl hover:shadow-purple-500/20 relative overflow-hidden"
                    onClick={() => handleSelectCompany(company)}
                  >
                    {/* Efeito de brilho */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/0 via-white/5 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                    
                    <CardHeader className="pb-4 relative z-10">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700 rounded-2xl flex items-center justify-center shadow-lg transform group-hover:rotate-6 transition-transform duration-300">
                            <Building2 className="w-9 h-9 text-white" />
                          </div>
                          <div>
                            <CardTitle className="text-2xl text-white mb-1">{company.name}</CardTitle>
                            <p className="text-sm text-purple-300">{company.code}</p>
                          </div>
                        </div>
                        {selectedCompanyId === company.id && (
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="bg-green-400 p-2 rounded-full shadow-lg"
                          >
                            <Check className="w-5 h-5 text-purple-900" />
                          </motion.div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 relative z-10">
                      {company.cnpj && (
                        <div className="flex items-center text-sm text-purple-200">
                          <span className="font-medium mr-2">CNPJ:</span>
                          <span>{company.cnpj}</span>
                        </div>
                      )}
                      {company.city && company.state && (
                        <div className="flex items-center text-sm text-purple-200">
                          <span className="font-medium mr-2">Local:</span>
                          <span>{company.city}, {company.state}</span>
                        </div>
                      )}
                      {company.phone && (
                        <div className="flex items-center text-sm text-purple-200">
                          <span className="font-medium mr-2">Tel:</span>
                          <span>{company.phone}</span>
                        </div>
                      )}
                      
                      <div className="pt-4 flex gap-2">
                        <Button
                          className="flex-1 bg-gradient-to-r from-purple-500 to-purple-700 hover:from-purple-600 hover:to-purple-800 text-white shadow-lg"
                          onClick={() => handleSelectCompany(company)}
                        >
                          Acessar
                        </Button>
                        {user?.role === 'admin' && (
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(company);
                            }}
                            className="border-white/20 text-white hover:bg-white/10"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {/* Footer Premium */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-center mt-12 text-purple-200"
          >
            <p className="text-sm font-light">
              © 2024 Andres Tech • Sistema de Gestão Empresarial
            </p>
            <p className="text-xs mt-2 text-purple-300/60">
              Powered by Base44 Platform
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
