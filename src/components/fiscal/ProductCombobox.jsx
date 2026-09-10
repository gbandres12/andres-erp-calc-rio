import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";

export default function ProductCombobox({ products, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const selected = products.find(p => p.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full h-9 justify-between font-normal text-sm">
          <span className="truncate">{selected ? selected.name : "Buscar produto por nome ou código..."}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite nome, código ou NCM..." />
          <CommandList>
            <CommandEmpty>Nenhum produto encontrado</CommandEmpty>
            {products.map(p => (
              <CommandItem
                key={p.id}
                value={`${p.name} ${p.code || ""} ${p.ncm || ""} ${p.fiscal_description || ""}`}
                onSelect={() => { onSelect(p.id); setOpen(false); }}
              >
                <Check className={`w-4 h-4 mr-2 flex-shrink-0 ${p.id === value ? "opacity-100" : "opacity-0"}`} />
                <div className="min-w-0">
                  <p className="truncate">{p.name}</p>
                  <p className="text-xs text-slate-400 truncate">{p.code || ""}{p.ncm ? ` • NCM ${p.ncm}` : ""}</p>
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}