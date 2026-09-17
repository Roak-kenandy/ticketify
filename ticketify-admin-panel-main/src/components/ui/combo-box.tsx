"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  options: string[];
};

export function ComboBox(props: Props) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[180px] text-sm p-2 py-1 rounded-none border border-neutral-800 bg-transparent text-neutral-50 justify-between"
        >
          {value ? value : props.placeholder || "Select framework"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[200px] p-0">
        <Command>
          <CommandInput placeholder="Search framework..." />
          <CommandEmpty>No framework found.</CommandEmpty>
        </Command>
        <CommandGroup>
          {props.options.map((option) => (
            <CommandItem
              key={option}
              onClick={() => {
                setValue(option);
                props?.onChange?.(option);
                setOpen(false);
              }}
            >
              <div className="flex items-center justify-between">
                <span>{option}</span>
                {option === value && <Check className="h-4 w-4" />}
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </PopoverContent>
    </Popover>
  );
}

export default ComboBox;
