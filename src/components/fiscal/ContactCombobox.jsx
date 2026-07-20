import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";

export default function ContactCombobox({ contacts, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const selected = contacts.find(c => c.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{selected ? selected.name : "Buscar cliente por nome ou CPF/CNPJ..."}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Digite o nome ou CPF/CNPJ..." />
          <CommandList>
            <CommandEmpty>Nenhum cliente encontrado</CommandEmpty>
            {contacts.map(c => (
              <CommandItem
                key={c.id}
                value={`${c.name} ${c.document || ""}`}
                onSelect={() => { onSelect(c.id); setOpen(false); }}
              >
                <Check className={`w-4 h-4 mr-2 ${c.id === value ? "opacity-100" : "opacity-0"}`} />
                <div className="min-w-0">
                  <p className="truncate">{c.name}</p>
                  {c.document && <p className="text-xs text-slate-400">{c.document}</p>}
                </div>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}