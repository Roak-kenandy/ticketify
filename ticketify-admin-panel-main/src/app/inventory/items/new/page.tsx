"use client";

import * as React from "react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AdminAuth } from "@/lib/admin-auth";
import axiosInterceptorInstance from "@/lib/axios-interceptor";
import type { InventoryItem } from "@/lib/inventory";
import { ITEMS_HREF, ItemForm, uniqueCategories } from "../item-form";

export default function NewItemPage() {
  const [canManage, setCanManage] = React.useState<boolean | null>(null);
  const [categories, setCategories] = React.useState<string[]>([]);

  React.useEffect(() => {
    setCanManage(AdminAuth.canManageItemMaster());
    axiosInterceptorInstance
      .get<InventoryItem[]>("/inventory/items?include_inactive=true")
      .then((response) => setCategories(uniqueCategories(response.data ?? [])))
      .catch(() => setCategories([]));
  }, []);

  return (
    <>
      <PageHeader
        backHref={ITEMS_HREF}
        backLabel="Item master"
        title="Add item"
        description="Create an item technicians can record on a service request."
      />
      {canManage === false ? (
        <EmptyState
          variant="error"
          title="You can't add items"
          description="Only the inventory team can manage the item master."
        />
      ) : canManage ? (
        <ItemForm item={null} categories={categories} />
      ) : null}
    </>
  );
}
