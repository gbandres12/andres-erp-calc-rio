import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default function EPIs() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Gestão de EPIs</h1>
        <p className="text-slate-500 mt-1">Equipamentos de Proteção Individual</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Em Desenvolvimento
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">
            O módulo de EPIs está em desenvolvimento e será disponibilizado em breve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}