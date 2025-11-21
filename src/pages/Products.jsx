import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Package, Plus, Search, Edit, Trash2, Building2, Loader2, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Products() {
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCompanyId] = useState(localStorage.getItem('selectedCompanyId'));
  const [importFile, setImportFile] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    condition: "novo",
    size: "",
    unit: "UN",
    cost_price: 0,
    sale_price: 0,
    profit_margin: 0,
    min_stock: 0,
    max_stock: 0
  });

  // Query CORRIGIDA - SEM filtro por company_id
  const { data: products = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['products', selectedCompanyId],
    queryFn: async () => {
      console.log("🔍 Buscando produtos para company_id:", selectedCompanyId);
      
      if (!selectedCompanyId) {
        console.warn("⚠️ Nenhuma empresa selecionada!");
        return [];
      }
      
      // Buscar produtos da empresa
      const result = await base44.entities.Product.filter({
        is_active: true,
        company_id: selectedCompanyId
      }, '-created_date');
      
      console.log("✅ Produtos encontrados:", result.length);
      console.log("📦 Produtos:", result);
      
      return result;
    },
    initialData: [],
    enabled: !!selectedCompanyId,
    staleTime: 30 * 1000, // 30 segundos
    cacheTime: 5 * 60 * 1000,
  });

  // Query companies
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.filter({ is_active: true }),
    initialData: [],
    staleTime: 30 * 60 * 1000,
    cacheTime: 60 * 60 * 1000,
  });

  const currentCompany = useMemo(() =>
    companies.find(c => c.id === selectedCompanyId),
    [companies, selectedCompanyId]
  );

  const filteredProducts = useMemo(() =>
    products.filter(p =>
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.category?.toLowerCase().includes(searchTerm.toLowerCase())
    ),
    [products, searchTerm]
  );

  const createMutation = useMutation({
    mutationFn: async (data) => {
      console.log("📝 Criando produto:", data);
      
      const lastProduct = await base44.entities.Product.filter({ company_id: selectedCompanyId }, '-code', 1);
      const lastCode = lastProduct[0]?.code || 'PROD000000';
      const nextNumber = parseInt(lastCode.replace('PROD', '')) + 1;
      const newCode = `PROD${String(nextNumber).padStart(6, '0')}`;

      const productData = {
        ...data,
        code: newCode,
        company_id: selectedCompanyId
      };
      
      console.log("💾 Salvando produto:", productData);
      return base44.entities.Product.create(productData);
    },
    onSuccess: (result) => {
      console.log("✅ Produto criado:", result);
      queryClient.invalidateQueries(['products']);
      setTimeout(() => refetch(), 500);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Produto criado com sucesso!");
    },
    onError: (error) => {
      console.error("❌ Erro ao criar produto:", error);
      toast.error("Erro ao criar: " + error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Product.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      setTimeout(() => refetch(), 500);
      setIsDialogOpen(false);
      resetForm();
      toast.success("Produto atualizado com sucesso!");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Product.update(id, { is_active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries(['products']);
      setTimeout(() => refetch(), 500);
      toast.success("Produto desativado com sucesso!");
    }
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      condition: "novo",
      size: "",
      unit: "UN",
      cost_price: 0,
      sale_price: 0,
      profit_margin: 0,
      min_stock: 0,
      max_stock: 0
    });
    setEditingProduct(null);
  };

  const calculateSalePrice = (costPrice, margin) => {
    if (!costPrice || !margin) return 0;
    return costPrice * (1 + margin / 100);
  };

  const calculateMargin = (costPrice, salePrice) => {
    if (costPrice === 0 || !salePrice) return 0;
    return ((salePrice - costPrice) / costPrice) * 100;
  };

  const handleCostPriceChange = (value) => {
    const cost = parseFloat(value) || 0;
    setFormData(prev => ({
      ...prev,
      cost_price: cost,
      sale_price: calculateSalePrice(cost, prev.profit_margin)
    }));
  };

  const handleMarginChange = (value) => {
    const margin = parseFloat(value) || 0;
    setFormData(prev => ({
      ...prev,
      profit_margin: margin,
      sale_price: calculateSalePrice(prev.cost_price, margin)
    }));
  };

  const handleSalePriceChange = (value) => {
    const sale = parseFloat(value) || 0;
    setFormData(prev => ({
      ...prev,
      sale_price: sale,
      profit_margin: calculateMargin(prev.cost_price, sale)
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || "",
      description: product.description || "",
      category: product.category || "",
      condition: product.condition || "novo",
      size: product.size || "",
      unit: product.unit || "UN",
      cost_price: product.cost_price || 0,
      sale_price: product.sale_price || 0,
      profit_margin: product.profit_margin || 0,
      min_stock: product.min_stock || 0,
      max_stock: product.max_stock || 0
    });
    setIsDialogOpen(true);
  };

  const downloadTemplate = () => {
    const headers = [
      "Nome",
      "Descrição",
      "Categoria",
      "Condição",
      "Tamanho",
      "Unidade",
      "Preço Custo",
      "Preço Venda",
      "Margem Lucro (%)",
      "Estoque Mínimo",
      "Estoque Máximo"
    ];

    const exampleRows = [
      [
        'Parafuso 10mm',
        'Parafuso sextavado 10mm',
        'Ferragens',
        'novo',
        '10mm',
        'UN',
        '2.50',
        '5.00',
        '100',
        '50',
        '500'
      ],
      [
        'Cimento 50kg',
        'Cimento Portland 50kg',
        'Construção',
        'novo',
        '50kg',
        'UN',
        '25.00',
        '35.00',
        '40',
        '10',
        '100'
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
    link.setAttribute('download', 'modelo_produtos.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    toast.success("Modelo baixado com sucesso!");
  };

  const handleImport = async () => {
    if (!importFile) {
      toast.error("Selecione um arquivo para importar!");
      return;
    }

    if (!selectedCompanyId) {
      toast.error("Nenhuma filial selecionada!");
      return;
    }

    setIsImporting(true);
    toast.info("Processando arquivo...", { duration: 5000 });

    try {
      const arrayBuffer = await importFile.arrayBuffer();
      
      let text;
      try {
        const utf8Decoder = new TextDecoder('utf-8');
        text = utf8Decoder.decode(arrayBuffer);
        
        if (text.includes('�')) {
          console.warn("UTF-8 com caracteres inválidos, tentando windows-1252");
          const decoder1252 = new TextDecoder('windows-1252');
          text = decoder1252.decode(arrayBuffer);
        }
      } catch (e) {
        console.error("Erro UTF-8, usando windows-1252", e);
        const decoder = new TextDecoder('windows-1252');
        text = decoder.decode(arrayBuffer);
      }

      if (text.charCodeAt(0) === 0xFEFF) {
        text = text.substring(1);
      }

      const lines = text.split('\n').filter(line => line.trim().length > 0);
      
      console.log(`📄 Total de linhas: ${lines.length}`);
      
      if (lines.length < 2) {
        toast.error("Arquivo vazio!");
        setIsImporting(false);
        return;
      }

      const headerLine = lines[0];
      const header = headerLine.split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(h => h.trim().replace(/^"|"$/g, ''));
      
      console.log("📋 Cabeçalho:", header);
      
      const sampleLines = [];
      for (let i = 1; i <= Math.min(5, lines.length - 1); i++) {
        const values = lines[i].split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));
        sampleLines.push(values);
        console.log(`Linha ${i + 1}:`, values.slice(0, 10));
      }

      let nomeIdx = -1;
      const possibleNameColumns = ['nome', 'name', 'produto', 'descricao', 'description', 'item'];
      for (const name of possibleNameColumns) {
        const idx = header.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
        if (idx !== -1) {
          const hasData = sampleLines.some(line => line[idx] && line[idx].trim().length > 3);
          if (hasData) {
            nomeIdx = idx;
            console.log(`✅ Coluna nome: índice ${idx}`);
            break;
          }
        }
      }

      if (nomeIdx === -1) {
        const maxCols = Math.max(...sampleLines.map(l => l.length));
        for (let col = 0; col < maxCols; col++) {
          let validCount = 0;
          let totalLength = 0;
          
          for (const line of sampleLines) {
            const value = line[col] || '';
            if (value.trim().length > 3) {
              validCount++;
              totalLength += value.length;
            }
          }
          
          if (validCount >= sampleLines.length * 0.6) {
            const avgLength = totalLength / validCount;
            const firstValue = sampleLines[0][col] || '';
            const isNotOnlyNumbers = !/^\d+([.,]\d+)?$/.test(firstValue);
            
            if (avgLength > 5 && isNotOnlyNumbers) {
              nomeIdx = col;
              console.log(`✅ Auto-detectado: índice ${col}`);
              break;
            }
          }
        }
      }

      if (nomeIdx === -1) {
        toast.error("❌ Não foi possível detectar a coluna de nomes!");
        setIsImporting(false);
        return;
      }

      const detectColumn = (names) => {
        for (const name of names) {
          const idx = header.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
          if (idx !== -1) {
            const hasData = sampleLines.some(line => line[idx] && line[idx].trim().length > 0);
            if (hasData) return idx;
          }
        }
        return -1;
      };

      const descricaoIdx = detectColumn(['descri', 'description']);
      const categoriaIdx = detectColumn(['categoria', 'category']);
      const unidadeIdx = detectColumn(['unidade', 'unit', 'un']);
      const custoIdx = detectColumn(['custo', 'cost']);
      const vendaIdx = detectColumn(['venda', 'sale', 'preco', 'preço']);

      console.log("📍 Colunas:", {
        nome: nomeIdx,
        descricao: descricaoIdx,
        categoria: categoriaIdx,
        unidade: unidadeIdx,
        custo: custoIdx,
        venda: vendaIdx
      });

      const productsData = [];
      
      const lastProductQuery = await base44.entities.Product.filter({ company_id: selectedCompanyId }, '-code', 1);
      let lastCode = lastProductQuery[0]?.code || 'PROD000000';
      let nextNumber = parseInt(lastCode.replace('PROD', '')) || 0;

      let successCount = 0;
      let skippedCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        const values = line.split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, ''));

        const getVal = (idx) => idx >= 0 && idx < values.length ? values[idx] || '' : '';
        const parseNum = (str) => !str ? 0 : parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;

        const name = getVal(nomeIdx);
        
        if (!name || name.trim().length < 2) {
          skippedCount++;
          continue;
        }

        nextNumber++;
        const newCode = `PROD${String(nextNumber).padStart(6, '0')}`;

        const product = {
          code: newCode,
          name: name.slice(0, 255),
          description: (getVal(descricaoIdx) || name).slice(0, 500),
          category: (getVal(categoriaIdx) || 'Geral').slice(0, 100),
          condition: 'novo',
          size: '',
          unit: 'UN',
          cost_price: parseFloat(parseNum(getVal(custoIdx)).toFixed(2)),
          sale_price: parseFloat(parseNum(getVal(vendaIdx)).toFixed(2)),
          profit_margin: 0,
          min_stock: 0,
          max_stock: 0,
          current_stock: 0,
          company_id: selectedCompanyId,
          is_active: true
        };

        if (product.cost_price > 0 && product.sale_price > 0) {
          product.profit_margin = parseFloat((((product.sale_price - product.cost_price) / product.cost_price) * 100).toFixed(2));
        }

        productsData.push(product);
        successCount++;
      }

      console.log(`📊 Total: ${successCount} produtos`);

      if (productsData.length === 0) {
        toast.error("Nenhum produto encontrado!");
        setIsImporting(false);
        return;
      }

      const batchSize = 50;
      for (let i = 0; i < productsData.length; i += batchSize) {
        const batch = productsData.slice(i, i + batchSize);
        await base44.entities.Product.bulkCreate(batch);
        
        if (i + batchSize < productsData.length) {
          toast.info(`Importando... ${i + batch.length}/${productsData.length}`, { duration: 1000 });
        }
      }

      queryClient.invalidateQueries(['products']);
      setTimeout(() => refetch(), 500);
      setIsImportDialogOpen(false);
      setImportFile(null);
      toast.success(`✅ ${productsData.length} produto(s) importados!`);

    } catch (error) {
      console.error("❌ Erro:", error);
      toast.error("Erro ao importar: " + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  if (!selectedCompanyId) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <Alert>
          <Building2 className="h-4 w-4" />
          <AlertDescription>
            Por favor, selecione uma filial no menu "Trocar Filial" para gerenciar os produtos.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900">Gestão de Produtos</h1>
            {isFetching && (
              <Loader2 className="w-5 h-5 animate-spin text-violet-600" />
            )}
          </div>
          <p className="text-slate-500 mt-1">
            Cadastro e controle - <span className="font-semibold text-violet-600">{currentCompany?.name}</span>
          </p>
          <div className="flex items-center gap-3 mt-2">
            <Badge variant="outline">
              {products.length} produto(s)
            </Badge>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                console.log("🔄 Recarregando produtos...");
                refetch();
              }}
            >
              <Loader2 className="w-3 h-3 mr-1" />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="flex gap-3">
          <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" onClick={() => setImportFile(null)}>
                <Upload className="w-4 h-4 mr-2" />
                Importar
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Importar Produtos</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Alert>
                  <AlertDescription>
                    <strong>📋 Formato:</strong> CSV (separado por ponto-e-vírgula)
                  </AlertDescription>
                </Alert>

                <Button variant="outline" onClick={downloadTemplate} className="w-full">
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Modelo
                </Button>

                <Input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setImportFile(e.target.files[0])}
                />

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleImport} disabled={!importFile || isImporting}>
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
              <Button onClick={resetForm} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="w-4 h-4 mr-2" />
                Novo Produto
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingProduct ? "Editar Produto" : "Novo Produto"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-2">
                    <Label>Nome do Produto *</Label>
                    <Input
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Descrição</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <Input
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidade *</Label>
                    <Select
                      value={formData.unit}
                      onValueChange={(value) => setFormData({ ...formData, unit: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="UN">Unidade</SelectItem>
                        <SelectItem value="KG">Quilograma</SelectItem>
                        <SelectItem value="TON">Tonelada</SelectItem>
                        <SelectItem value="L">Litro</SelectItem>
                        <SelectItem value="M">Metro</SelectItem>
                        <SelectItem value="M2">Metro²</SelectItem>
                        <SelectItem value="M3">Metro³</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Preço de Custo (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.cost_price}
                      onChange={(e) => handleCostPriceChange(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Preço de Venda (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.sale_price}
                      onChange={(e) => handleSalePriceChange(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" className="bg-violet-600 hover:bg-violet-700">
                    {editingProduct ? "Atualizar" : "Criar"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
            <Input
              placeholder="Buscar produtos..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {filteredProducts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="w-16 h-16 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500 mb-4">
              {searchTerm ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
            </p>
            {!searchTerm && (
              <Button onClick={() => setIsDialogOpen(true)} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="w-4 h-4 mr-2" />
                Cadastrar Primeiro Produto
              </Button>
            )}
            <div className="mt-4 text-xs text-slate-400">
              <p>Debug: Total {products.length} | Filtrados {filteredProducts.length}</p>
              <p>Company: {selectedCompanyId}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProducts.map((product) => (
            <Card key={product.id} className="hover:shadow-lg transition-shadow border-slate-200">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-violet-600 rounded-xl flex items-center justify-center">
                      <Package className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{product.name}</CardTitle>
                      <p className="text-sm text-slate-500">{product.code}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {product.category && (
                  <Badge variant="secondary">{product.category}</Badge>
                )}
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Unidade:</span>
                    <span className="font-medium">{product.unit}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Preço Venda:</span>
                    <span className="font-medium text-green-600">R$ {product.sale_price?.toFixed(2) || '0.00'}</span>
                  </div>
                </div>
                <div className="flex gap-2 pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEdit(product)}
                  >
                    <Edit className="w-4 h-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => {
                      if (confirm('Desativar este produto?')) {
                        deleteMutation.mutate(product.id);
                      }
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}