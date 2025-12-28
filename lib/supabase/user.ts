import { supabase } from "./client";

/**
 * Update user display name in metadata
 */
export async function updateDisplayName(name: string) {
	const {
		data: { user },
		error,
	} = await supabase.auth.updateUser({
		data: {
			name: name,
		},
	});

	if (error) throw error;
	return user;
}

/**
 * Update user email
 * Supabase will send confirmation email to new address
 */
export async function updateEmail(newEmail: string) {
	const { data, error } = await supabase.auth.updateUser({
		email: newEmail,
	});

	if (error) {
		// Check if error is due to re-authentication requirement
		if (error.message.includes("re-authenticate") || error.message.includes("session")) {
			throw new Error("REAUTH_REQUIRED");
		}
		throw error;
	}
	return data;
}

/**
 * Update user password
 */
export async function updatePassword(newPassword: string) {
	const { data, error } = await supabase.auth.updateUser({
		password: newPassword,
	});

	if (error) {
		// Check if error is due to re-authentication requirement
		if (error.message.includes("re-authenticate") || error.message.includes("session")) {
			throw new Error("REAUTH_REQUIRED");
		}
		throw error;
	}
	return data;
}

/**
 * Upload avatar to Supabase Storage and update user metadata
 */
export async function uploadAvatar(file: File): Promise<string> {
	// Validate file type
	if (!file.type.startsWith("image/")) {
		throw new Error("INVALID_TYPE");
	}

	// Validate file size (5MB max)
	if (file.size > 5 * 1024 * 1024) {
		throw new Error("TOO_LARGE");
	}

	const {
		data: { user },
	} = await supabase.auth.getUser();

	if (!user) {
		throw new Error("NOT_AUTHENTICATED");
	}

	// Create unique filename
	const fileExt = file.name.split(".").pop();
	const fileName = `${user.id}-${Date.now()}.${fileExt}`;
	// Path should not include bucket name - just the file path within the bucket
	const filePath = fileName;

	// Upload to storage
	const { error: uploadError, data: uploadData } = await supabase.storage
		.from("avatars")
		.upload(filePath, file, {
			cacheControl: "3600",
			upsert: true,
		});

	if (uploadError) {
		// Log the actual error for debugging
		console.error("Avatar upload error:", uploadError);
		// Check for specific error types
		if (uploadError.message.includes("Bucket not found")) {
			throw new Error("BUCKET_NOT_FOUND");
		}
		if (uploadError.message.includes("new row violates row-level security")) {
			throw new Error("PERMISSION_DENIED");
		}
		throw new Error(`UPLOAD_FAILED: ${uploadError.message}`);
	}

	// Get public URL - path should be just the filename
	const {
		data: { publicUrl },
	} = supabase.storage.from("avatars").getPublicUrl(filePath);

	// Update user metadata with new avatar URL
	const { error: updateError } = await supabase.auth.updateUser({
		data: {
			avatar_url: publicUrl,
		},
	});

	if (updateError) {
		throw new Error("UPDATE_FAILED");
	}

	return publicUrl;
}

