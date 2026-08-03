"use client";

import * as React from "react";
import {
	Avatar,
	AvatarFallback,
	AvatarImage as BaseAvatarImage,
} from "@/components/vendor/shadcn/avatar";

const DICEBEAR_WAVES_URL = "https://api.dicebear.com/10.x/waves/svg";

type AvatarImageProps = React.ComponentPropsWithoutRef<typeof BaseAvatarImage> & {
	/** A stable identifier is preferred; the image alt text is used by default. */
	fallbackSeed?: string;
};

export function getGeneratedAvatarUrl(seed: string) {
	return `${DICEBEAR_WAVES_URL}?seed=${encodeURIComponent(seed)}`;
}

const AvatarImage = React.forwardRef<
	React.ElementRef<typeof BaseAvatarImage>,
	AvatarImageProps
>(({ src, alt, fallbackSeed, ...props }, ref) => {
	const generatedSeed = (fallbackSeed || alt || "").trim();
	const resolvedSrc = src ||
		(generatedSeed ? getGeneratedAvatarUrl(generatedSeed) : undefined);

	return (
		<BaseAvatarImage
			ref={ref}
			src={resolvedSrc}
			alt={alt}
			{...props}
		/>
	);
});

AvatarImage.displayName = "AvatarImage";

export { Avatar, AvatarImage, AvatarFallback };
