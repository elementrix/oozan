// Minimal frontmatter reader/writer matched to this project's content files —
// simple `key: "value"` / `key: number` pairs, one per line, no nested
// structures. Not a general YAML parser; a real one is overkill for a
// handful of flat string/number fields.

export type FrontmatterValue = string | number | undefined;

export function parseFrontmatter(raw: string): { data: Record<string, FrontmatterValue>; body: string } {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { data: {}, body: raw };
	const [, block, body] = match;
	const data: Record<string, FrontmatterValue> = {};
	for (const line of block.split('\n')) {
		const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
		if (!m) continue;
		const [, key, rawValue] = m;
		const trimmed = rawValue.trim();
		if (trimmed === '') {
			data[key] = '';
		} else if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
			data[key] = Number(trimmed);
		} else if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
			data[key] = trimmed.slice(1, -1).replace(/\\"/g, '"');
		} else {
			data[key] = trimmed;
		}
	}
	return { data, body: body ?? '' };
}

export function serializeFrontmatter(data: Record<string, FrontmatterValue>, body = ''): string {
	const lines: string[] = ['---'];
	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === '') continue;
		if (typeof value === 'number') {
			lines.push(`${key}: ${value}`);
		} else {
			lines.push(`${key}: "${String(value).replace(/"/g, '\\"')}"`);
		}
	}
	lines.push('---', '');
	return lines.join('\n') + body;
}

export function slugify(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60);
}
