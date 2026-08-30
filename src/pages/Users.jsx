import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Users as UsersIcon, Edit, Building2, UserPlus, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { navigationGroups } from "@/lib/navigationConfig";
import { useAuth } from "@/lib/AuthContext";

const ROLE_OPTIONS = [
  { value: "admin", label: "Admin — Acesso total ao ERP" },
  { value: "operator", label: "Operador — Vendas, orçamentos, retiradas e contatos" },
  { value: "scale_operator", label: "Op. Balança — Pesagem, vendas e retiradas" },
  { value: "custom", label: "Personalizado — Módulos marcados abaixo" },
];

function isAppAdmin(user) {
  return Boolean(user && (user.custom_role === "admin" || user.role === "admin"));
}

async function invokeFn(name, payload = {}) {
  const res = await base44.functions.invoke(name, payload);
  const data = res?.data ?? res;
  if (data?.error) throw new Error(data.error);
  return data;
}

const emptyDraft = {
  id: null,
  email: "",
  custom_role: "operator",
  allowed_companies: [],
  custom_permissions: [],
};

export default function UsersPage() {
  const { user: me } = useAuth();
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState(emptyDraft);

  const admin = isAppAdmin(me);

  const { data: users = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ["appUsers"],
    queryFn: async () => {
      const data = await invokeFn("listAppUsers", {});
      return data.users || [];
    },
    enabled: admin,
    staleTime: 30 * 1000,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies"],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    enabled: admin,
  });

  const updateMutation = useMutation({
    mutationFn: (payload) => invokeFn("updateUserAccess", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appUsers"] });
      setEditingUser(null);
      toast.success("Permissões salvas");
    },
    onError: (err) => toast.error(err.message || "Erro ao salvar"),
  });

  const inviteMutation = useMutation({
    mutationFn: (payload) => invokeFn("inviteAppUser", payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["appUsers"] });
      setInviteOpen(false);
      setInviteDraft(emptyDraft);
      toast.success(data?.message || "Convite enviado");
    },
    onError: (err) => toast.error(err.message || "Erro ao convidar"),
  });

  const handleEdit = (user) => {
    setEditingUser({
      id: user.id,
      email: user.email,
      custom_role: user.custom_role || "operator",
      allowed_companies: user.allowed_companies || [],
      custom_permissions: user.custom_permissions || [],
    });
  };

  const submitEdit = (e) => {
    e.preventDefault();
    updateMutation.mutate({
      user_id: editingUser.id,
      custom_role: editingUser.custom_role,
      allowed_companies: editingUser.allowed_companies,
      custom_permissions: editingUser.custom_role === "custom" ? editingUser.custom_permissions : [],
    });
  };

  const submitInvite = (e) => {
    e.preventDefault();
    inviteMutation.mutate({
      email: inviteDraft.email,
      custom_role: inviteDraft.custom_role,
      allowed_companies: inviteDraft.allowed_companies,
      custom_permissions: inviteDraft.custom_role === "custom" ? inviteDraft.custom_permissions : [],
    });
  };

  const togglePermission = (draft, setDraft, url) => {
    setDraft((prev) => {
      const current = prev.custom_permissions || [];
      return {
        ...prev,
        custom_permissions: current.includes(url)
          ? current.filter((u) => u !== url)
          : [...current, url],
      };
    });
  };

  const toggleCompany = (setDraft, companyId) => {
    setDraft((prev) => {
      const current = prev.allowed_companies || [];
      return {
        ...prev,
        allowed_companies: current.includes(companyId)
          ? current.filter((id) => id !== companyId)
          : [...current, companyId],
      };
    });
  };

  if (!admin) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <ShieldAlert className="w-10 h-10 mx-auto text-amber-600" />
            <h1 className="text-xl font-semibold">Acesso restrito</h1>
            <p className="text-sm text-slate-500">
              Só administrador do ERP gerencia usuários e páginas. Peça a um admin para delegar o perfil.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Gestão de Usuários</h1>
          <p className="text-slate-500 mt-1">Perfis do ERP, filiais e módulos — independente do painel Base44</p>
        </div>
        <Button onClick={() => { setInviteDraft(emptyDraft); setInviteOpen(true); }}>
          <UserPlus className="w-4 h-4 mr-2" />
          Convidar usuário
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <p className="p-6 text-sm text-slate-500">Carregando usuários…</p>
          )}
          {isError && (
            <div className="p-6 space-y-3">
              <p className="text-sm text-red-600">{error?.message || "Não foi possível listar usuários"}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Tentar de novo</Button>
            </div>
          )}
          {!isLoading && !isError && users.length === 0 && (
            <p className="p-6 text-sm text-slate-500">Nenhum usuário retornado. Convide alguém ou sincronize o app no Base44.</p>
          )}
          <div className="divide-y">
            {users.map((user) => (
              <div key={user.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <UsersIcon className="w-5 h-5 text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 truncate">{user.full_name || "Sem nome"}</p>
                    <p className="text-sm text-slate-500 truncate">{user.email}</p>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                        Base44: {user.role}
                      </Badge>
                      {(() => {
                        const roleMap = {
                          admin: { label: "ERP: Admin", className: "bg-blue-50 text-blue-700 border-blue-200" },
                          operator: { label: "ERP: Operador", className: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                          scale_operator: { label: "ERP: Op. Balança", className: "bg-orange-50 text-orange-700 border-orange-200" },
                          custom: { label: `ERP: Personalizado (${(user.custom_permissions || []).length})`, className: "bg-violet-50 text-violet-700 border-violet-200" },
                        };
                        const r = roleMap[user.custom_role] || { label: "ERP: sem perfil", className: "bg-red-50 text-red-700 border-red-200" };
                        return <Badge variant="outline" className={r.className}>{r.label}</Badge>;
                      })()}
                    </div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {user.allowed_companies?.length > 0 ? (
                    <div className="text-xs text-slate-500 mb-2">
                      {user.allowed_companies.map((cid) => {
                        const c = companies.find((co) => co.id === cid);
                        return c ? (
                          <span key={cid} className="inline-block bg-purple-50 text-purple-700 border border-purple-200 rounded px-2 py-0.5 mr-1 mb-1 text-xs">
                            {c.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mb-2">
                      {user.custom_role === "admin" ? "Todas as filiais" : "Nenhuma filial"}
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

      <AccessDialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => { if (!open) setEditingUser(null); }}
        title={`Permissões — ${editingUser?.email || ""}`}
        draft={editingUser}
        setDraft={setEditingUser}
        companies={companies}
        onSubmit={submitEdit}
        saving={updateMutation.isPending}
        togglePermission={togglePermission}
        toggleCompany={toggleCompany}
      />

      <AccessDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Convidar usuário"
        draft={inviteDraft}
        setDraft={setInviteDraft}
        companies={companies}
        onSubmit={submitInvite}
        saving={inviteMutation.isPending}
        togglePermission={togglePermission}
        toggleCompany={toggleCompany}
        invite
      />
    </div>
  );
}

function AccessDialog({
  open, onOpenChange, title, draft, setDraft, companies, onSubmit, saving,
  togglePermission, toggleCompany, invite = false,
}) {
  if (!draft) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-6">
          {invite && (
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                required
                value={draft.email}
                onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))}
                placeholder="pessoa@empresa.com"
              />
              <p className="text-xs text-slate-500">Entra como usuário do app (não como dono do Base44).</p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Perfil de acesso do ERP</Label>
            <Select
              value={draft.custom_role}
              onValueChange={(value) => setDraft((p) => ({ ...p, custom_role: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {draft.custom_role === "custom" && (
            <div className="space-y-3">
              <Label>Módulos permitidos</Label>
              <div className="space-y-3 border rounded-lg p-3 max-h-[260px] overflow-y-auto bg-slate-50/50">
                {navigationGroups.map((group) => (
                  <div key={group.title}>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{group.title}</p>
                    <div className="space-y-1.5">
                      {group.items.map((item) => {
                        const checked = (draft.custom_permissions || []).includes(item.url);
                        return (
                          <div key={item.url} className="flex items-center space-x-2">
                            <Checkbox
                              id={`${invite ? "inv" : "edit"}-perm-${item.url}`}
                              checked={checked}
                              onCheckedChange={() => togglePermission(draft, setDraft, item.url)}
                            />
                            <label htmlFor={`${invite ? "inv" : "edit"}-perm-${item.url}`} className="text-sm cursor-pointer select-none">
                              {item.title}
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <Label>Filiais permitidas</Label>
            <div className="space-y-2 border rounded-lg p-3 max-h-[200px] overflow-y-auto">
              {companies.map((company) => (
                <div key={company.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${invite ? "inv" : "edit"}-co-${company.id}`}
                    checked={(draft.allowed_companies || []).includes(company.id)}
                    onCheckedChange={() => toggleCompany(setDraft, company.id)}
                  />
                  <label htmlFor={`${invite ? "inv" : "edit"}-co-${company.id}`} className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <Building2 className="w-3 h-3 text-slate-400" />
                    {company.name}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Admin sem filial marcada vê todas. Operador e personalizado precisam de pelo menos uma.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? "Salvando…" : invite ? "Enviar convite" : "Salvar"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
