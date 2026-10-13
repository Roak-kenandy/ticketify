"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AdminAuth } from "@/lib/admin-auth";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import type { InventoryItem } from "@/lib/inventory";
import { ITEMS_HREF, ItemForm, uniqueCategories } from "../item-form";

export default function EditItemPage() {
  const { id } = useParams<{ id: string }>();
  const [item, setItem] = React.useState<InventoryItem | null>(null);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [canManage, setCanManage] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setCanManage(AdminAuth.canManageItemMaster());
    Promise.all([
      axiosInterceptorInstance.get<InventoryItem>(`/inventory/items/${id}`),
      axiosInterceptorInstance.get<InventoryItem[]>("/inventory/items?include_inactive=true"),
    ])
      .then(([one, all]) => {
        setItem(one.data);
        setCategories(uniqueCategories(all.data ?? []));
      })
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <PageHeader
        backHref={ITEMS_HREF}
        backLabel="Item master"
        title={item ? `Edit ${item.name}` : "Edit item"}
        description="Changes apply to new lines only. Lines already posted keep the name and unit they were recorded with."
        actions={
          item && (
            <Badge variant={item.active ? "success" : "secondary"} dot>
              {item.active ? "Active" : "Inactive"}
            </Badge>
          )
        }
      />
      {loading || canManage === null ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardContent className="space-y-4 p-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        </div>
      ) : !canManage ? (
        <EmptyState
          variant="error"
          title="You can't edit items"
          description="Only the inventory team can manage the item master."
        />
      ) : !item ? (
        <EmptyState
          variant="error"
          title="Item not found"
          description="It may have been removed, or the link is wrong."
          action={
            <Button asChild>
              <Link href={ITEMS_HREF}>Back to item master</Link>
            </Button>
          }
        />
      ) : (
        <ItemForm item={item} categories={categories} />
      )}
    </>
  );
}
