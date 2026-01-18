"use client";

import { useEffect, useState } from "react";
import { Box } from "@/components/ui/box";
import { Loading } from "@/components/ui/loading";

type TableTennisGifWidgetProps = {
	/** Giphy tag to use when fetching random GIFs. Default: "table+tennis+ping+pong" */
	tag?: string;
	/** Fallback GIF URLs to use if API fails. Default: table tennis GIFs */
	fallbackUrls?: string[];
};

const DEFAULT_FALLBACK_URLS = [
	'https://media.giphy.com/media/3o7TKTnJYXYK8A0VQA/giphy.gif',
	'https://media.giphy.com/media/l0MYB5UzpU9M2B8Na/giphy.gif',
	'https://media.giphy.com/media/3o6Zt481isNVuQI1l6/giphy.gif',
	'https://media.giphy.com/media/26BRuo6sLetdllPAQ/giphy.gif',
	'https://media.giphy.com/media/xT9IgG50Fb7Mi0prBC/giphy.gif',
];

export function TableTennisGifWidget({
	tag = "table+tennis+ping+pong",
	fallbackUrls = DEFAULT_FALLBACK_URLS,
}: TableTennisGifWidgetProps = {}) {
	const [gifUrl, setGifUrl] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const fetchGif = async () => {
			try {
				setLoading(true);
				// Using Giphy's random endpoint with provided tag
				const apiKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY || 'dc6zaTOxFJmzC'; // fallback to demo key
				const response = await fetch(
					`https://api.giphy.com/v1/gifs/random?api_key=${apiKey}&tag=${tag}&rating=g`
				);
				
				if (response.ok) {
					const data = await response.json();
					if (data?.data?.images?.downsized?.url) {
						setGifUrl(data.data.images.downsized.url);
						setLoading(false);
						return;
					}
				}
			} catch (error) {
				console.error("Error fetching gif:", error);
			}
			
			// Fallback: use provided fallback URLs
			const randomUrl = fallbackUrls[Math.floor(Math.random() * fallbackUrls.length)];
			setGifUrl(randomUrl);
			setLoading(false);
		};

		fetchGif();
	}, [tag, fallbackUrls]);

	if (loading) {
		return (
			<Box className="bg-card rounded-[24px] border border-border/50 p-6 aspect-[7/5] flex flex-col items-center justify-center">
				<Loading inline />
			</Box>
		);
	}

	return (
		<Box className="bg-card rounded-[24px] border border-border/50 aspect-[7/5] overflow-hidden relative">
			{gifUrl && (
				<img
					src={gifUrl}
					alt="Table tennis"
					className="absolute inset-0 w-full h-full object-cover"
				/>
			)}
		</Box>
	);
}
