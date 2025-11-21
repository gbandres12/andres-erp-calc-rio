import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { History, Search, User, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ActivityLogs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));

  const { data: logs = [] } = useQuery({
    queryKey: ['activityLogs', selectedCompanyId],
    queryFn: () => base44.entities.ActivityLog.filter({ 
      company_id: selectedCompanyId
    }, '-created_date', 100),
    initialData: []
  });

  const filteredLogs = logs.filter(log => 
    log.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.entity_type?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const actionColors = {
    create: "bg-green-100 text-green-800",
    update: "bg-blue-100 text-blue-800",
    delete: "bg-red-100 text-red-800",
    login: "bg-purple-100 text-purple-800",
    logout: "bg-slate-100 text-slate-800"
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Auditoria do Sistema</h1>
        <p className="text-slate-500 mt-1">Registro de atividades dos usuários</p>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Buscar por usuário, ação ou entidade..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" />
            <CardTitle>Histórico de Atividades</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma atividade registrada ainda</p>
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="flex items-start justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-900">{log.user_name || log.user_email}</p>
                        <Badge className={actionColors[log.action] || "bg-slate-100 text-slate-800"}>
                          {log.action}
                        </Badge>
                        {log.entity_type && (
                          <Badge variant="outline">{log.entity_type}</Badge>
                        )}
                      </div>
                      {log.details && (
                        <p className="text-sm text-slate-600">{log.details}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{new Date(log.created_date).toLocaleString('pt-BR')}</span>
                        </div>
                        {log.ip_address && (
                          <span>IP: {log.ip_address}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}