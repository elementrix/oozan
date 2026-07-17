const OWNER = 'elementrix';
const REPO = 'oozan';
const BRANCH = 'main';
const API = 'https://api.github.com';

export class GitHubError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export interface RepoFile {
	path: string;
	name: string;
	sha: string;
	size: number;
	downloadUrl: string | null;
}

function headers(token: string) {
	return {
		Authorization: `Bearer ${token}`,
		Accept: 'application/vnd.github+json',
		'X-GitHub-Api-Version': '2022-11-28',
	};
}

async function request(token: string, path: string, init?: RequestInit) {
	const res = await fetch(`${API}${path}`, {
		...init,
		headers: { ...headers(token), ...(init?.headers ?? {}) },
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new GitHubError(res.status, body.message || `GitHub API error (${res.status})`);
	}
	return res;
}

/** confirms the token can read+write this specific repo */
export async function verifyToken(token: string): Promise<void> {
	const res = await fetch(`${API}/repos/${OWNER}/${REPO}`, { headers: headers(token) });
	if (!res.ok) throw new GitHubError(res.status, '토큰이 유효하지 않거나 이 저장소에 접근 권한이 없습니다.');
	const data = await res.json();
	const perms = data.permissions;
	if (!perms?.push) throw new GitHubError(403, '토큰에 쓰기(Contents: Read and write) 권한이 없습니다.');
}

/** lists files in a directory (non-recursive); a missing directory (e.g. a
 * person with no photos yet) is a normal empty state, not an error */
export async function listDir(token: string, dirPath: string): Promise<RepoFile[]> {
	const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${dirPath}?ref=${BRANCH}`, { headers: headers(token) });
	if (res.status === 404) return [];
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new GitHubError(res.status, body.message || `${dirPath} 조회 실패`);
	}
	const data = await res.json();
	if (!Array.isArray(data)) return [];
	return data
		.filter((f: any) => f.type === 'file')
		.map((f: any) => ({ path: f.path, name: f.name, sha: f.sha, size: f.size, downloadUrl: f.download_url }));
}

/** returns null if the file doesn't exist */
export async function getFileText(token: string, path: string): Promise<{ text: string; sha: string } | null> {
	const res = await fetch(`${API}/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`, { headers: headers(token) });
	if (res.status === 404) return null;
	if (!res.ok) throw new GitHubError(res.status, `${path} 조회 실패`);
	const data = await res.json();
	return { text: decodeURIComponent(escape(atob(data.content.replace(/\n/g, '')))), sha: data.sha };
}

/** fetches raw bytes for a file already known via listDir (avoids the Contents API's ~1MB inline-content cap) */
export async function getFileBase64(downloadUrl: string): Promise<string> {
	const res = await fetch(downloadUrl);
	if (!res.ok) throw new GitHubError(res.status, '파일 다운로드 실패');
	const buf = await res.arrayBuffer();
	return arrayBufferToBase64(buf);
}

export function arrayBufferToBase64(buf: ArrayBuffer): string {
	let binary = '';
	const bytes = new Uint8Array(buf);
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
	}
	return btoa(binary);
}

function utf8ToBase64(text: string): string {
	return btoa(unescape(encodeURIComponent(text)));
}

/** creates or updates a text file; pass the current sha when updating an existing file */
export async function putTextFile(token: string, path: string, text: string, message: string, sha?: string): Promise<void> {
	await request(token, `/repos/${OWNER}/${REPO}/contents/${path}`, {
		method: 'PUT',
		body: JSON.stringify({ message, content: utf8ToBase64(text), sha, branch: BRANCH }),
	});
}

/** creates or updates a binary file from base64 content; pass the current sha when updating */
export async function putBinaryFile(token: string, path: string, base64: string, message: string, sha?: string): Promise<void> {
	await request(token, `/repos/${OWNER}/${REPO}/contents/${path}`, {
		method: 'PUT',
		body: JSON.stringify({ message, content: base64, sha, branch: BRANCH }),
	});
}

export async function deleteFile(token: string, path: string, message: string, sha: string): Promise<void> {
	await request(token, `/repos/${OWNER}/${REPO}/contents/${path}`, {
		method: 'DELETE',
		body: JSON.stringify({ message, sha, branch: BRANCH }),
	});
}

export const REPO_INFO = { owner: OWNER, repo: REPO, branch: BRANCH };
