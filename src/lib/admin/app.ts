import { GitHubError, deleteFile, getFileBase64, getFileText, listDir, putBinaryFile, putTextFile, verifyToken } from './github';
import { parseFrontmatter, serializeFrontmatter, slugify } from './frontmatter';
import { resizeImageToBase64 } from './image';
import { extractYoutubeId } from './youtube';

const TOKEN_KEY = 'oozan-admin-token';

interface FilmItem {
	slug: string;
	sha: string;
	coverPath: string;
	coverSha: string | null;
	coverUrl: string | null;
	title: string;
	description: string;
	role: string;
	youtubeId: string;
	order: number;
}

interface PhotoItem {
	name: string;
	path: string;
	sha: string;
	downloadUrl: string;
}

interface PersonItem {
	slug: string;
	sha: string;
	name: string;
	nameEn: string;
	order: number;
	photos: PhotoItem[] | null; // null until loaded
	open: boolean;
}

let token = '';
let films: FilmItem[] = [];
let people: PersonItem[] = [];

function $<T extends HTMLElement>(id: string): T {
	const el = document.getElementById(id);
	if (!el) throw new Error(`#${id} not found`);
	return el as T;
}

function escapeHtml(s: string): string {
	return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string, isError = false) {
	const el = $('toast');
	el.textContent = message;
	el.classList.toggle('error', isError);
	el.hidden = false;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (el.hidden = true), isError ? 5000 : 2800);
}

function friendlyError(e: unknown): string {
	if (e instanceof GitHubError) return e.message;
	if (e instanceof Error) return e.message;
	return '알 수 없는 오류가 발생했습니다.';
}

// ---------- auth ----------

async function tryAuth(candidate: string): Promise<boolean> {
	try {
		await verifyToken(candidate);
		token = candidate;
		localStorage.setItem(TOKEN_KEY, candidate);
		$('auth-gate').hidden = true;
		$('admin-content').hidden = false;
		$('auth-status-row').hidden = false;
		$('auth-status').textContent = '연결됨';
		return true;
	} catch (e) {
		$('auth-error').hidden = false;
		$('auth-error').textContent = friendlyError(e);
		return false;
	}
}

function logout() {
	localStorage.removeItem(TOKEN_KEY);
	location.reload();
}

// ---------- films ----------

async function loadFilms() {
	const [mdFiles, coverFiles] = await Promise.all([listDir(token, 'src/content/films'), listDir(token, 'src/assets/films')]);
	const coverBySlug = new Map(coverFiles.map((f) => [f.name.replace(/\.[^.]+$/, ''), f]));

	films = await Promise.all(
		mdFiles
			.filter((f) => f.name.endsWith('.md'))
			.map(async (f) => {
				const slug = f.name.replace(/\.md$/, '');
				const file = await getFileText(token, f.path);
				const { data } = parseFrontmatter(file?.text ?? '');
				const cover = coverBySlug.get(slug);
				const coverName = String(data.cover ?? '').split('/').pop() ?? `${slug}.jpg`;
				return {
					slug,
					sha: file?.sha ?? f.sha,
					coverPath: `src/assets/films/${coverName}`,
					coverSha: cover?.sha ?? null,
					coverUrl: cover?.downloadUrl ?? null,
					title: String(data.title ?? ''),
					description: String(data.description ?? ''),
					role: String(data.role ?? ''),
					youtubeId: String(data.youtubeId ?? ''),
					order: Number(data.order ?? 0),
				};
			}),
	);
	films.sort((a, b) => a.order - b.order);
	renderFilms();
}

function renderFilms() {
	$('films-count').textContent = `${films.length}개`;
	const list = $('films-list');
	list.innerHTML = films
		.map(
			(f, i) => `
		<div class="item-row" data-slug="${escapeHtml(f.slug)}">
			${f.coverUrl ? `<img class="item-thumb" src="${escapeHtml(f.coverUrl)}" alt="" />` : '<div class="item-thumb"></div>'}
			<div class="item-main">
				<div class="item-title">${escapeHtml(f.title || f.slug)}</div>
				<div class="item-sub">${escapeHtml(f.youtubeId)}${f.role ? ' · ' + escapeHtml(f.role) : ''}</div>
			</div>
			<div class="item-actions">
				<button type="button" data-act="up" ${i === 0 ? 'disabled' : ''}>▲</button>
				<button type="button" data-act="down" ${i === films.length - 1 ? 'disabled' : ''}>▼</button>
				<button type="button" data-act="edit">수정</button>
				<button type="button" class="danger" data-act="delete">삭제</button>
			</div>
		</div>`,
		)
		.join('');
}

$('films-list').addEventListener('click', async (e) => {
	const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
	const row = (e.target as HTMLElement).closest<HTMLElement>('.item-row');
	if (!btn || !row) return;
	const slug = row.dataset.slug!;
	const film = films.find((f) => f.slug === slug);
	if (!film) return;

	if (btn.dataset.act === 'edit') return openFilmForm(film);
	if (btn.dataset.act === 'delete') return deleteFilm(film);
	if (btn.dataset.act === 'up' || btn.dataset.act === 'down') return swapFilmOrder(film, btn.dataset.act === 'up' ? -1 : 1);
});

async function swapFilmOrder(film: FilmItem, dir: -1 | 1) {
	const idx = films.indexOf(film);
	const otherIdx = idx + dir;
	if (otherIdx < 0 || otherIdx >= films.length) return;
	const other = films[otherIdx];
	const [a, b] = [film.order, other.order];
	try {
		toast('순서 저장 중...');
		await Promise.all([saveFilmOrder(film, b), saveFilmOrder(other, a)]);
		film.order = b;
		other.order = a;
		films.sort((x, y) => x.order - y.order);
		renderFilms();
		toast('순서를 저장했습니다.');
	} catch (e) {
		toast(friendlyError(e), true);
	}
}

async function saveFilmOrder(film: FilmItem, order: number) {
	const path = `src/content/films/${film.slug}.md`;
	const text = serializeFrontmatter({
		title: film.title,
		description: film.description,
		role: film.role || undefined,
		youtubeId: film.youtubeId,
		cover: `../../assets/${film.coverPath.replace('src/assets/', '')}`,
		order,
	});
	await putTextFile(token, path, text, `admin: reorder ${film.slug}`, film.sha);
}

function openFilmForm(film?: FilmItem) {
	const form = $<HTMLFormElement>('film-form');
	form.hidden = false;
	form.scrollIntoView({ behavior: 'smooth', block: 'center' });
	$('film-error').hidden = true;
	$<HTMLInputElement>('film-editing-slug').value = film?.slug ?? '';
	$<HTMLInputElement>('film-title').value = film?.title ?? '';
	$<HTMLInputElement>('film-description').value = film?.description ?? '';
	$<HTMLInputElement>('film-role').value = film?.role ?? '';
	$<HTMLInputElement>('film-youtube').value = film?.youtubeId ?? '';
	$<HTMLInputElement>('film-slug').value = film?.slug ?? '';
	$<HTMLInputElement>('film-slug').disabled = !!film;
	$('film-slug-row').hidden = !!film;
	$<HTMLInputElement>('film-cover').value = '';
	$<HTMLInputElement>('film-cover').required = !film;
	$('film-submit').textContent = film ? '저장' : '추가';
}

function closeFilmForm() {
	$<HTMLFormElement>('film-form').hidden = true;
	$<HTMLFormElement>('film-form').reset();
}

$('film-add-toggle').addEventListener('click', () => {
	const form = $<HTMLFormElement>('film-form');
	if (form.hidden) openFilmForm();
	else closeFilmForm();
});
$('film-cancel').addEventListener('click', closeFilmForm);

$('film-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const editingSlug = $<HTMLInputElement>('film-editing-slug').value;
	const isNew = !editingSlug;
	const slug = isNew ? slugify($<HTMLInputElement>('film-slug').value) : editingSlug;
	const title = $<HTMLInputElement>('film-title').value.trim();
	const description = $<HTMLInputElement>('film-description').value.trim();
	const role = $<HTMLInputElement>('film-role').value.trim();
	const youtubeId = extractYoutubeId($<HTMLInputElement>('film-youtube').value.trim());
	const coverFile = $<HTMLInputElement>('film-cover').files?.[0];

	if (!slug) {
		$('film-error').hidden = false;
		$('film-error').textContent = 'slug을 입력해주세요.';
		return;
	}
	if (isNew && films.some((f) => f.slug === slug)) {
		$('film-error').hidden = false;
		$('film-error').textContent = '이미 존재하는 slug입니다.';
		return;
	}

	const submitBtn = $<HTMLButtonElement>('film-submit');
	submitBtn.disabled = true;
	submitBtn.textContent = '저장 중...';
	try {
		const existing = films.find((f) => f.slug === slug);
		let coverPath = existing?.coverPath ?? `src/assets/films/${slug}.jpg`;
		let coverSha = existing?.coverSha ?? undefined;

		if (coverFile) {
			const base64 = await resizeImageToBase64(coverFile);
			await putBinaryFile(token, coverPath, base64, `admin: ${isNew ? 'add' : 'update'} cover for ${slug}`, coverSha);
		} else if (isNew) {
			throw new Error('커버 이미지를 선택해주세요.');
		}

		const order = existing?.order ?? (films.length ? Math.max(...films.map((f) => f.order)) + 1 : 1);
		const text = serializeFrontmatter({
			title,
			description: description || undefined,
			role: role || undefined,
			youtubeId,
			cover: `../../assets/films/${coverPath.split('/').pop()}`,
			order,
		});
		await putTextFile(
			token,
			`src/content/films/${slug}.md`,
			text,
			`admin: ${isNew ? 'add' : 'update'} film ${slug}`,
			existing?.sha,
		);

		toast(isNew ? '필모를 추가했습니다. 1-2분 후 사이트에 반영됩니다.' : '필모를 수정했습니다.');
		closeFilmForm();
		await loadFilms();
	} catch (e) {
		$('film-error').hidden = false;
		$('film-error').textContent = friendlyError(e);
	} finally {
		submitBtn.disabled = false;
	}
});

async function deleteFilm(film: FilmItem) {
	if (!confirm(`"${film.title || film.slug}" 필모를 삭제할까요? 되돌릴 수 없습니다.`)) return;
	try {
		toast('삭제 중...');
		await deleteFile(token, `src/content/films/${film.slug}.md`, `admin: delete film ${film.slug}`, film.sha);
		if (film.coverSha) {
			await deleteFile(token, film.coverPath, `admin: delete cover for ${film.slug}`, film.coverSha);
		}
		toast('삭제했습니다.');
		await loadFilms();
	} catch (e) {
		toast(friendlyError(e), true);
	}
}

// ---------- people / snap ----------

async function loadPeople() {
	const mdFiles = await listDir(token, 'src/content/people');
	const prevOpen = new Set(people.filter((p) => p.open).map((p) => p.slug));
	people = await Promise.all(
		mdFiles
			.filter((f) => f.name.endsWith('.md'))
			.map(async (f) => {
				const slug = f.name.replace(/\.md$/, '');
				const file = await getFileText(token, f.path);
				const { data } = parseFrontmatter(file?.text ?? '');
				return {
					slug,
					sha: file?.sha ?? f.sha,
					name: String(data.name ?? ''),
					nameEn: String(data.nameEn ?? ''),
					order: Number(data.order ?? 0),
					photos: null,
					open: prevOpen.has(slug),
				};
			}),
	);
	people.sort((a, b) => a.order - b.order);
	await Promise.all(people.filter((p) => p.open).map(loadPersonPhotos));
	renderPeople();
}

async function loadPersonPhotos(person: PersonItem) {
	const files = await listDir(token, `src/assets/snap/${person.slug}`);
	person.photos = files
		.filter((f) => f.downloadUrl)
		.map((f) => ({ name: f.name, path: f.path, sha: f.sha, downloadUrl: f.downloadUrl! }))
		.sort((a, b) => a.name.localeCompare(b.name));
}

function renderPeople() {
	$('people-count').textContent = `${people.length}명`;
	const list = $('people-list');
	list.innerHTML = people
		.map((p, i) => {
			const thumb = p.photos?.[0]?.downloadUrl;
			return `
		<div class="item-row-wrap" data-slug="${escapeHtml(p.slug)}">
			<div class="item-row">
				${thumb ? `<img class="item-thumb" src="${escapeHtml(thumb)}" alt="" />` : '<div class="item-thumb"></div>'}
				<div class="item-main">
					<div class="item-title">${escapeHtml(p.name || p.slug)}</div>
					<div class="item-sub">${p.photos ? `사진 ${p.photos.length}장` : '사진 보기'}</div>
				</div>
				<div class="item-actions">
					<button type="button" data-act="up" ${i === 0 ? 'disabled' : ''}>▲</button>
					<button type="button" data-act="down" ${i === people.length - 1 ? 'disabled' : ''}>▼</button>
					<button type="button" data-act="photos">${p.open ? '사진 닫기' : '사진 관리'}</button>
					<button type="button" data-act="edit">수정</button>
					<button type="button" class="danger" data-act="delete">삭제</button>
				</div>
			</div>
			<div class="photo-panel ${p.open ? 'open' : ''}" data-photo-panel>
				${p.open ? renderPhotoPanel(p) : ''}
			</div>
		</div>`;
		})
		.join('');
}

function renderPhotoPanel(person: PersonItem): string {
	const photos = person.photos ?? [];
	return `
		<div class="photo-grid">
			${photos
				.map(
					(photo, i) => `
				<div class="photo-cell" data-photo="${escapeHtml(photo.name)}">
					<img src="${escapeHtml(photo.downloadUrl)}" alt="" />
					<div class="photo-cell-actions">
						<button type="button" data-photo-act="up" ${i === 0 ? 'disabled' : ''}>◀</button>
						<button type="button" data-photo-act="down" ${i === photos.length - 1 ? 'disabled' : ''}>▶</button>
						<button type="button" class="danger" data-photo-act="delete">✕</button>
					</div>
				</div>`,
				)
				.join('')}
		</div>
		<input type="file" accept="image/*" multiple data-photo-upload />
	`;
}

$('people-list').addEventListener('click', async (e) => {
	const target = e.target as HTMLElement;
	const wrap = target.closest<HTMLElement>('.item-row-wrap');
	if (!wrap) return;
	const slug = wrap.dataset.slug!;
	const person = people.find((p) => p.slug === slug);
	if (!person) return;

	const photoBtn = target.closest<HTMLButtonElement>('button[data-photo-act]');
	if (photoBtn) return handlePhotoAction(person, photoBtn.dataset.photoAct!, photoBtn.closest<HTMLElement>('.photo-cell')?.dataset.photo);

	const btn = target.closest<HTMLButtonElement>('button[data-act]');
	if (!btn) return;
	if (btn.dataset.act === 'edit') return openPersonForm(person);
	if (btn.dataset.act === 'delete') return deletePerson(person);
	if (btn.dataset.act === 'up' || btn.dataset.act === 'down') return swapPersonOrder(person, btn.dataset.act === 'up' ? -1 : 1);
	if (btn.dataset.act === 'photos') return togglePhotoPanel(person);
});

$('people-list').addEventListener('change', async (e) => {
	const input = e.target as HTMLInputElement;
	if (!input.matches('[data-photo-upload]')) return;
	const wrap = input.closest<HTMLElement>('.item-row-wrap');
	const person = people.find((p) => p.slug === wrap?.dataset.slug);
	if (!person || !input.files?.length) return;
	await uploadPhotos(person, Array.from(input.files));
});

async function togglePhotoPanel(person: PersonItem) {
	person.open = !person.open;
	if (person.open && !person.photos) {
		toast('사진 불러오는 중...');
		await loadPersonPhotos(person);
	}
	renderPeople();
}

async function handlePhotoAction(person: PersonItem, act: string, photoName?: string) {
	const photos = person.photos;
	if (!photos || !photoName) return;
	const idx = photos.findIndex((p) => p.name === photoName);
	if (idx < 0) return;

	if (act === 'delete') {
		if (!confirm('이 사진을 삭제할까요?')) return;
		try {
			toast('삭제 중...');
			await deleteFile(token, photos[idx].path, `admin: delete photo ${photos[idx].name} (${person.slug})`, photos[idx].sha);
			await loadPersonPhotos(person);
			renderPeople();
			toast('삭제했습니다.');
		} catch (e) {
			toast(friendlyError(e), true);
		}
		return;
	}

	const dir = act === 'up' ? -1 : 1;
	const otherIdx = idx + dir;
	if (otherIdx < 0 || otherIdx >= photos.length) return;
	try {
		toast('순서 저장 중...');
		await swapPhotoContent(photos[idx], photos[otherIdx], person.slug);
		await loadPersonPhotos(person);
		renderPeople();
		toast('순서를 저장했습니다.');
	} catch (e) {
		toast(friendlyError(e), true);
	}
}

async function swapPhotoContent(a: PhotoItem, b: PhotoItem, slug: string) {
	const [aContent, bContent] = await Promise.all([getFileBase64(a.downloadUrl), getFileBase64(b.downloadUrl)]);
	await putBinaryFile(token, a.path, bContent, `admin: reorder photos (${slug})`, a.sha);
	await putBinaryFile(token, b.path, aContent, `admin: reorder photos (${slug})`, b.sha);
}

async function uploadPhotos(person: PersonItem, files: File[]) {
	const photos = person.photos ?? [];
	let nextIndex = photos.reduce((max, p) => {
		const n = parseInt(p.name, 10);
		return Number.isFinite(n) ? Math.max(max, n) : max;
	}, 0) + 1;

	toast(`사진 ${files.length}장 업로드 중...`);
	try {
		for (const file of files) {
			const base64 = await resizeImageToBase64(file);
			const name = String(nextIndex).padStart(2, '0') + '.jpg';
			await putBinaryFile(token, `src/assets/snap/${person.slug}/${name}`, base64, `admin: add photo ${name} (${person.slug})`);
			nextIndex++;
		}
		await loadPersonPhotos(person);
		renderPeople();
		toast('업로드를 완료했습니다.');
	} catch (e) {
		toast(friendlyError(e), true);
	}
}

async function swapPersonOrder(person: PersonItem, dir: -1 | 1) {
	const idx = people.indexOf(person);
	const otherIdx = idx + dir;
	if (otherIdx < 0 || otherIdx >= people.length) return;
	const other = people[otherIdx];
	const [a, b] = [person.order, other.order];
	try {
		toast('순서 저장 중...');
		await Promise.all([savePersonOrder(person, b), savePersonOrder(other, a)]);
		person.order = b;
		other.order = a;
		people.sort((x, y) => x.order - y.order);
		renderPeople();
		toast('순서를 저장했습니다.');
	} catch (e) {
		toast(friendlyError(e), true);
	}
}

async function savePersonOrder(person: PersonItem, order: number) {
	const text = serializeFrontmatter({
		name: person.name,
		nameEn: person.nameEn || undefined,
		slug: person.slug,
		order,
	});
	await putTextFile(token, `src/content/people/${person.slug}.md`, text, `admin: reorder ${person.slug}`, person.sha);
}

function openPersonForm(person?: PersonItem) {
	const form = $<HTMLFormElement>('person-form');
	form.hidden = false;
	form.scrollIntoView({ behavior: 'smooth', block: 'center' });
	$('person-error').hidden = true;
	$<HTMLInputElement>('person-editing-slug').value = person?.slug ?? '';
	$<HTMLInputElement>('person-name').value = person?.name ?? '';
	$<HTMLInputElement>('person-name-en').value = person?.nameEn ?? '';
	$<HTMLInputElement>('person-slug').value = person?.slug ?? '';
	$<HTMLInputElement>('person-slug').disabled = !!person;
	$('person-slug-row').hidden = !!person;
	$('person-submit').textContent = person ? '저장' : '추가';
}

function closePersonForm() {
	$<HTMLFormElement>('person-form').hidden = true;
	$<HTMLFormElement>('person-form').reset();
}

$('person-add-toggle').addEventListener('click', () => {
	const form = $<HTMLFormElement>('person-form');
	if (form.hidden) openPersonForm();
	else closePersonForm();
});
$('person-cancel').addEventListener('click', closePersonForm);

$('person-form').addEventListener('submit', async (e) => {
	e.preventDefault();
	const editingSlug = $<HTMLInputElement>('person-editing-slug').value;
	const isNew = !editingSlug;
	const slug = isNew ? slugify($<HTMLInputElement>('person-slug').value) : editingSlug;
	const name = $<HTMLInputElement>('person-name').value.trim();
	const nameEn = $<HTMLInputElement>('person-name-en').value.trim();

	if (!slug || !name) {
		$('person-error').hidden = false;
		$('person-error').textContent = '이름과 slug을 입력해주세요.';
		return;
	}
	if (isNew && people.some((p) => p.slug === slug)) {
		$('person-error').hidden = false;
		$('person-error').textContent = '이미 존재하는 slug입니다.';
		return;
	}

	const submitBtn = $<HTMLButtonElement>('person-submit');
	submitBtn.disabled = true;
	submitBtn.textContent = '저장 중...';
	try {
		const existing = people.find((p) => p.slug === slug);
		const order = existing?.order ?? (people.length ? Math.max(...people.map((p) => p.order)) + 1 : 1);
		const text = serializeFrontmatter({ name, nameEn: nameEn || undefined, slug, order });
		await putTextFile(token, `src/content/people/${slug}.md`, text, `admin: ${isNew ? 'add' : 'update'} person ${slug}`, existing?.sha);
		toast(isNew ? '인물을 추가했습니다. 사진을 등록해주세요.' : '수정했습니다.');
		closePersonForm();
		await loadPeople();
	} catch (e) {
		$('person-error').hidden = false;
		$('person-error').textContent = friendlyError(e);
	} finally {
		submitBtn.disabled = false;
	}
});

async function deletePerson(person: PersonItem) {
	if (!confirm(`"${person.name || person.slug}"과(와) 사진 전체를 삭제할까요? 되돌릴 수 없습니다.`)) return;
	try {
		toast('삭제 중...');
		if (!person.photos) await loadPersonPhotos(person);
		for (const photo of person.photos ?? []) {
			await deleteFile(token, photo.path, `admin: delete photo ${photo.name} (${person.slug})`, photo.sha);
		}
		await deleteFile(token, `src/content/people/${person.slug}.md`, `admin: delete person ${person.slug}`, person.sha);
		toast('삭제했습니다.');
		await loadPeople();
	} catch (e) {
		toast(friendlyError(e), true);
	}
}

// ---------- entry ----------

export function runAdmin() {
	$('logout-btn').addEventListener('click', logout);
	$('token-form').addEventListener('submit', async (e) => {
		e.preventDefault();
		const input = $<HTMLInputElement>('token-input');
		$('auth-error').hidden = true;
		const ok = await tryAuth(input.value.trim());
		if (ok) {
			await Promise.all([loadFilms(), loadPeople()]);
		}
	});

	const saved = localStorage.getItem(TOKEN_KEY);
	if (saved) {
		tryAuth(saved).then((ok) => {
			if (ok) Promise.all([loadFilms(), loadPeople()]);
			else localStorage.removeItem(TOKEN_KEY);
		});
	}
}
