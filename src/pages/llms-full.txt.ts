import type { APIRoute } from 'astro'
import { retrieveLlms } from '@/lib/utils/llms'

export const GET: APIRoute = context => retrieveLlms(context, 'full')
