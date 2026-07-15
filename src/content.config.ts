import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const films = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/films' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			description: z.string(),
			date: z.string().optional(),
			role: z.string().optional(),
			youtubeId: z.string(),
			cover: image(),
			order: z.number().default(0),
		}),
});

const research = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/research' }),
	schema: () =>
		z.object({
			title: z.string(),
			authors: z.string(),
			venue: z.string(),
			date: z.string(),
			doi: z.string().optional(),
			abstract: z.string(),
			pdf: z.string(),
			order: z.number().default(0),
		}),
});

const compositions = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/compositions' }),
	schema: ({ image }) =>
		z.object({
			title: z.string(),
			subtitle: z.string().optional(),
			description: z.string().optional(),
			date: z.string().optional(),
			type: z.enum(['audio', 'video']),
			audio: z.string().optional(),
			youtubeId: z.string().optional(),
			cover: image().optional(),
			order: z.number().default(0),
		}),
});

const people = defineCollection({
	loader: glob({ pattern: '**/*.md', base: './src/content/people' }),
	schema: () =>
		z.object({
			name: z.string(),
			nameEn: z.string().optional(),
			slug: z.string(),
			bio: z.string().optional(),
			date: z.string().optional(),
			order: z.number().default(0),
		}),
});

export const collections = { films, research, compositions, people };
