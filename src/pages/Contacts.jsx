
import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Users, Plus, Search, Edit, DollarSign, Building2, Loader2, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton"; // Import Skeleton component

export default function Contacts() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("todos");
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [formData, setFormData] = useState({
    type: "cliente",
    name: "",
    document: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip_code: "",
    credit_balance: 0,
    notes: ""
  });

  // Query CORRIGIDA - removido initialData
  const { data: contacts = [], isLoading, isFetching, error } = useQuery({
    queryKey: ['contacts', selectedCompanyId],
    queryFn: async () => {
      console.log('🔄 Buscando contatos para empresa:', selectedCompanyId);
      const result = await base44.entities.Contact.filter({ 
        is_active: true,
        company_id: selectedCompanyId 
      }, '-created_date');
      console.log('✅ Contatos encontrados:', result.length);
      return result;
    },
    enabled: !!selectedCompanyId,
    staleTime: 2 * 60 * 1000, // 2 minutos - reduzido
    cacheTime: 10 * 60 * 1000, // 10 minutos
    refetchOnWindowFocus: false,
    refetchOnMount: true, // MUDADO: sempre recarrega ao montar
  });

  // Query companies CORRIGIDA
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: async () => {
      const result = await base44.entities.Company.filter({ is_active: true });
      console.log('✅ Empresas encontradas:', result.length);
      return result;
    },
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  });

  const currentCompany = useMemo(() => 
    companies.find(c => c.id === selectedCompanyId),
    [companies, selectedCompanyId]
  );

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Contact.create({
      ...data,
      company_id: selectedCompanyId
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['contacts']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Contato criado com sucesso!");
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Contact.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['contacts']);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Contato atualizado com sucesso!");
    }
  });

  const resetForm = () => {
    setFormData({
      type: "cliente",
      name: "",
      document: "",
      email: "",
      phone: "",
      address: "",
      city: "",
      state: "",
      zip_code: "",
      credit_balance: 0,
      notes: ""
    });
    setEditingContact(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingContact) {
      updateMutation.mutate({ id: editingContact.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (contact) => {
    setEditingContact(contact);
    setFormData({
      type: contact.type || "cliente",
      name: contact.name || "",
      document: contact.document || "",
      email: contact.email || "",
      phone: contact.phone || "",
      address: contact.address || "",
      city: contact.city || "",
      state: contact.state || "",
      zip_code: contact.zip_code || "",
      credit_balance: contact.credit_balance || 0,
      notes: contact.notes || ""
    });
    setIsDialogOpen(true);
  };

  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      const matchesSearch = c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           c.document?.includes(searchTerm) ||
                           c.email?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesTab = activeTab === "todos" || c.type === activeTab || (activeTab === "cliente" && c.type === "ambos") || (activeTab === "fornecedor" && c.type === "ambos");
      return matchesSearch && matchesTab;
    });
  }, [contacts, searchTerm, activeTab]);

  // Função para exportar para Excel
  const exportToExcel = () => {
    if (filteredContacts.length === 0) {
      toast.error("Nenhum contato para exportar!");
      return;
    }

    const headers = [
      "Nome",
      "Tipo",
      "CPF/CNPJ",
      "Email",
      "Telefone",
      "Endereço",
      "Cidade",
      "Estado",
      "CEP",
      "Observações"
    ];

    const rows = filteredContacts.map(contact => [
      contact.name || '',
      contact.type === 'cliente' ? 'cliente' : contact.type === 'fornecedor' ? 'fornecedor' : 'ambos',
      contact.document || '',
      contact.email || '',
      contact.phone || '',
      contact.address || '',
      contact.city || '',
      contact.state || '',
      contact.zip_code || '',
      contact.notes || ''
    ]);

    let csv = headers.join(';') + '\n';
    rows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(';') + '\n';
    });

    const BOM = '\uFEFF';
    csv = BOM + csv;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const fileName = `clientes_${currentCompany?.name || 'export'}_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success(`${filteredContacts.length} contato(s) exportado(s)!`);
  };

  // Função para baixar modelo de importação
  const downloadTemplate = () => {
    const headers = [
      "Nome",
      "Tipo",
      "CPF/CNPJ",
      "Email",
      "Telefone",
      "Endereço",
      "Cidade",
      "Estado",
      "CEP",
      "Observações"
    ];

    const exampleRows = [
      [
        'João Silva',
        'cliente',
        '123.456.789-00',
        'joao@email.com',
        '(93) 99999-9999',
        'Rua A, 123',
        'Santarém',
        'PA',
        '68000-000',
        'Cliente VIP'
      ],
      [
        'Empresa ABC Ltda',
        'fornecedor',
        '12.345.678/0001-90',
        'contato@abc.com',
        '(93) 3522-1234',
        'Av. Principal, 456',
        'Santarém',
        'PA',
        '68005-000',
        'Fornecedor de materiais'
      ]
    ];

    let csv = headers.join(';') + '\n';
    exampleRows.forEach(row => {
      csv += row.map(cell => `"${cell}"`).join(';') + '\n';
    });

    const BOM = '\uFEFF';
    csv = BOM + csv;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', 'modelo_importacao_clientes.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Modelo baixado com sucesso!");
  };

  // Função CORRIGIDA para processar CSV com encoding correto
  const handleImport = async () => {
    if (!importFile) {
      toast.error("Selecione um arquivo para importar!");
      return;
    }

    setIsImporting(true);
    toast.info("Processando arquivo...");

    try {
      // Ler arquivo com encoding correto
      const arrayBuffer = await importFile.arrayBuffer();
      
      // Tentar UTF-8 primeiro
      let text;
      try {
        const utf8Decoder = new TextDecoder('utf-8');
        text = utf8Decoder.decode(arrayBuffer);
        
        // Se tiver caracteres de replacement (), tentar Windows-1252
        if (text.includes('')) { // Using the actual replacement character
          console.warn("Caracteres de substituição detectados com UTF-8, tentando Windows-1252.");
          const decoder1252 = new TextDecoder('windows-1252');
          text = decoder1252.decode(arrayBuffer);
        }
      } catch (e) {
        // Fallback para Windows-1252 caso UTF-8 falhe inesperadamente ou seja inválido
        console.warn("Erro ao decodificar UTF-8, tentando Windows-1252.", e);
        const decoder = new TextDecoder('windows-1252');
        text = decoder.decode(arrayBuffer);
      }

      // Remover BOM se existir (seja UTF-8 ou outro)
      if (text.charCodeAt(0) === 0xFEFF) {
        console.log("BOM detectado e removido.");
        text = text.substring(1);
      }

      console.log("Primeiros 500 caracteres do arquivo decodificado:", text.substring(0, 500));

      // Processar CSV
      const lines = text.split('\n').filter(line => line.trim().length > 0);
      
      if (lines.length < 2) { // At least header + one data line
        toast.error("Arquivo vazio ou sem dados!");
        setIsImporting(false);
        return;
      }

      // Primeira linha = cabeçalho
      const headerLine = lines[0]; // BOM already removed from 'text'
      const header = headerLine.split(';').map(h => h.trim().replace(/^"|"$/g, ''));
      console.log("Cabeçalho detectado:", header);

      // Mapear índices das colunas (flexível para diferentes formatos)
      const getColumnIndex = (possibleNames) => {
        for (const name of possibleNames) {
          const idx = header.findIndex(h => 
            h.toLowerCase().includes(name.toLowerCase())
          );
          if (idx !== -1) return idx;
        }
        return -1;
      };

      const nameIdx = getColumnIndex(['nome', 'name', 'razao social', 'razão social']);
      const typeIdx = getColumnIndex(['tipo', 'type']);
      const documentIdx = getColumnIndex(['cpf', 'cnpj', 'documento', 'document']);
      const emailIdx = getColumnIndex(['email', 'e-mail']);
      const phoneIdx = getColumnIndex(['telefone', 'phone', 'fone', 'celular']);
      const addressIdx = getColumnIndex(['endereco', 'endereço', 'address', 'rua']);
      const cityIdx = getColumnIndex(['cidade', 'city']);
      const stateIdx = getColumnIndex(['estado', 'state', 'uf']);
      const zipIdx = getColumnIndex(['cep', 'zip']);
      const notesIdx = getColumnIndex(['observa', 'notes', 'obs']);

      if (nameIdx === -1) {
        toast.error("Coluna 'Nome' não encontrada! Colunas disponíveis: " + header.join(', '));
        setIsImporting(false);
        return;
      }

      console.log("Índices mapeados:", {
        nome: nameIdx,
        tipo: typeIdx,
        documento: documentIdx,
        email: emailIdx,
        telefone: phoneIdx,
        cidade: cityIdx,
        estado: stateIdx
      });

      // Processar linhas de dados
      const contactsData = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        
        // Split considerando aspas
        const values = [];
        let currentValue = '';
        let insideQuotes = false;
        
        for (let char of line) {
          if (char === '"') {
            insideQuotes = !insideQuotes;
          } else if (char === ';' && !insideQuotes) {
            values.push(currentValue);
            currentValue = '';
          } else {
            currentValue += char;
          }
        }
        values.push(currentValue);

        // Helper para limpar valores
        const getCleanValue = (idx) => {
          if (idx < 0 || idx >= values.length) return '';
          return values[idx]?.replace(/^"|"$/g, '').trim() || '';
        };

        const name = getCleanValue(nameIdx);
        
        if (!name || name.length === 0) {
          console.log(`Linha ${i + 1}: nome vazio, pulando...`);
          continue; // Skip if name is empty after cleaning
        }

        // Detectar tipo
        let type = 'cliente';
        const typeValue = getCleanValue(typeIdx).toLowerCase();
        if (typeValue.includes('fornecedor')) type = 'fornecedor';
        else if (typeValue.includes('ambos') || typeValue.includes('both')) type = 'ambos';

        const contact = {
          name: name,
          type: type,
          document: getCleanValue(documentIdx),
          email: getCleanValue(emailIdx),
          phone: getCleanValue(phoneIdx),
          address: getCleanValue(addressIdx),
          city: getCleanValue(cityIdx),
          state: getCleanValue(stateIdx).toUpperCase(),
          zip_code: getCleanValue(zipIdx),
          notes: getCleanValue(notesIdx),
          credit_balance: 0, // Default to 0, not present in import template
          company_id: selectedCompanyId,
          is_active: true
        };

        // console.log(`Contato ${i}:`, contact.name, contact.city); // Detailed logging for each contact
        contactsData.push(contact);
      }

      console.log(`${contactsData.length} contatos válidos processados`);

      if (contactsData.length === 0) {
        toast.error("Nenhum contato válido encontrado no arquivo após o processamento!");
        setIsImporting(false);
        return;
      }

      // Criar contatos em lote
      console.log("Criando contatos no banco...");
      await base44.entities.Contact.bulkCreate(contactsData);

      // Sucesso!
      queryClient.invalidateQueries(['contacts']);
      setIsImportDialogOpen(false);
      setImportFile(null);
      toast.success(`✅ ${contactsData.length} contato(s) importado(s) com sucesso!`);

    } catch (error) {
      console.error("Erro ao importar:", error);
      toast.error("Erro ao importar: " + (error.message || "Verifique o formato do arquivo e as colunas."));
    } finally {
      setIsImporting(false);
    }
  };

  // Debug: mostrar erro se houver
  useEffect(() => {
    if (error) {
      console.error('❌ Erro ao carregar contatos:', error);
      toast.error('Erro ao carregar contatos');
    }
  }, [error]);

  // Debug: log quando contacts mudar
  useEffect(() => {
    console.log('📊 Contatos atuais:', contacts.length, contacts);
  }, [contacts]);

  if (!selectedCompanyId) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Alert>
          <Building2 className="h-4 w-4" />
          <AlertDescription>
            Por favor, selecione uma filial no menu "Trocar Filial" para gerenciar os clientes e fornecedores.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Loading MELHORADO com skeleton
  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <Skeleton className="h-9 w-80 mb-2" />
            <Skeleton className="h-5 w-64" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-12 w-full mb-6" />
        <Skeleton className="h-20 w-full mb-6" />
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1,2,3,4,5,6].map(i => (
            <Card key={i} className="h-48 flex flex-col justify-between">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Skeleton className="h-12 w-12 rounded-xl" />
                  <div>
                    <Skeleton className="h-6 w-48 mb-1" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-8 w-full mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900">Clientes e Fornecedores</h1>
            {isFetching && (
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
            )}
          </div>
          <p className="text-slate-500 mt-1">
            Cadastro de contatos - <span className="font-semibold text-blue-600">{currentCompany?.name}</span>
          </p>
          <Badge variant="outline" className="mt-2">
            {contacts.length} contato(s) nesta filial
          </Badge>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="w-4 h-4 mr-2" />
            Exportar Excel
          </Button>
          
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={() => setImportFile(null)}>
                <Upload className="w-4 h-4 mr-2" />
                Importar Excel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Importar Clientes/Fornecedores</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <Alert>
                  <AlertDescription>
                    <strong>📋 Formatos aceitos:</strong> CSV. (Arquivos Excel devem ser salvos como CSV antes da importação.)
                  </AlertDescription>
                </Alert>

                <div className="space-y-4">
                  <div>
                    <Button 
                      variant="outline" 
                      onClick={downloadTemplate}
                      className="w-full"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar Modelo de Importação
                    </Button>
                    <p className="text-xs text-slate-500 mt-2 text-center">
                      Use este modelo para garantir compatibilidade
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Selecionar Arquivo CSV</Label>
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={(e) => setImportFile(e.target.files[0])}
                    />
                    {importFile && (
                      <p className="text-sm text-green-600">
                        ✅ Arquivo selecionado: {importFile.name}
                      </p>
                    )}
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-900 mb-2">📋 Colunas necessárias:</h4>
                    <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
                      <li><strong>Nome</strong> (obrigatório)</li>
                      <li>Tipo (cliente, fornecedor ou ambos)</li>
                      <li>CPF/CNPJ</li>
                      <li>Email</li>
                      <li>Telefone</li>
                      <li>Endereço</li>
                      <li>Cidade</li>
                      <li>Estado</li>
                      <li>CEP</li>
                      <li>Observações</li>
                    </ul>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h4 className="font-semibold text-yellow-900 mb-2">⚠️ Importante:</h4>
                    <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
                      <li>Arquivo deve ter cabeçalho (primeira linha com nomes das colunas)</li>
                      <li>Use ponto-e-vírgula (;) como separador no CSV</li>
                      <li>Salve o arquivo em UTF-8 para evitar problemas com acentuação</li>
                      <li>Pelo menos a coluna "Nome" é obrigatória para cada contato</li>
                    </ul>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setIsImportDialogOpen(false)}
                    disabled={isImporting}
                  >
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleImport}
                    disabled={!importFile || isImporting}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        Importar
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={resetForm}>
                <Plus className="w-4 h-4 mr-2" />
                Novo Contato
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingContact ? "Editar Contato" : "Novo Contato"}
                </DialogTitle>
                <p className="text-sm text-slate-500">
                  Filial: <span className="font-semibold">{currentCompany?.name}</span>
                </p>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>Tipo *</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(value) => setFormData({ ...formData, type: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cliente">Cliente</SelectItem>
                        <SelectItem value="fornecedor">Fornecedor</SelectItem>
                        <SelectItem value="ambos">Ambos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Nome *</Label>
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CPF/CNPJ</Label>
                    <Input
                      value={formData.document}
                      onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Telefone</Label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Endereço</Label>
                    <Input
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cidade</Label>
                    <Input
                      value={formData.city}
                      onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Estado</Label>
                    <Input
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input
                      value={formData.zip_code}
                      onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Saldo de Crédito (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.credit_balance}
                      onChange={(e) => setFormData({ ...formData, credit_balance: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Observações</Label>
                    <Textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingContact ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="todos">Todos ({contacts.length})</TabsTrigger>
          <TabsTrigger value="cliente">Clientes ({contacts.filter(c => c.type === 'cliente' || c.type === 'ambos').length})</TabsTrigger>
          <TabsTrigger value="fornecedor">Fornecedores ({contacts.filter(c => c.type === 'fornecedor' || c.type === 'ambos').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Buscar por nome, documento ou email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {filteredContacts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500 mb-4">
              {searchTerm ? 'Nenhum contato encontrado' : 'Nenhum contato cadastrado nesta filial ainda'}
            </p>
            {!searchTerm && (
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Primeiro Contato
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredContacts.map((contact) => (
            <Card key={contact.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{contact.name}</CardTitle>
                      <Badge variant="secondary" className="mt-1">
                        {contact.type === 'cliente' ? 'Cliente' : contact.type === 'fornecedor' ? 'Fornecedor' : 'Ambos'}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1 text-sm">
                  {contact.document && (
                    <p className="text-slate-600">CPF/CNPJ: {contact.document}</p>
                  )}
                  {contact.phone && (
                    <p className="text-slate-600">Tel: {contact.phone}</p>
                  )}
                  {contact.email && (
                    <p className="text-slate-600 truncate">Email: {contact.email}</p>
                  )}
                  {contact.city && contact.state && (
                    <p className="text-slate-600">{contact.city}, {contact.state}</p>
                  )}
                  {contact.credit_balance > 0 && (
                    <div className="flex items-center gap-2 pt-2">
                      <DollarSign className="w-4 h-4 text-green-600" />
                      <span className="font-semibold text-green-600">
                        Crédito: R$ {contact.credit_balance.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => handleEdit(contact)}
                >
                  <Edit className="w-4 h-4 mr-2" />
                  Editar
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
