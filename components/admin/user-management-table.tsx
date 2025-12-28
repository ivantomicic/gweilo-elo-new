"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { UserEditDrawer } from "@/components/admin/user-edit-drawer";
import { t } from "@/lib/i18n";
import { PencilIcon } from "lucide-react";

type User = {
	id: string;
	email: string;
	name: string;
	avatar: string | null;
	role: string;
};

export function UserManagementTable() {
	const [users, setUsers] = useState<User[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [editingUser, setEditingUser] = useState<User | null>(null);
	const [drawerOpen, setDrawerOpen] = useState(false);

	// Fetch users
	useEffect(() => {
		const fetchUsers = async () => {
			try {
				setLoading(true);
				setError(null);

				// Get current session token
				const {
					data: { session },
				} = await supabase.auth.getSession();

				if (!session) {
					setError(t.admin.users.error.notAuthenticated);
					return;
				}

				// Fetch users from API
				const response = await fetch("/api/admin/users", {
					headers: {
						Authorization: `Bearer ${session.access_token}`,
					},
				});

				if (!response.ok) {
					if (response.status === 401) {
						setError(t.admin.users.error.unauthorized);
					} else {
						setError(t.admin.users.error.fetchFailed);
					}
					return;
				}

				const data = await response.json();
				setUsers(data.users);
			} catch (err) {
				console.error("Error fetching users:", err);
				setError(t.admin.users.error.fetchFailed);
			} finally {
				setLoading(false);
			}
		};

		fetchUsers();
	}, []);

	// Handle edit button click
	const handleEdit = (user: User) => {
		setEditingUser(user);
		setDrawerOpen(true);
	};

	// Handle drawer close
	const handleDrawerClose = () => {
		setDrawerOpen(false);
		setEditingUser(null);
	};

	// Handle save from drawer
	const handleSave = (updatedUser: User) => {
		// Update local state
		setUsers((prev) =>
			prev.map((u) =>
				u.id === updatedUser.id
					? {
							id: u.id,
							email: updatedUser.email,
							name: updatedUser.name,
							avatar: updatedUser.avatar,
							role: u.role,
						}
					: u
			)
		);
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-muted-foreground">{t.admin.users.loading}</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-destructive">{error}</p>
			</div>
		);
	}

	return (
		<>
			{/* Table Container - Centered with max width */}
			<div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
				<div className="rounded-lg border bg-card">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>{t.admin.users.table.avatar}</TableHead>
								<TableHead>{t.admin.users.table.name}</TableHead>
								<TableHead>{t.admin.users.table.email}</TableHead>
								<TableHead className="w-[100px]">
									{t.admin.users.table.actions}
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{users.length === 0 ? (
								<TableRow>
									<TableCell
										colSpan={4}
										className="text-center py-12 text-muted-foreground"
									>
										{t.admin.users.noUsers}
									</TableCell>
								</TableRow>
							) : (
								users.map((user) => (
									<TableRow key={user.id} className="hover:bg-muted/50">
										{/* Avatar */}
										<TableCell>
											<Avatar className="h-10 w-10">
												<AvatarImage
													src={user.avatar || undefined}
													alt={user.name}
												/>
												<AvatarFallback>
													{user.name.charAt(0).toUpperCase()}
												</AvatarFallback>
											</Avatar>
										</TableCell>

										{/* Name */}
										<TableCell>
											<span className="font-medium">{user.name}</span>
										</TableCell>

										{/* Email */}
										<TableCell>
											<span className="text-muted-foreground">
												{user.email}
											</span>
										</TableCell>

										{/* Actions */}
										<TableCell>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => handleEdit(user)}
												className="h-8 w-8 p-0"
											>
												<PencilIcon className="h-4 w-4" />
											</Button>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</div>

			{/* Edit Drawer */}
			<UserEditDrawer
				user={editingUser}
				open={drawerOpen}
				onClose={handleDrawerClose}
				onSave={handleSave}
			/>
		</>
	);
}
