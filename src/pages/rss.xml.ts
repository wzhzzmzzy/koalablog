import type { APIRoute } from 'astro'
import { retriveRss } from '@/lib/utils/rss'

export const GET: APIRoute = context => retriveRss(context)
