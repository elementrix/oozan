export function withBase(path: string): string {
	const base = import.meta.env.BASE_URL;
	const trimmedBase = base.endsWith('/') ? base : `${base}/`;
	const trimmedPath = path.startsWith('/') ? path.slice(1) : path;
	return `${trimmedBase}${trimmedPath}`;
}
