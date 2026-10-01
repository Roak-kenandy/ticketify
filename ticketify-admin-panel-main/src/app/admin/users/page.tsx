"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { AdminAPI } from "@/lib/admin-api";
import { initials } from "@/lib/access";
import { Role, User, UserFilter } from "@/types/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { TableSkeletonRows } from "@/components/app/filter-bar";

const COLUMNS = 5;

export default function UsersPage() {
  const [users, setUsers] = React.useState<User[]>([]);
  const [roles, setRoles] = React.useState<Role[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState("");
  const [filters, setFilters] = React.useState<UserFilter>({
    search: "",
    role: "",
    availability: undefined,
    page: 1,
    limit: 100,
  });
  const [pendingDelete, setPendingDelete] = React.useState<User | null>(null);

  React.useEffect(() => {
    AdminAPI.getAllRoles()
      .then(setRoles)
      .catch(() => setRoles([]));
  }, []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) =>
        prev.search === searchInput.trim()
          ? prev
          : { ...prev, search: searchInput.trim(), page: 1 },
      );
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchUsers = React.useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await AdminAPI.getAllUsers(filters);
      setUsers(Array.isArray(response) ? response : response?.users ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function toggleStatus(user: User) {
    try {
      await AdminAPI.toggleUserStatus(user.id);
      toast.success(
        `${user.name} is now ${user.availability ? "inactive" : "active"}`,
      );
      fetchUsers();
    } catch {
      toast.error("Couldn't update the user's status");
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }
    try {
      await AdminAPI.deleteUser(pendingDelete.id);
      toast.success(`${pendingDelete.name} was deleted`);
      fetchUsers();
    } catch {
      toast.error("Couldn't delete the user");
      throw new Error("delete failed");
    }
  }

  const filtersActive =
    Boolean(filters.search) || Boolean(filters.role) || filters.availability !== undefined;

  function clearFilters() {
    setSearchInput("");
    setFilters((prev) => ({
      ...prev,
      search: "",
      role: "",
      availability: undefined,
      page: 1,
    }));
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with a Ticketify account — technicians, supervisors, finance and management."
        actions={
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchUsers}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            </Button>
            <Button asChild>
              <Link href="/admin/users/create">
                <Plus className="h-4 w-4" />
                Add user
              </Link>
            </Button>
          </>
        }
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center">
          <div className="relative flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, email or phone"
              className="pl-9"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search users"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select
              value={filters.role || "all"}
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  role: value === "all" ? "" : value,
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="w-40" aria-label="Filter by role">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map((role) => (
                  <SelectItem key={role.id} value={role.name.toLowerCase()}>
                    {role.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={
                filters.availability === undefined
                  ? "all"
                  : filters.availability
                    ? "active"
                    : "inactive"
              }
              onValueChange={(value) =>
                setFilters((prev) => ({
                  ...prev,
                  availability:
                    value === "all" ? undefined : value === "active",
                  page: 1,
                }))
              }
            >
              <SelectTrigger className="w-40" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {filtersActive && (
              <Button variant="ghost" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Clear
              </Button>
            )}
          </div>
          {!loading && !error && (
            <p className="text-sm text-muted-foreground md:ml-auto">
              <span className="font-medium tabular-nums text-foreground">
                {users.length}
              </span>{" "}
              {users.length === 1 ? "user" : "users"}
            </p>
          )}
        </div>

        {error ? (
          <EmptyState
            variant="error"
            title="Couldn't load users"
            description="Something went wrong while fetching accounts."
            action={<Button onClick={fetchUsers}>Try again</Button>}
          />
        ) : !loading && users.length === 0 ? (
          filtersActive ? (
            <EmptyState
              variant="no-results"
              title="No users match these filters"
              description="Try a different name, role or status."
              action={
                <Button variant="outline" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No users yet"
              description="Create the first account to start assigning tickets."
              action={
                <Button asChild>
                  <Link href="/admin/users/create">
                    <Plus className="h-4 w-4" />
                    Add user
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <Table containerClassName="max-h-[calc(100dvh-300px)]">
            <TableHeader sticky>
              <TableRow className="hover:bg-transparent">
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Phone</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableSkeletonRows columns={COLUMNS + 1} />
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {initials(user.name)}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/admin/users/${user.id}`}
                            className="block truncate font-medium hover:text-primary hover:underline"
                          >
                            {user.name}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="brand">{user.role?.name ?? "—"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge dot variant={user.availability ? "success" : "outline"}>
                        {user.availability ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden tabular-nums text-muted-foreground md:table-cell">
                      {user.phone || "—"}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
                      {new Date(user.created_at).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            aria-label={`Actions for ${user.name}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem asChild>
                            <Link href={`/admin/users/${user.id}`}>
                              <Pencil className="mr-2 h-4 w-4" />
                              View profile
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => toggleStatus(user)}>
                            {user.availability ? (
                              <>
                                <UserX className="mr-2 h-4 w-4" />
                                Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="mr-2 h-4 w-4" />
                                Activate
                              </>
                            )}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setPendingDelete(user)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.name ?? "user"}?`}
        description="This permanently removes the account and can't be undone. To block sign-in temporarily, deactivate the user instead."
        confirmLabel="Delete user"
        destructive
        onConfirm={confirmDelete}
      />
    </>
  );
}
