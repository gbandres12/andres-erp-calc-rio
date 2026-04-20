import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Edit, Shield, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    initialData: []
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    initialData: []
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['users']);
      setIsDialogOpen(false);
      setEditingUser(null);
      toast.success("Usuário atualizado com sucesso!");
    },
    onError: (error) => {
      toast.error("Erro ao atualizar usuário: " + error.message);
    }
  });

  const handleEdit = (user) => {
    setEditingUser({
      id: user.id,
      custom_role: user.custom_role || 'admin',
      allowed_companies: user.allowed_companies || []
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateMutation.mutate({
      id: editingUser.id,
      data: {
        custom_role: editingUser.custom_role,
        allowed_companies: editingUser.allowed_companies
      }
    });
  };

  const toggleCompany = (companyId) => {
    setEditingUser(prev => {
      const current = prev.allowed_companies || [];
      if (current.includes(companyId)) {
        return { ...prev, allowed_companies: current.filter(id => id !== companyId) };
      } else {
        return { ...prev, allowed_companies: [...current, companyId] };
      }
    });
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Gestão de Usuários</h1>
        <p className="text-slate-500 mt-1">Configure permissões e acesso às empresas</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {users.map((user) => (
              <div key={user.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                    <Users className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">{user.full_name || 'Sem nome'}</p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                      {(() => {
                        const roleMap = {
                          admin: { label: 'Admin', className: 'bg-blue-50 text-blue-700 border-blue-200' },
                          operator: { label: 'Operador (Sem Financeiro)', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
                          scale_operator: { label: 'Op. Balança/Vendas', className: 'bg-orange-50 text-orange-700 border-orange-200' },
                        };
                        const r = roleMap[user.custom_role] || { label: user.custom_role || 'Admin', className: 'bg-blue-50 text-blue-700 border-blue-200' };
                        return <Badge variant="outline" className={r.className}>{r.label}</Badge>;
                      })()}
                      {user.allowed_companies?.length > 0 && (
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                          {user.allowed_companies.length} filial(is)
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  {user.allowed_companies?.length > 0 ? (
                    <div className="text-xs text-slate-500 mb-2 text-right">
                      {user.allowed_companies.map(cid => {
                        const c = companies.find(co => co.id === cid);
                        return c ? (
                          <span key={cid} className="inline-block bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5 mr-1 mb-1 text-xs">
                            {c.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mb-2">
                      {user.custom_role === 'admin' ? 'Todas as filiais' : 'Nenhuma filial definida'}
                    </p>
                  )}
                  <Button variant="outline" size="sm" onClick={() => handleEdit(user)}>
                    <Edit className="w-4 h-4 mr-2" />
                    Permissões
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Permissões</DialogTitle>
          </DialogHeader>
          {editingUser && (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label>Perfil de Acesso</Label>
                <Select
                  value={editingUser.custom_role}
                  onValueChange={(value) => setEditingUser({ ...editingUser, custom_role: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin (Acesso Total)</SelectItem>
                    <SelectItem value="operator">Operador (Sem Financeiro)</SelectItem>
                    <SelectItem value="scale_operator">Operador de Balança/Vendas (Sem Financeiro, só Pesagem e Vendas)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Empresas Permitidas</Label>
                <div className="space-y-2 border rounded-lg p-3 max-h-[200px] overflow-y-auto">
                  {companies.map((company) => (
                    <div key={company.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={company.id}
                        checked={(editingUser.allowed_companies || []).includes(company.id)}
                        onCheckedChange={() => toggleCompany(company.id)}
                      />
                      <label
                        htmlFor={company.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                      >
                        <Building2 className="w-3 h-3 text-slate-400" />
                        {company.name}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  Se nenhuma empresa for selecionada, o usuário Admin verá todas. O Operador precisa de empresas selecionadas.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  Salvar Permissões
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}