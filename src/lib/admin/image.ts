import { arrayBufferToBase64 } from './github';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/** downscales + re-encodes as JPEG client-side before upload, matching the
 * size discipline the rest of the image pipeline already relies on — phone
 * photos can be 5-10MB, which is wasteful to commit and slow to upload */
export async function resizeImageToBase64(file: File): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
	const width = Math.round(bitmap.width * scale);
	const height = Math.round(bitmap.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('canvas context를 만들 수 없습니다.');
	ctx.drawImage(bitmap, 0, 0, width, height);

	const blob: Blob = await new Promise((resolve, reject) => {
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('이미지 인코딩 실패'))), 'image/jpeg', JPEG_QUALITY);
	});
	const buf = await blob.arrayBuffer();
	return arrayBufferToBase64(buf);
}
