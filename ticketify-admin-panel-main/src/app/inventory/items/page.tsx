"use client";

import * as React from "react";
import Link from "next/link";
import { PencilLine, Plus, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { FilterBar, FilterField, TableSkeletonRows } from "@/components/app/filter-bar";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import { AdminAuth } from "@/lib/admin-auth";
import type { InventoryItem } from "@/lib/inventory";
import { ITEMS_HREF, uniqueCategories } from "./item-form";

export default function ItemMasterPage() {
  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [showInactive, setShowInactive] = React.useState(false);
  const [canManage, setCanManage] = React.useState(false);

  React.useEffect(() => setCanManage(AdminAuth.canManageItemMaster()), []);

  const load = React.useCallback(() => {
    setLoading(true);
    setError(false);
    axiosInterceptorInstance
      .get<InventoryItem[]>("/inventory/items?include_inactive=true")
      .then((response) => setItems(response.data ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const categories = React.useMemo(() => uniqueCategories(items), [items]);
  const needle = search.trim().toLowerCase();
  const visible = items.filter(
    (item) =>
      (showInactive || item.active) &&
      (category === "all" || item.category === category) &&
      (!needle || item.name.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle)),
  );
  const filtered = Boolean(needle) || category !== "all";

  return (
    <>
      <PageHeader
        title="Item master"
        description="Items technicians can record on a service request, with their stock and consumption units, conversion and serial rules."
        actions={
          canManage && (
            <Button asChild>
              <Link href={`${ITEMS_HREF}/new`}>
                <Plus className="h-4 w-4" />
                Add item
              </Link>
            </Button>
          )
        }
      />

      <FilterBar>
        <FilterField label="Search" htmlFor="item-search" className="min-w-[220px] flex-1 sm:max-w-xs">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="item-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or code"
              className="pl-9"
            />
          </div>
        </FilterField>
        <FilterField label="Category">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-52" aria-label="Category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <label className="flex h-9 items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={showInactive} onCheckedChange={setShowInactive} aria-label="Show inactive items" />
          Show inactive
        </label>
        {filtered && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch("");
              setCategory("all");
            }}
          >
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </FilterBar>

      <Card className="overflow-hidden">
        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load the item master"
            description="The inventory service didn't respond."
            action={<Button onClick={load}>Try again</Button>}
          />
        ) : !loading && visible.length === 0 ? (
          <EmptyState
            variant={filtered ? "no-results" : "empty"}
            title={filtered ? "No items match" : "No items yet"}
            description={filtered ? "Try a different name, code or category." : "Add the first item technicians can record."}
          />
        ) : (
          <Table containerClassName="max-h-[calc(100dvh-300px)] min-h-[320px]">
            <TableHeader sticky>
              <TableRow className="hover:bg-transparent">
                <TableHead>Item</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Stock UOM</TableHead>
                <TableHead>Consumption UOM</TableHead>
                <TableHead>Conversion</TableHead>
                <TableHead>Rules</TableHead>
                <TableHead>Status</TableHead>
                {canManage && (
                  <TableHead className="w-10">
                    <span className="sr-only">Edit</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeletonRows columns={canManage ? 8 : 7} rows={10} />
              ) : (
                visible.map((item) => (
                  <TableRow key={item.id} className={item.active ? undefined : "opacity-60"}>
                    <TableCell className="min-w-[220px]">
                      <div className="font-medium">{item.name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{item.code}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{item.category}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.stock_uom}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.consumption_uom}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                      {item.conversion_factor === 1
                        ? "1 : 1"
                        : `1 ${item.stock_uom} = ${item.conversion_factor.toLocaleString("en-US")} ${item.consumption_uom}`}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {item.serialized && <Badge variant="info">Serial required</Badge>}
                        {item.allow_decimal && <Badge variant="brand">Decimal</Badge>}
                        {item.remarks_required && <Badge variant="outline">Remarks</Badge>}
                        {!item.serialized && !item.allow_decimal && !item.remarks_required && (
                          <span className="text-xs text-muted-foreground">Whole units</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.active ? "success" : "secondary"} dot>
                        {item.active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild>
                          <Link href={`${ITEMS_HREF}/${item.id}`} aria-label={`Edit ${item.name}`}>
                            <PencilLine className="h-4 w-4" />
                          </Link>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
        {!loading && !error && visible.length > 0 && (
          <div className="border-t px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium tabular-nums text-foreground">{visible.length}</span> of{" "}
            <span className="tabular-nums">{items.length}</span> items
          </div>
        )}
      </Card>
    </>
  );
}
