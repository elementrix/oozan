/** accepts a bare video ID or common YouTube URL shapes and returns just the ID */
export function extractYoutubeId(input: string): string {
	const trimmed = input.trim();
	try {
		const url = new URL(trimmed);
		if (url.hostname === 'youtu.be') return url.pathname.slice(1).split('/')[0];
		if (url.hostname.includes('youtube.com')) {
			const v = url.searchParams.get('v');
			if (v) return v;
			const shorts = url.pathname.match(/\/shorts\/([^/]+)/);
			if (shorts) return shorts[1];
			const embed = url.pathname.match(/\/embed\/([^/]+)/);
			if (embed) return embed[1];
		}
	} catch {
		// not a URL — fall through and treat as a bare ID
	}
	return trimmed;
}
